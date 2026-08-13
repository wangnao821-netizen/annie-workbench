"""Phase 3 记忆层深化测试：摘要注入软记忆 / CaseChecklist.master_id / generator use_ai=True。"""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace

from core.ai import case_summary
from core.ai.case_summary import refresh_case_summary
from core.checklist import generator
from core.checklist.generator import _master_id_map, save_confirmed_checklist
from core.models.orm import BrainFact, Case, CaseChecklist

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _make_case(db, case_id: str = "P3-1", **kwargs) -> Case:
    defaults = {
        "id": case_id,
        "client_name": "PERSON_P3",
        "lender": "CBA",
        "loan_amount": 850000,
        "stage": "收集资料",
        "purpose": "Purchase",
    }
    defaults.update(kwargs)
    case = Case(**defaults)
    db.add(case)
    db.commit()
    return case


class TestSummaryMemory:
    def test_summary_prompt_includes_case_memory(self, test_db, monkeypatch):
        _make_case(test_db, "P3-MEM-1")
        test_db.add(
            BrainFact(
                case_id="P3-MEM-1", key="income.amount", value="年薪 180000",
                category="income", track="internal", event_id=1,
            )
        )
        test_db.commit()
        captured: dict[str, str] = {}

        class _FakeGateway:
            def __init__(self, config):
                pass

            def call_llm(self, text, prompt_template, system_prompt=None):
                captured["text"] = str(text)
                return SimpleNamespace(response_text="CBA 85万 收集资料")

        monkeypatch.setattr(case_summary, "ApiGateway", _FakeGateway)
        monkeypatch.setattr(
            case_summary, "get_config",
            lambda: SimpleNamespace(project_root=_PROJECT_ROOT),
        )
        result = refresh_case_summary("P3-MEM-1", test_db)
        assert "案件记忆" in captured["text"]
        assert result  # 摘要正常生成

    def test_rule_fallback_still_works_without_memory(self, test_db, monkeypatch):
        _make_case(test_db, "P3-MEM-2")
        monkeypatch.setattr(
            case_summary, "get_config",
            lambda: SimpleNamespace(project_root=_PROJECT_ROOT),
        )

        class _Fail:
            def __init__(self, config):
                raise RuntimeError("no LLM")

        monkeypatch.setattr(case_summary, "ApiGateway", _Fail)
        result = refresh_case_summary("P3-MEM-2", test_db)
        assert "CBA" in result  # 规则回退


class _CallFail:
    """构造成功、调用时抛错（模拟 LLM 不可用）。"""

    def __init__(self, config):
        pass

    def call_llm(self, *args, **kwargs):
        raise RuntimeError("no LLM")


class TestMasterId:
    def test_save_persists_master_id(self, test_db):
        _make_case(test_db, "P3-MASTER-1")
        save_confirmed_checklist(
            "P3-MASTER-1",
            [{"item_name": "CBA 申请表", "category": "bank_specific",
              "is_required": True, "master_id": "cba_application_form"}],
            test_db,
        )
        row = test_db.query(CaseChecklist).filter_by(case_id="P3-MASTER-1").first()
        assert row.master_id == "cba_application_form"

    def test_master_id_map_has_known_names(self):
        mapping = _master_id_map()
        assert mapping  # 非空
        norm = lambda s: re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (s or "").lower())
        assert norm("CBA 申请表") in mapping

    def test_generator_attaches_master_id(self, test_db, monkeypatch):
        _make_case(test_db, "P3-MASTER-2")
        monkeypatch.setattr(generator, "get_config",
                            lambda: SimpleNamespace(project_root=_PROJECT_ROOT))
        monkeypatch.setattr("core.checklist.master_picker.pick_checklist",
                            lambda case_info, db, use_ai=True: [])

        class _Fail:
            def __init__(self, config):
                raise RuntimeError("no LLM")

        monkeypatch.setattr(generator, "ApiGateway", _CallFail)
        items = generator.generate_checklist_draft("P3-MASTER-2", test_db)
        assert isinstance(items, list)
        # LLM 失败走默认清单回退，不抛异常
        assert all("master_id" in it for it in items)


class TestUseAiPreselection:
    def test_generator_calls_pick_with_use_ai_true(self, test_db, monkeypatch):
        _make_case(test_db, "P3-AI-1")
        captured: dict[str, object] = {}
        monkeypatch.setattr(generator, "get_config",
                            lambda: SimpleNamespace(project_root=_PROJECT_ROOT))
        monkeypatch.setattr(
            "core.checklist.master_picker.pick_checklist",
            lambda case_info, db, use_ai=True: captured.update(use_ai=use_ai) or [],
        )
        monkeypatch.setattr(generator, "ApiGateway", _CallFail)
        generator.generate_checklist_draft("P3-AI-1", test_db)
        assert captured.get("use_ai") is True
