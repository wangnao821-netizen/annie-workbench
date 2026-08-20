"""清单测试 — 钉住 matcher 完整性检查与 generator 落库/降级行为。"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from core.checklist.generator import generate_checklist_draft, save_confirmed_checklist
from core.checklist.matcher import CaseNotFoundError, check_completeness
from core.models.orm import Case, CaseChecklist, CaseFile

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# 与 config/checklist/full_doc.yaml 结构对齐的最小清单定义
_FAKE_CHECKLISTS = {
    "full_doc": {
        "required": {
            "identity": [
                {"type": "Passport", "description": "Valid passport"},
                {"type": "Visa", "description": "Visa", "conditional": True},
            ],
            "income": [
                {
                    "type": "Payslip",
                    "description": "Latest 2 payslips",
                    "min_count": 2,
                    "max_age_days": 30,
                }
            ],
        }
    }
}


def _make_config() -> SimpleNamespace:
    """ConfigLoader 替身：只提供 checklists 与 project_root。"""
    return SimpleNamespace(
        checklists=_FAKE_CHECKLISTS,
        project_root=_PROJECT_ROOT,
    )


def _make_case(db, case_id: str = "CASE-CHK-001") -> Case:
    case = Case(id=case_id, client_name="PERSON_1", case_type="full_doc")
    db.add(case)
    db.commit()
    return case


def _make_file(db, case_id: str, file_id: str, doc_type: str, age_days: int = 1) -> CaseFile:
    cf = CaseFile(
        id=file_id,
        case_id=case_id,
        original_name="doc.pdf",
        nas_path="/nas/test/doc.pdf",
        assigned_type=doc_type,
        status="APPROVED",
        created_at=datetime.now(UTC) - timedelta(days=age_days),
    )
    db.add(cf)
    db.commit()
    return cf


class TestMatcherCompleteness:
    """check_completeness 契约。"""

    def test_case_not_found_raises(self, test_db):
        with pytest.raises(CaseNotFoundError):
            check_completeness("CASE-MISSING", test_db, _make_config())

    def test_missing_required_item(self, test_db):
        """没有文件时必需项标记 missing。"""
        _make_case(test_db)
        report = check_completeness("CASE-CHK-001", test_db, _make_config())
        by_type = {i.doc_type: i for i in report.items}
        assert by_type["Passport"].status == "missing"
        assert by_type["Payslip"].status == "missing"
        assert by_type["Passport"].actual_count == 0

    def test_conditional_item_pending_confirm(self, test_db):
        """conditional 项不查文件，直接 pending_confirm。"""
        _make_case(test_db)
        report = check_completeness("CASE-CHK-001", test_db, _make_config())
        visa = next(i for i in report.items if i.doc_type == "Visa")
        assert visa.status == "pending_confirm"
        assert visa.conditional is True

    def test_received_when_file_present(self, test_db):
        """收到匹配类型文件 → received + actual_count。"""
        _make_case(test_db)
        _make_file(test_db, "CASE-CHK-001", "f1", "Passport", age_days=1)
        report = check_completeness("CASE-CHK-001", test_db, _make_config())
        passport = next(i for i in report.items if i.doc_type == "Passport")
        assert passport.status == "received"
        assert passport.actual_count == 1

    def test_expired_old_file(self, test_db):
        """超过 max_age_days → expired。"""
        _make_case(test_db)
        _make_file(test_db, "CASE-CHK-001", "f2", "Payslip", age_days=60)
        report = check_completeness("CASE-CHK-001", test_db, _make_config())
        payslip = next(i for i in report.items if i.doc_type == "Payslip")
        assert payslip.status == "expired"

    def test_summary_counts(self, test_db):
        """summary 汇总各状态数量。"""
        _make_case(test_db)
        report = check_completeness("CASE-CHK-001", test_db, _make_config())
        assert report.summary.get("missing", 0) == 2  # Passport + Payslip
        assert report.summary.get("pending_confirm", 0) == 1  # Visa


class TestGeneratorPersistence:
    """save_confirmed_checklist 落库 + 幂等替换。"""

    def test_saves_items(self, test_db):
        _make_case(test_db)
        items = [
            {"item_name": "护照", "category": "identity", "is_required": True},
            {"item_name": "工资单", "category": "income", "is_required": True, "ai_suggestion": "近2期"},
        ]
        save_confirmed_checklist("CASE-CHK-001", items, test_db)
        rows = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "CASE-CHK-001").all()
        assert len(rows) == 2
        assert rows[0].status == "pending"
        assert rows[0].item_name == "护照"

    def test_resaves_replace_old(self, test_db):
        """重复保存会先删除旧项（Redundancy Protection）。"""
        _make_case(test_db)
        save_confirmed_checklist(
            "CASE-CHK-001",
            [{"item_name": "A", "category": "identity", "is_required": True}],
            test_db,
        )
        save_confirmed_checklist(
            "CASE-CHK-001",
            [{"item_name": "B", "category": "identity", "is_required": True}],
            test_db,
        )
        rows = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "CASE-CHK-001").all()
        assert len(rows) == 1
        assert rows[0].item_name == "B"


class TestGeneratorDraft:
    """generate_checklist_draft 在 LLM 不可用时降级到默认清单。"""

    def test_falls_back_to_default_items(self, test_db, monkeypatch):
        _make_case(test_db)
        monkeypatch.setattr("core.checklist.generator.get_config", _make_config)

        class _FakeGateway:
            def __init__(self, config):
                self.config = config

            def call_llm(self, **kwargs):
                raise RuntimeError("LLM unavailable in test")

        monkeypatch.setattr("core.checklist.generator.ApiGateway", _FakeGateway)

        items = generate_checklist_draft("CASE-CHK-001", test_db)
        # 2026-08-20 起 LLM 失败回退"规则预选清单"（master 项），优于旧默认 3 项
        assert len(items) >= 10
        assert all(i["item_name"] for i in items)

    def test_unknown_case_raises(self, test_db):
        with pytest.raises(ValueError):
            generate_checklist_draft("CASE-GONE", test_db)
