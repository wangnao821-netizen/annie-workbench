"""WO-09 清单主库 / 预选 / 反向匹配 测试。"""

from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from core.checklist.master_picker import pick_checklist
from core.checklist.reverse_match import match_file_to_checklist_items

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_MASTER_PATH = _PROJECT_ROOT / "config" / "checklist_master.yaml"


def _fake_config() -> SimpleNamespace:
    """只提供 project_root 的最小配置，避免依赖真实环境变量。"""
    return SimpleNamespace(project_root=_PROJECT_ROOT)


@pytest.fixture(autouse=True)
def _stub_config(monkeypatch):
    monkeypatch.setattr("core.checklist.master_picker.get_config", _fake_config)


def _load_items() -> list[dict]:
    data = yaml.safe_load(_MASTER_PATH.read_text(encoding="utf-8"))
    return data["items"]


class TestMasterYaml:
    """checklist_master.yaml 结构契约（§4.2）。"""

    def test_item_count_between_50_80(self):
        items = _load_items()
        assert 50 <= len(items) <= 80, f"items={len(items)}"

    def test_required_fields_present(self):
        required = {"id", "name_zh", "name_en", "category", "aliases", "applicable_when"}
        items = _load_items()
        for it in items:
            assert required.issubset(it), f"{it.get('id')} missing {required - set(it)}"

    def test_unique_ids(self):
        ids = [it["id"] for it in _load_items()]
        assert len(ids) == len(set(ids))

    def test_valid_categories(self):
        allowed = {
            "identity", "income_payg", "income_self_employed",
            "bank_specific", "special", "property", "settlement",
        }
        for it in _load_items():
            assert it["category"] in allowed, it["id"]


class TestPickChecklist:
    """pick_checklist 规则预选。"""

    def test_cba_payg_returns_at_least_10(self, test_db):
        result = pick_checklist({"lender": "CBA", "employment_type": "PAYG"}, test_db, use_ai=False)
        assert len(result) >= 10, f"only {len(result)}"

    def test_result_within_15_25_for_typical_case(self, test_db):
        case_info = {
            "lender": "CBA",
            "employment_type": "PAYG",
            "residency": "PR",
            "purpose": "Purchase",
        }
        result = pick_checklist(case_info, test_db, use_ai=False)
        assert 15 <= len(result) <= 25, f"len={len(result)}"

    def test_result_schema(self, test_db):
        result = pick_checklist({"lender": "CBA", "employment_type": "PAYG"}, test_db, use_ai=False)
        for item in result:
            assert {"id", "name_zh", "required", "reason"} <= set(item)

    def test_bank_specific_filter(self, test_db):
        anz = pick_checklist({"lender": "ANZ", "employment_type": "PAYG"}, test_db, use_ai=False)
        ids = {i["id"] for i in anz}
        assert not any(i.startswith("cba_") for i in ids), ids
        assert any(i.startswith("anz_") for i in ids), ids

    def test_self_employed_includes_special_items(self, test_db):
        result = pick_checklist(
            {"lender": "CBA", "employment_type": "SelfEmployed"}, test_db, use_ai=False
        )
        ids = {i["id"] for i in result}
        assert "accountant_letter" in ids
        assert "tax_return_2yr" in ids
        assert "cba_self_employed_declaration" in ids

    def test_gift_items_require_deposit_source(self, test_db):
        without = pick_checklist({"lender": "CBA"}, test_db, use_ai=False)
        assert "gift_letter" not in {i["id"] for i in without}
        with_gift = pick_checklist(
            {"lender": "CBA", "deposit_source_includes": ["gift"]}, test_db, use_ai=False
        )
        assert "gift_letter" in {i["id"] for i in with_gift}

    def test_ai_failure_falls_back_to_rules(self, test_db, monkeypatch):
        class _FakeGateway:
            def __init__(self, config):
                raise RuntimeError("no LLM in test")

        monkeypatch.setattr("core.checklist.master_picker.ApiGateway", _FakeGateway)
        result = pick_checklist(
            {"lender": "CBA", "employment_type": "PAYG"}, test_db, use_ai=True
        )
        assert 15 <= len(result) <= 25


class TestReverseMatch:
    """match_file_to_checklist_items 反向匹配。"""

    def test_payslip_filename_matches(self, test_db):
        result = match_file_to_checklist_items(
            "Payslip_Jul.pdf", "payslip", [], test_db
        )
        assert "payslip_2" in result, result

    def test_classifier_label_matches(self, test_db):
        result = match_file_to_checklist_items(
            "doc.pdf", "BankStatement", [], test_db
        )
        assert "personal_bank_statement" in result, result

    def test_filtered_by_case_checklist_ids(self, test_db):
        result = match_file_to_checklist_items(
            "Payslip_Jul.pdf", "payslip", ["payslip_2", "visa_grant"], test_db
        )
        assert result == ["payslip_2"]

    def test_no_match_returns_empty(self, test_db):
        result = match_file_to_checklist_items(
            "scan_random_001.pdf", "Unknown", [], test_db
        )
        assert result == []