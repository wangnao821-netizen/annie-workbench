"""core/context/accumulator.py 迁移测试。

覆盖 append_context_event / get_context_events / get_distilled_summary /
_invalidate_brief_cache 行为（短文本不调 LLM，直接拼接 summary）。
"""

import pytest

from core.context.accumulator import (
    _invalidate_brief_cache,
    append_context_event,
    get_context_events,
    get_distilled_summary,
)
from core.models.orm import Case, CaseBrief, CaseContextEvent


def _make_case(test_db, case_id="case_acc_1"):
    case = Case(id=case_id, client_name="PERSON_1")
    test_db.add(case)
    test_db.commit()
    return case


class TestAppendContextEvent:
    def test_writes_event(self, test_db):
        _make_case(test_db)
        evt = append_context_event(
            "case_acc_1", "file_deep_scan", "工资单 YTD $95,000", test_db
        )
        assert evt.id is not None
        assert evt.source_type == "file_deep_scan"
        row = test_db.query(CaseContextEvent).filter_by(case_id="case_acc_1").first()
        assert row is not None

    def test_requires_case_id(self, test_db):
        with pytest.raises(ValueError):
            append_context_event("", "manual_note", "x", test_db)

    def test_requires_content(self, test_db):
        with pytest.raises(ValueError):
            append_context_event("c1", "manual_note", "   ", test_db)

    def test_short_content_distills_without_llm(self, test_db):
        _make_case(test_db)
        append_context_event(
            "case_acc_1", "file_deep_scan", "工资单提取: YTD $95,000", test_db
        )
        summary = get_distilled_summary("case_acc_1", test_db)
        assert "工资单提取" in summary

    def test_invalidate_brief_cache(self, test_db):
        _make_case(test_db)
        test_db.add(CaseBrief(case_id="case_acc_1", level=1, brief_content="old"))
        test_db.commit()
        _invalidate_brief_cache("case_acc_1", test_db)
        assert test_db.query(CaseBrief).filter_by(case_id="case_acc_1").count() == 0


class TestGetContextEvents:
    def test_ordered_and_limited(self, test_db):
        _make_case(test_db)
        append_context_event(
            "case_acc_1", "manual_note", "a", test_db, trigger_distill=False
        )
        append_context_event(
            "case_acc_1", "manual_note", "b", test_db, trigger_distill=False
        )
        events = get_context_events("case_acc_1", test_db)
        assert [e.content for e in events] == ["a", "b"]

    def test_empty(self, test_db):
        assert get_context_events("case_acc_1", test_db) == []
