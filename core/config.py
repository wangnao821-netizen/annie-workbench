"""Configuration loading and validation for loan-assistant.

This module loads all YAML configuration files and validates them using
Pydantic models. It also performs cross-file consistency checks to ensure
that document types, naming rules, checklists, and prompt templates are
aligned.

If any validation fails, ``ConfigError`` is raised — no invalid
configuration is allowed to run. This fails fast at startup.

Configuration files loaded:
    - ``config/settings.yaml`` — global settings (watch, AI, parser, etc.)
    - ``config/document_types.yaml`` — document type registry (single source of truth)
    - ``config/naming_rules.yaml`` — suggested naming templates
    - ``config/checklist/*.yaml`` — case type checklists (Full Doc, Lite Doc, Alt Doc)
    - ``prompts/classify.txt`` — classification prompt (type names extracted for consistency check)

Environment variables:
    - ``CLIENT_FILES_ROOT`` — client files root directory (must exist and be accessible)
    - ``GEMINI_API_KEY`` / ``DEEPSEEK_API_KEY`` — AI provider API keys
      (checked for existence only, never stored)
    - ``ENV`` — ``development`` or ``production`` (affects key validation strictness)
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError, field_validator

from core.logger import get_logger

logger = get_logger(__name__)


def get_data_dir(project_root: Path) -> Path:
    """返回项目运行时数据目录（默认 project_root/data，可用 DATA_DIR 覆盖）。

    v1.16.13：全局邮件缓冲（_Inbox / _PendingClassification）从 NAS 客户根目录
    迁到本地数据目录，避免敏感缓冲暴露在共享盘。
    """
    env = os.getenv("DATA_DIR")
    if env:
        p = Path(env)
        return p if p.is_absolute() else project_root / p
    return project_root / "data"


def get_email_buffer_root(project_root: Path) -> Path:
    """全局邮件缓冲根目录（默认本地 data 目录；可用 EMAIL_BUFFER_ROOT 覆盖，如 D:\\）。

    v1.16.13：_Inbox / _PendingClassification 缓冲不放 NAS 客户根目录，
    Vera 可将 EMAIL_BUFFER_ROOT 指向本地数据盘根目录（如 D:\\）。
    """
    env = os.getenv("EMAIL_BUFFER_ROOT")
    if env:
        p = Path(env)
        return p if p.is_absolute() else project_root / p
    return get_data_dir(project_root)


# ---------------------------------------------------------------------------
# Pydantic models for configuration validation
# ---------------------------------------------------------------------------


class DocumentTypeConfig(BaseModel):
    """Configuration for a single document type."""

    category: str
    description: str
    allowed_extensions: list[str]
    naming_key: str | None
    confidence_threshold: float = Field(ge=0.0, le=1.0)
    expiry_policy: str
    cloud_classification: bool


class DocumentTypesConfig(BaseModel):
    """Document type registry — the single source of truth."""

    types: dict[str, DocumentTypeConfig]
    categories: list[str]

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v: list[str]) -> list[str]:
        """Ensure the categories list is not empty."""
        if not v:
            raise ValueError("categories list cannot be empty")
        return v


class AiProviderConfig(BaseModel):
    """AI provider configuration."""

    provider: str
    model: str
    api_key_env: str
    base_url: str | None = None


class AiRoutingConfig(BaseModel):
    """AI 模型路由配置（WO-26b：DeepSeek 默认主力 / Gemini 仅英文写作可选）。"""

    default_provider: str = "deepseek"
    english_task_prefixes: list[str] = Field(
        default_factory=lambda: ["写一封", "写英文", "draft an email", "broker note", "翻译", "translate"]
    )
    gemini_timeout_seconds: int = Field(default=8, ge=1)
    gemini_skip_after_failures: int = Field(default=3, ge=1)
    gemini_skip_seconds: int = Field(default=600, ge=1)
    intent_routing_enabled: bool = True   # WO-30：规则撞车时 LLM 选流程包


class AiConfig(BaseModel):
    """AI API configuration."""

    primary: AiProviderConfig
    fallback: AiProviderConfig | None = None
    max_retries: int = Field(ge=0, le=10)
    timeout_seconds: int = Field(gt=0)
    confidence_threshold: float = Field(ge=0.0, le=1.0)
    routing: AiRoutingConfig = Field(default_factory=AiRoutingConfig)


class WatchConfig(BaseModel):
    """File watching configuration."""

    root_path: str
    poll_interval_seconds: float = Field(gt=0)
    file_stable_seconds: float = Field(gt=0)
    ignore_patterns: list[str]


class ParserConfig(BaseModel):
    """Document parser configuration."""

    engine: str
    min_text_chars: int = Field(ge=0)
    max_file_size_mb: int = Field(gt=0)
    compress_dpi: int = Field(gt=0)
    msg_recursion_limit: int = Field(gt=0)


class TemplatePatternsConfig(BaseModel):
    """Template file identification patterns."""

    filename_keywords: list[str]
    path_keywords: list[str]
    exact_filenames: list[str]


class DatabaseConfig(BaseModel):
    """Database configuration."""

    path: str


class LoggingConfig(BaseModel):
    """Logging configuration."""

    level: str
    file: str
    max_size_mb: int = Field(gt=0)
    backup_count: int = Field(ge=0)


class ReportConfig(BaseModel):
    """Report configuration."""

    language: str
    output_dir: str
    expiry_warning_days: int = Field(ge=0)


class WechatConfig(BaseModel):
    """微信 iLink Bot 配置（Spec D）。"""

    enabled: bool = False
    bot_token_env: str = "WECHAT_BOT_TOKEN"  # env 变量名，非密钥本身
    base_url: str = "https://ilinkai.weixin.qq.com/ilink/bot"
    poll_timeout_seconds: int = Field(default=55, gt=0)
    reply_max_length: int = Field(default=2000, gt=0)
    typing_enabled: bool = True
    allowed_senders: list[str] = Field(default_factory=list)


class CaseFolderAutoDiscoverConfig(BaseModel):
    """三档渐进第 1 档：新文件自动发现（WO-31）。"""

    enabled: bool = False
    interval_minutes: int = Field(default=10, ge=1)
    confidence_threshold: float = Field(default=0.8, ge=0.0, le=1.0)


class CaseFolderConfig(BaseModel):
    """案件文件夹三档渐进配置（WO-31/32/33；每档独立开关，默认关闭）。"""

    auto_discover: CaseFolderAutoDiscoverConfig = Field(default_factory=CaseFolderAutoDiscoverConfig)


class SchedulerConfig(BaseModel):
    """后台调度配置（Phase 2 数据保命：备份/委派超期/摘要刷新）。"""

    enabled: bool = True
    backup_time: str = "03:00"                     # 每日备份时刻（HH:MM，Sydney 时区）
    backup_keep_days: int = Field(default=7, ge=1)
    overdue_interval_minutes: int = Field(default=30, ge=5)
    summary_interval_hours: int = Field(default=1, ge=1)
    summary_batch_limit: int = Field(default=20, ge=1)


class SettingsConfig(BaseModel):
    """Root settings configuration."""

    watch: WatchConfig
    template_patterns: TemplatePatternsConfig
    ai: AiConfig
    parser: ParserConfig
    database: DatabaseConfig
    logging: LoggingConfig
    report: ReportConfig
    wechat: WechatConfig = Field(default_factory=WechatConfig)
    scheduler: SchedulerConfig = Field(default_factory=SchedulerConfig)
    case_folder: CaseFolderConfig = Field(default_factory=CaseFolderConfig)


# ---------------------------------------------------------------------------
# Exception
# ---------------------------------------------------------------------------


class ConfigError(Exception):
    """Raised when configuration is invalid or inconsistent.

    This is a fatal error — the program should exit if this is raised
    during startup. No invalid configuration should be allowed to run.
    """


# ---------------------------------------------------------------------------
# ConfigLoader
# ---------------------------------------------------------------------------


# Placeholder values that indicate an API key has not been set
_PLACEHOLDER_VALUES = frozenset({
    "",
    "your_gemini_api_key_here",
    "your_deepseek_api_key_here",
    "your_openai_api_key_here",
})


class ConfigLoader:
    """Loads and validates all project configuration.

    This class loads YAML config files, validates them with Pydantic,
    and performs cross-file consistency checks. If any check fails,
    ``ConfigError`` is raised.

    Usage::

        config = ConfigLoader()
        config.settings.watch.root_path          # → client files root
        config.document_types.types["Passport"]  # → DocumentTypeConfig
        config.naming_rules["rules"]["Passport"] # → naming template

    Attributes:
        project_root: Project root directory.
        config_dir: Path to the ``config/`` directory.
        settings: Validated ``SettingsConfig`` instance.
        document_types: Validated ``DocumentTypesConfig`` instance.
        naming_rules: Raw naming rules dict.
        checklists: Dict of checklist name → raw checklist dict.
        classify_types: Set of type names found in classify.txt.
    """

    def __init__(
        self,
        config_dir: Path | None = None,
        project_root: Path | None = None,
    ) -> None:
        """Initialize and load all configuration.

        Args:
            config_dir: Path to the config directory.
                Defaults to ``<project_root>/config``.
            project_root: Project root directory.
                Defaults to the parent of this file's parent.

        Raises:
            ConfigError: If any configuration is invalid or inconsistent.
        """
        self.project_root = project_root or Path(__file__).resolve().parent.parent
        self.config_dir = config_dir or self.project_root / "config"

        # Load .env file
        env_path = self.project_root / ".env"
        if env_path.exists():
            load_dotenv(env_path)

        # Results (populated by _load_all)
        self._settings: SettingsConfig | None = None
        self.document_types: DocumentTypesConfig | None = None
        self.naming_rules: dict[str, Any] = {}
        self.checklists: dict[str, dict[str, Any]] = {}
        self.classify_types: set[str] = set()

        self._load_all()

    @property
    def data_dir(self) -> Path:
        """项目本地数据目录（数据库/日志/邮件缓冲等，绝不放 NAS）。"""
        return get_data_dir(self.project_root)

    @property
    def email_buffer_root(self) -> Path:
        """全局邮件缓冲根目录（_Inbox / _PendingClassification 的父目录）。"""
        return get_email_buffer_root(self.project_root)

    # -- Public accessors --------------------------------------------------

    @property
    def settings(self) -> SettingsConfig:
        """Return the validated SettingsConfig."""
        if self._settings is None:
            raise RuntimeError("ConfigLoader not initialized")
        return self._settings

    @property
    def client_files_root(self) -> Path:
        """Return the validated CLIENT_FILES_ROOT path."""
        if self._settings is None:
            raise RuntimeError("ConfigLoader not initialized")
        return Path(self._settings.watch.root_path)

    @property
    def allowed_doc_types(self) -> set[str]:
        """Return the set of all registered document type names."""
        if self.document_types is None:
            raise RuntimeError("ConfigLoader not initialized")
        return set(self.document_types.types.keys())

    # -- Loading -----------------------------------------------------------

    def _load_yaml(self, relative_path: str) -> dict[str, Any]:
        """Load a YAML file from the config directory.

        Args:
            relative_path: Path relative to ``config_dir``.

        Returns:
            Parsed YAML content as a dictionary.

        Raises:
            ConfigError: If the file cannot be read or parsed.
        """
        file_path = self.config_dir / relative_path
        if not file_path.exists():
            raise ConfigError(f"Config file not found: {file_path}")
        try:
            with file_path.open(encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise ConfigError(f"YAML parse error in {file_path}: {e}") from e
        if not isinstance(data, dict):
            raise ConfigError(
                f"Expected dict in {file_path}, got {type(data).__name__}"
            )
        return data

    def _load_all(self) -> None:
        """Load and validate all configuration files."""
        # 1. settings.yaml
        settings_raw = self._load_yaml("settings.yaml")
        # Substitute env var placeholder for root_path
        client_root = os.getenv("CLIENT_FILES_ROOT", "")
        settings_raw["watch"]["root_path"] = client_root
        try:
            self._settings = SettingsConfig(**settings_raw)
        except ValidationError as e:
            raise ConfigError(f"settings.yaml validation failed:\n{e}") from e

        # 2. document_types.yaml
        doc_types_raw = self._load_yaml("document_types.yaml")
        try:
            self.document_types = DocumentTypesConfig(**doc_types_raw)
        except ValidationError as e:
            raise ConfigError(
                f"document_types.yaml validation failed:\n{e}"
            ) from e

        # 3. naming_rules.yaml
        self.naming_rules = self._load_yaml("naming_rules.yaml")

        # 4. checklist files
        checklist_dir = self.config_dir / "checklist"
        if checklist_dir.exists():
            for checklist_file in sorted(checklist_dir.glob("*.yaml")):
                self.checklists[checklist_file.stem] = self._load_yaml(
                    f"checklist/{checklist_file.name}"
                )

        # 5. classify.txt — extract type names for consistency check
        classify_path = self.project_root / "prompts" / "classify.txt"
        if classify_path.exists():
            self.classify_types = self._parse_classify_types(classify_path)

        # 6. Cross-file consistency
        self._validate_consistency()

        # 7. CLIENT_FILES_ROOT accessible
        self._validate_client_files_root()

        # 8. AI API key env vars (warn in dev, error in production)
        self._validate_ai_keys()

        logger.info("Configuration loaded and validated successfully")

    # -- Consistency checks ------------------------------------------------

    def _parse_classify_types(self, path: Path) -> set[str]:
        """Extract document type names from classify.txt prompt.

        The prompt file lists types in lines like::

            Identity: Passport, DriverLicense, Visa, MedicareCard, VOI
            Income: Payslip, TaxReturn, EmploymentLetter, BAS, AccountantLetter

        This method extracts the type names after the colon.

        Args:
            path: Path to classify.txt.

        Returns:
            Set of type name strings.
        """
        content = path.read_text(encoding="utf-8")
        types: set[str] = set()
        # Match lines like "Category: Type1, Type2, Type3"
        for match in re.finditer(r"^\w+:\s*(.+)$", content, re.MULTILINE):
            type_list = match.group(1)
            for t in type_list.split(","):
                t = t.strip()
                # Only accept capitalized words (type names, not descriptions)
                if t and t[0].isupper() and not t.startswith("("):
                    types.add(t)
        return types

    def _validate_consistency(self) -> None:
        """Perform cross-file consistency checks.

        Checks:
            1. All checklist ``type`` values exist in ``document_types.yaml``.
            2. All ``naming_rules`` keys exist in ``document_types.yaml``.
            3. ``classify.txt`` types match ``document_types.yaml``.

        Raises:
            ConfigError: If any inconsistency is found.
        """
        if self.document_types is None:
            raise RuntimeError("ConfigLoader not initialized")
        doc_type_names = set(self.document_types.types.keys())
        errors: list[str] = []

        # Check 1: checklist types → document_types
        for checklist_name, checklist_data in self.checklists.items():
            required = checklist_data.get("required", {})
            for items in required.values():
                for item in items:
                    item_type = item.get("type")
                    if item_type and item_type not in doc_type_names:
                        errors.append(
                            f"checklist '{checklist_name}' references type "
                            f"'{item_type}' not found in document_types.yaml"
                        )

        # Check 2: naming_rules keys → document_types
        rules = self.naming_rules.get("rules", {})
        for rule_key in rules:
            if rule_key not in doc_type_names:
                errors.append(
                    f"naming_rules.yaml references type '{rule_key}' "
                    f"not found in document_types.yaml"
                )

        # Check 3: classify.txt ↔ document_types (bidirectional)
        if self.classify_types:
            missing_in_doc = self.classify_types - doc_type_names
            if missing_in_doc:
                errors.append(
                    f"classify.txt references types not in document_types.yaml: "
                    f"{', '.join(sorted(missing_in_doc))}"
                )
            # Unknown is a catch-all and may not be listed in classify.txt
            missing_in_prompt = doc_type_names - self.classify_types - {"Unknown"}
            if missing_in_prompt:
                errors.append(
                    f"document_types.yaml has types not in classify.txt: "
                    f"{', '.join(sorted(missing_in_prompt))}"
                )

        if errors:
            raise ConfigError(
                "Configuration consistency check failed:\n  "
                + "\n  ".join(errors)
            )

        logger.info("Configuration consistency check passed")

    def _validate_client_files_root(self) -> None:
        """Validate that CLIENT_FILES_ROOT exists and is accessible.

        Raises:
            ConfigError: If the path is missing, not a directory,
                or not accessible.
        """
        if self.settings is None:
            raise RuntimeError("ConfigLoader not initialized")
        root = self.settings.watch.root_path
        if not root:
            raise ConfigError(
                "CLIENT_FILES_ROOT environment variable is not set. "
                "Please set it in .env file."
            )
        root_path = Path(root)
        if not root_path.exists():
            try:
                root_path.mkdir(parents=True, exist_ok=True)
                logger.info(f"CLIENT_FILES_ROOT automatically created: {root}")
            except Exception:  # noqa: BLE001 — 建目录失败回落兜底路径
                fallback_path = Path(__file__).resolve().parent.parent / "data" / "nas_root"
                fallback_path.mkdir(parents=True, exist_ok=True)
                self._client_files_root = fallback_path
                root_path = fallback_path
                logger.warning(f"CLIENT_FILES_ROOT invalid, auto fallback to: {fallback_path}")
        if not root_path.is_dir():
            raise ConfigError(
                f"CLIENT_FILES_ROOT is not a directory: {root}"
            )
        logger.info(f"CLIENT_FILES_ROOT validated: {root_path}")

    def _validate_ai_keys(self) -> None:
        """Validate that AI API key environment variables exist.

        Checks that the env vars referenced by config exist and are not
        placeholder values. Does NOT store or log the actual key values.

        In development mode: missing keys are logged as warnings.
        In production mode: missing keys raise ``ConfigError``.

        Raises:
            ConfigError: In production mode, if a required key is missing.
        """
        if self.settings is None:
            raise RuntimeError("ConfigLoader not initialized")
        errors: list[str] = []

        primary_env = self.settings.ai.primary.api_key_env
        if primary_env:
            value = os.getenv(primary_env, "")
            if value in _PLACEHOLDER_VALUES:
                errors.append(
                    f"AI primary provider key '{primary_env}' is not set "
                    f"(still placeholder or empty)"
                )

        if self.settings.ai.fallback:
            fallback_env = self.settings.ai.fallback.api_key_env
            if fallback_env:
                value = os.getenv(fallback_env, "")
                if value in _PLACEHOLDER_VALUES:
                    errors.append(
                        f"AI fallback provider key '{fallback_env}' is not set "
                        f"(still placeholder or empty)"
                    )

        if not errors:
            logger.info("AI API keys validated")
            return

        env_mode = os.getenv("ENV", "development")
        if env_mode == "production":
            raise ConfigError(
                "AI API key validation failed (production mode):\n  "
                + "\n  ".join(errors)
            )
        for e in errors:
            logger.warning(e)
        logger.warning(
            "AI API keys not set — running in development mode. "
            "Set keys in .env before using AI features."
        )


# ---------------------------------------------------------------------------
# Module-level convenience function
# ---------------------------------------------------------------------------

def load_config() -> ConfigLoader:
    """Load and validate all configuration, exiting on failure.

    This is the main entry point for configuration loading. If any
    validation fails, it logs the error and exits with code 1.

    Returns:
        A validated ``ConfigLoader`` instance.
    """
    try:
        return ConfigLoader()
    except ConfigError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Bridge functions (replacing old server.deps)
# ---------------------------------------------------------------------------

_cached_config: ConfigLoader | None = None


def get_config() -> ConfigLoader:
    """Get a cached ConfigLoader instance (singleton pattern, replaces server.deps.get_config)."""
    global _cached_config
    if _cached_config is None:
        _cached_config = load_config()
    return _cached_config


def get_project_root() -> Path:
    """Return the project root directory (vera-workbench/)."""
    return Path(__file__).resolve().parent.parent
