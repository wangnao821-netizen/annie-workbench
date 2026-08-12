"""Unified email AI analyzer — Phase 2A Layer 1.

Replaces the inline AI summary call in inbox_service.py with a structured
JSON analysis that extracts: summary, action_type, stage_signal, deadline,
conditions, urgency_score, client_name, lender_name, application_ref.

Flow:
    1. Load prompt template from config/email_analysis_prompt.yaml
    2. Desensitize email content via pii_gateway
    3. Call LLM (Gemini Flash primary, DeepSeek fallback)
    4. Parse JSON response
    5. Validate field values
    6. Fallback to plain-text summary on any failure

Red Line compliance:
    - All text sent to AI is desensitized (pii_gateway.desensitize)
    - PiiLeakDetector provides second-line defense (inside ApiGateway)
    - Failures are non-blocking — email ingestion always succeeds
    - pii_map never leaves internal network
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from pathlib import Path as _Path
def get_project_root() -> _Path:
    """返回项目根目录（从 core/inbox/ai_analyzer.py 向上 3 层）。"""
    return _Path(__file__).resolve().parent.parent.parent
from core.logger import get_logger

logger = get_logger(__name__)

# Project root for locating config files
_PROMPT_CONFIG_PATH = get_project_root() / "config" / "email_analysis_prompt.yaml"
_STAGE_SIGNALS_PATH = get_project_root() / "config" / "stage_signals.yaml"
_EMAIL_CATEGORIES_PATH = get_project_root() / "config" / "email_categories.yaml"

# Valid enum values for field validation
_VALID_ACTION_TYPES = frozenset({
    "需提供文件", "需回复", "需确认", "需递交", "仅通知", "需跟进",
})
_VALID_SUGGESTED_LEVELS = frozenset({
    "urgent", "business", "low_priority",
})


@dataclass
class EmailAnalysisResult:
    """AI 统一分析的结构化结果。

    Attributes:
        summary: 三行格式中文摘要。
        client_name: AI 识别到的客户姓名。
        action_type: 动作类型枚举。
        stage_signal: 阶段信号标识。
        deadline: AI 识别的截止日期。
        conditions: 银行条件列表。
        urgency_score: 紧急度评分 1-10。
        suggested_level: AI 建议的优先级。
        lender_name: 识别到的银行名。
        application_ref: 申请参考号。
        category: 邮件分类码（bank_os / valuation / ...）。
        raw_json: 原始 JSON 响应（调试用）。
        is_fallback: 是否为降级模式。
    """

    summary: str | None = None
    client_name: str | None = None
    action_type: str | None = None
    stage_signal: str | None = None
    deadline: date | None = None
    conditions: list[str] = field(default_factory=list)
    urgency_score: int | None = None
    suggested_level: str | None = None
    lender_name: str | None = None
    application_ref: str | None = None
    category: str | None = None
    raw_json: dict[str, Any] | None = None
    is_fallback: bool = False


# ── Config Loading ────────────────────────────────────────────────────


def _load_prompt_config() -> dict[str, Any]:
    """Load the email analysis prompt configuration from YAML.

    Returns:
        Dict with 'system_prompt' and 'user_prompt_template' keys.

    Raises:
        FileNotFoundError: If config file doesn't exist.
        yaml.YAMLError: If config file is malformed.
    """
    # TODO(Phase 2A): 加 file mtime 缓存，避免每次读磁盘
    with open(_PROMPT_CONFIG_PATH, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    if not config or "user_prompt_template" not in config:
        raise ValueError("Invalid prompt config: missing user_prompt_template")

    return config


def _load_valid_stage_signals() -> set[str]:
    """Load valid stage signal names from config.

    Returns:
        Set of valid signal names (e.g. {'bank_mir', 'approved', ...}).
    """
    try:
        with open(_STAGE_SIGNALS_PATH, encoding="utf-8") as f:
            config = yaml.safe_load(f)
        if config and "stage_signals" in config:
            return set(config["stage_signals"].keys())
    except (FileNotFoundError, yaml.YAMLError) as exc:
        logger.warning("Failed to load stage_signals.yaml: %s", exc)
    return set()


def _load_valid_categories() -> dict[str, str]:
    """Load email category codes and Chinese labels from config.

    Returns:
        Dict mapping category code -> Chinese label
        (e.g. {"bank_os": "银行补件", ...}).
    """
    try:
        with open(_EMAIL_CATEGORIES_PATH, encoding="utf-8") as f:
            config = yaml.safe_load(f)
        if config and "email_categories" in config:
            cats = config["email_categories"]
            if isinstance(cats, dict):
                return {
                    str(code): str((meta or {}).get("label", code))
                    for code, meta in cats.items()
                }
    except (FileNotFoundError, yaml.YAMLError) as exc:
        logger.warning("Failed to load email_categories.yaml: %s", exc)
    return {}


# ── AI Call (internal, mockable for tests) ────────────────────────────


def _call_ai(
    desensitized_text: str,
    system_prompt: str,
) -> str:
    """Call the LLM via ApiGateway.

    This is a thin wrapper around ApiGateway.call_llm to make it
    easily mockable in tests.

    Args:
        desensitized_text: The already-desensitized prompt text.
        system_prompt: System instructions for the LLM.

    Returns:
        Raw response text from the LLM.

    Raises:
        Various exceptions from ApiGateway on failure.
    """
    from core.ai.gateway import ApiGateway
    from core.config import load_config
    from core.models.types import DesensitizedText

    config = load_config()
    gateway = ApiGateway(config)

    # Wrap the pre-desensitized text as DesensitizedText (type safety)
    safe_text = DesensitizedText(desensitized_text)

    result = gateway.call_llm(
        text=safe_text,
        prompt_template="{text}",
        system_prompt=system_prompt,
    )
    return result.response_text


# ── JSON Parsing & Validation ─────────────────────────────────────────


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from AI response.

    Handles ```json ... ``` and ``` ... ``` patterns.

    Args:
        text: Raw AI response text.

    Returns:
        Cleaned text with fences removed.
    """
    text = text.strip()
    if text.startswith("```"):
        # Remove opening fence (with optional language tag)
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        else:
            text = text[3:]
        # Remove closing fence
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()
    return text


def _validate_and_build_result(data: dict[str, Any]) -> EmailAnalysisResult:
    """Validate AI JSON output and build a structured result.

    Applies field-level validation:
    - actionType must be in valid set
    - stageSignal must be in config or None
    - deadline must be valid date format
    - urgencyScore must be 1-10
    - suggestedLevel must be in valid set

    Args:
        data: Parsed JSON dict from AI response.

    Returns:
        Validated EmailAnalysisResult.
    """
    # summary — accept as-is if string
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = None

    # clientName
    client_name = data.get("clientName")
    if not isinstance(client_name, str) or not client_name.strip():
        client_name = None

    # actionType — validate against known values
    action_type = data.get("actionType")
    if action_type not in _VALID_ACTION_TYPES:
        action_type = None

    # stageSignal — validate against config
    stage_signal = data.get("stageSignal")
    valid_signals = _load_valid_stage_signals()
    if stage_signal and stage_signal not in valid_signals:
        logger.debug("Unknown stage_signal '%s', setting to None", stage_signal)
        stage_signal = None

    # deadline — parse date string
    deadline: date | None = None
    raw_deadline = data.get("deadline")
    if raw_deadline and isinstance(raw_deadline, str):
        try:
            parsed_date = datetime.strptime(raw_deadline, "%Y-%m-%d").date()
            # Accept any valid date (don't reject past dates — AI may report
            # an already-passed deadline from the email)
            deadline = parsed_date
        except ValueError:
            logger.debug("Invalid deadline format: '%s'", raw_deadline)

    # conditions — must be list of strings
    conditions: list[str] = []
    raw_conditions = data.get("conditions")
    if isinstance(raw_conditions, list):
        conditions = [str(c) for c in raw_conditions if c]

    # urgencyScore — must be int 1-10
    urgency_score: int | None = None
    raw_score = data.get("urgencyScore")
    if raw_score is not None:
        try:
            score = int(raw_score)
            if 1 <= score <= 10:
                urgency_score = score
            else:
                logger.debug("urgencyScore out of range: %d", score)
        except (TypeError, ValueError):
            pass

    # suggestedLevel — validate
    suggested_level = data.get("suggestedLevel")
    if suggested_level not in _VALID_SUGGESTED_LEVELS:
        suggested_level = None

    # category — validate against config whitelist（收件箱分类，邮件预审）
    category = data.get("category")
    valid_categories = _load_valid_categories()
    if isinstance(category, str):
        category_key = category.strip().lower()
        if category_key not in valid_categories:
            logger.debug("Unknown email category '%s', setting to None", category)
            category = None
        else:
            category = category_key
    else:
        category = None

    # lenderName — accept as-is
    lender_name = data.get("lenderName")
    if not isinstance(lender_name, str) or not lender_name.strip():
        lender_name = None

    # applicationRef — accept as-is
    application_ref = data.get("applicationRef")
    if not isinstance(application_ref, str) or not application_ref.strip():
        application_ref = None

    return EmailAnalysisResult(
        summary=summary,
        client_name=client_name,
        action_type=action_type,
        stage_signal=stage_signal,
        deadline=deadline,
        conditions=conditions,
        urgency_score=urgency_score,
        suggested_level=suggested_level,
        lender_name=lender_name,
        application_ref=application_ref,
        category=category,
        raw_json=data,
        is_fallback=False,
    )


# ── Fallback Summary (matches current behavior) ──────────────────────


def _generate_fallback_summary(
    ai_response_text: str | None,
    subject: str,
) -> EmailAnalysisResult:
    """Generate a fallback result when structured analysis fails.

    If the AI returned plain text (non-JSON), use it as the summary.
    Otherwise, return a minimal result.

    Args:
        ai_response_text: Raw AI response (may be plain text).
        subject: Original email subject for context.

    Returns:
        EmailAnalysisResult with is_fallback=True.
    """
    summary = None
    if ai_response_text and ai_response_text.strip():
        # Use the AI's plain text response as summary (capped at 250 chars)
        text = ai_response_text.strip()
        if len(text) <= 250:
            summary = text
        else:
            summary = text[:247] + "..."

    return EmailAnalysisResult(
        summary=summary,
        is_fallback=True,
    )


# ── Main Entry Point ──────────────────────────────────────────────────


def analyze_email(
    subject: str,
    sender: str,
    body_preview: str,
    case_id: str | None,
    db: Session,
) -> EmailAnalysisResult:
    """Perform unified AI analysis on an incoming email.

    This is the single entry point for Phase 2A email analysis.
    Replaces the inline AI summary logic in inbox_service.py.

    Flow:
        1. Load prompt config (YAML)
        2. Desensitize email content (pii_gateway)
        3. Call AI (ApiGateway with fallback)
        4. Parse JSON response
        5. Validate fields
        6. On any failure → fallback to plain text summary

    Args:
        subject: Email subject line.
        sender: Sender display string (e.g. "Name <email>").
        body_preview: Email body (first 500 chars).
        case_id: Associated case ID (for PII token scoping), or None.
        db: SQLAlchemy session.

    Returns:
        EmailAnalysisResult — always returns a result, never raises.
    """
    # Guard: empty input
    if not subject and not body_preview:
        return EmailAnalysisResult(is_fallback=True)

    # Step 1: Load prompt config
    try:
        prompt_config = _load_prompt_config()
    except (FileNotFoundError, ValueError, yaml.YAMLError) as exc:
        logger.warning("Failed to load prompt config: %s", exc)
        return EmailAnalysisResult(is_fallback=True)

    # Step 2: Desensitize email content
    try:
        from core.pii.gateway import desensitize

        # Use case_id for token scoping, or "system" for unmatched emails
        pii_case_id = case_id or "system"

        # Combine subject + sender + body for unified desensitization
        raw_text = f"标题：{subject}\n发件人：{sender}\n正文：\n{(body_preview or '')[:400]}"
        safe_text = desensitize(raw_text, pii_case_id, db)
    except Exception as exc:
        logger.error("Desensitization failed: %s", exc)
        return EmailAnalysisResult(is_fallback=True)

    # Step 3: Build the full prompt and call AI
    ai_response: str | None = None
    try:
        system_prompt = prompt_config.get(
            "system_prompt",
            "你是澳洲贷款经纪公司的邮件分析助手。输出严格JSON格式。"
        )
        user_template = prompt_config["user_prompt_template"]

        # Format the user prompt with desensitized content
        # The template expects {subject}, {sender}, {body}
        # But we've already combined and desensitized, so inject directly
        full_prompt = user_template.replace("{subject}", "").replace(
            "{sender}", ""
        ).replace("{body}", safe_text)

        ai_response = _call_ai(full_prompt, system_prompt)
    except Exception as exc:
        logger.warning("AI call failed (non-blocking): %s", exc)
        return _generate_fallback_summary(None, subject)

    # Step 4: Parse JSON response
    if not ai_response or not ai_response.strip():
        return _generate_fallback_summary(ai_response, subject)

    try:
        cleaned = _strip_markdown_fences(ai_response)
        data = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.debug("JSON parse failed, using fallback: %s", exc)
        return _generate_fallback_summary(ai_response, subject)

    # Step 5: Validate and build result
    if not isinstance(data, dict):
        return _generate_fallback_summary(ai_response, subject)

    result = _validate_and_build_result(data)
    return result
