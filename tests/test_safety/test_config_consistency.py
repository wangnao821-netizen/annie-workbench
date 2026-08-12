"""Red-line tests for configuration consistency.

These tests verify that all configuration files are aligned:
    1. All checklist ``type`` values exist in ``document_types.yaml``
    2. All ``naming_rules`` keys exist in ``document_types.yaml``
    3. ``classify.txt`` type names match ``document_types.yaml``
    4. ConfigLoader loads and validates successfully

If any of these tests fail, the configuration is inconsistent and
the system should not be allowed to start.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from core.config import ConfigLoader

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_CONFIG_DIR = _PROJECT_ROOT / "config"
_PROMPTS_DIR = _PROJECT_ROOT / "prompts"


def _load_yaml(relative_path: str) -> dict:
    """Load a YAML file from the project config directory."""
    file_path = _CONFIG_DIR / relative_path
    with file_path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    assert isinstance(data, dict), f"Expected dict in {file_path}"
    return data


def _get_doc_type_names() -> set[str]:
    """Get all document type names from document_types.yaml."""
    doc_types = _load_yaml("document_types.yaml")
    return set(doc_types.get("types", {}).keys())


def _get_checklist_types() -> set[str]:
    """Get all type values from all checklist files."""
    types: set[str] = set()
    checklist_dir = _CONFIG_DIR / "checklist"
    for checklist_file in checklist_dir.glob("*.yaml"):
        data = _load_yaml(f"checklist/{checklist_file.name}")
        required = data.get("required", {})
        for items in required.values():
            for item in items:
                item_type = item.get("type")
                if item_type:
                    types.add(item_type)
    return types


def _get_naming_rule_keys() -> set[str]:
    """Get all rule keys from naming_rules.yaml."""
    data = _load_yaml("naming_rules.yaml")
    rules = data.get("rules", {})
    return set(rules.keys())


def _get_classify_types() -> set[str]:
    """Extract document type names from classify.txt."""
    classify_path = _PROMPTS_DIR / "classify.txt"
    content = classify_path.read_text(encoding="utf-8")
    import re

    types: set[str] = set()
    for match in re.finditer(r"^\w+:\s*(.+)$", content, re.MULTILINE):
        for t in match.group(1).split(","):
            t = t.strip()
            if t and t[0].isupper() and not t.startswith("("):
                types.add(t)
    return types


# ---------------------------------------------------------------------------
# Checklist ↔ document_types consistency
# ---------------------------------------------------------------------------


class TestChecklistConsistency:
    """Verify all checklist types exist in document_types.yaml."""

    @pytest.mark.safety
    def test_all_checklist_types_in_document_types(self) -> None:
        """Every type referenced in checklists must exist in document_types.yaml."""
        doc_types = _get_doc_type_names()
        checklist_types = _get_checklist_types()
        missing = checklist_types - doc_types
        assert not missing, (
            f"Checklist references types not in document_types.yaml: {missing}"
        )


# ---------------------------------------------------------------------------
# naming_rules ↔ document_types consistency
# ---------------------------------------------------------------------------


class TestNamingRulesConsistency:
    """Verify all naming_rules keys exist in document_types.yaml."""

    @pytest.mark.safety
    def test_all_naming_keys_in_document_types(self) -> None:
        """Every key in naming_rules must exist in document_types.yaml."""
        doc_types = _get_doc_type_names()
        naming_keys = _get_naming_rule_keys()
        missing = naming_keys - doc_types
        assert not missing, (
            f"naming_rules.yaml has keys not in document_types.yaml: {missing}"
        )


# ---------------------------------------------------------------------------
# classify.txt ↔ document_types consistency
# ---------------------------------------------------------------------------


class TestClassifyPromptConsistency:
    """Verify classify.txt types match document_types.yaml."""

    @pytest.mark.safety
    def test_classify_types_in_document_types(self) -> None:
        """All types in classify.txt must exist in document_types.yaml."""
        doc_types = _get_doc_type_names()
        classify_types = _get_classify_types()
        missing = classify_types - doc_types
        assert not missing, (
            f"classify.txt references types not in document_types.yaml: {missing}"
        )

    @pytest.mark.safety
    def test_document_types_in_classify(self) -> None:
        """All document_types (except Unknown) must appear in classify.txt."""
        doc_types = _get_doc_type_names()
        classify_types = _get_classify_types()
        # Unknown is a catch-all, may not be listed in the prompt
        missing = doc_types - classify_types - {"Unknown"}
        assert not missing, (
            f"document_types.yaml has types not in classify.txt: {missing}"
        )


# ---------------------------------------------------------------------------
# ConfigLoader integration test
# ---------------------------------------------------------------------------


class TestConfigLoaderIntegration:
    """Verify ConfigLoader loads and validates all config successfully."""

    @pytest.mark.safety
    def test_config_loader_loads_successfully(
        self, config_loader: ConfigLoader
    ) -> None:
        """ConfigLoader must initialize without errors."""
        assert config_loader.settings is not None
        assert config_loader.document_types is not None
        assert config_loader.naming_rules is not None
        assert len(config_loader.checklists) > 0

    @pytest.mark.safety
    def test_config_loader_has_document_types(
        self, config_loader: ConfigLoader
    ) -> None:
        """ConfigLoader must load all document types."""
        assert config_loader.document_types is not None
        types = config_loader.document_types.types
        # Verify a few key types exist
        for expected_type in [
            "Passport",
            "Payslip",
            "BankStatement",
            "ContractOfSale",
            "Unknown",
        ]:
            assert expected_type in types, (
                f"Expected type '{expected_type}' missing from config"
            )

    @pytest.mark.safety
    def test_config_loader_client_files_root(
        self, config_loader: ConfigLoader
    ) -> None:
        """ConfigLoader must resolve client_files_root path."""
        root = config_loader.client_files_root
        assert root.exists()
        assert root.is_dir()

    @pytest.mark.safety
    def test_config_loader_allowed_doc_types(
        self, config_loader: ConfigLoader
    ) -> None:
        """ConfigLoader must provide the set of allowed document types."""
        types = config_loader.allowed_doc_types
        assert "Passport" in types
        assert "Unknown" in types
        assert len(types) >= 20  # We have 20+ document types registered


# ---------------------------------------------------------------------------
# fact_schema.yaml ↔ 附录 A（BrainFact 受控词表，WO-15）
# ---------------------------------------------------------------------------


@pytest.mark.safety
def test_fact_schema_matches_appendix_a_count() -> None:
    """fact_schema.yaml 总 key 数 == 42；关键 key 不得遗漏（防止转译遗漏）。"""
    data = _load_yaml("fact_schema.yaml")
    keys = {f"{c}.{k}" for c, v in data["categories"].items() for k in v}
    assert len(keys) == 42
    for required in [
        "identity.full_name",
        "income.monthly_payg",
        "liability.debt",
        "bank.lender",
        "stage.current",
    ]:
        assert required in keys, f"词表缺少关键 key: {required}"
    anchors = {v[k]["anchor"] for c, v in data["categories"].items() for k in v}
    assert anchors <= {"rule", "llm", "llm+rule"}
