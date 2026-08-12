"""S4-数据层：内外双轨（internal / external）轨道语义 + 外线无泄漏红线断言。

覆盖：
- append_context_event 的 track 参数与默认值
- 蒸馏分轨（internal → context_summary / external → submission_summary），互不污染
- build_case_context 的 track 过滤（facts 含/不含 internal_notes，memory 分轨）
- 端点 ?track= 参数：默认 internal、非法值 422
- 红线：external 视图不得泄漏 internal_notes 内容
"""

import pytest
from fastapi.testclient import TestClient

from core.ai.case_context import build_case_context
from core.context.accumulator import (
    append_context_event,
    get_context_events,
    get_distilled_summary,
)
from core.models.orm import Case, CaseContextEvent
from server.deps import get_db
from server.main import app

_SECRET = "内线机密标记-真实负债含现金借款88万"


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _collect_strings(obj) -> list[str]:
    """递归收集 dict/list 中所有字符串值（不含 key）。"""
    results: list[str] = []
    if isinstance(obj, str):
        results.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            results.extend(_collect_strings(v))
    elif isinstance(obj, list):
        for v in obj:
            results.extend(_collect_strings(v))
    return results


def _make_case(test_db, case_id="case_dual_1", **kwargs) -> Case:
    case = Case(id=case_id, client_name="PERSON_1", **kwargs)
    test_db.add(case)
    test_db.commit()
    return case


class TestAccumulatorTrackSemantics:
    def test_default_track_is_internal(self, test_db):
        _make_case(test_db)
        evt = append_context_event("case_dual_1", "manual_note", "内线备注", test_db)
        assert evt.track == "internal"
        row = test_db.query(CaseContextEvent).filter_by(case_id="case_dual_1").first()
        assert row.track == "internal"

    def test_explicit_external_track(self, test_db):
        _make_case(test_db)
        evt = append_context_event(
            "case_dual_1", "manual_note", "外线呈现", test_db, track="external"
        )
        assert evt.track == "external"
        row = test_db.query(CaseContextEvent).filter_by(case_id="case_dual_1").first()
        assert row.track == "external"

    def test_invalid_track_raises(self, test_db):
        _make_case(test_db)
        with pytest.raises(ValueError):
            append_context_event("case_dual_1", "manual_note", "x", test_db, track="public")

    def test_internal_event_distills_to_context_summary_only(self, test_db):
        case = _make_case(test_db)
        append_context_event(
            "case_dual_1",
            "manual_note",
            "内部事件: 客户实际首付含借款",
            test_db,
            track="internal",
        )
        test_db.refresh(case)
        assert case.context_summary
        assert "内部事件" in case.context_summary
        assert case.submission_summary is None

    def test_external_event_distills_to_submission_summary_only(self, test_db):
        case = _make_case(test_db)
        append_context_event(
            "case_dual_1",
            "manual_note",
            "外部事件: 递交首付全自筹",
            test_db,
            track="external",
        )
        test_db.refresh(case)
        assert case.submission_summary
        assert "外部事件" in case.submission_summary
        assert case.context_summary is None

    def test_distill_split_no_cross_pollution(self, test_db):
        case = _make_case(test_db)
        append_context_event(
            "case_dual_1",
            "manual_note",
            "内部事件: 客户实际首付含借款",
            test_db,
            track="internal",
        )
        append_context_event(
            "case_dual_1",
            "manual_note",
            "外部事件: 递交首付全自筹",
            test_db,
            track="external",
        )
        test_db.refresh(case)
        assert "内部事件" in case.context_summary
        assert "外部事件" not in case.context_summary
        assert "外部事件" in case.submission_summary
        assert "内部事件" not in case.submission_summary

    def test_get_context_events_track_filter(self, test_db):
        _make_case(test_db)
        append_context_event("case_dual_1", "manual_note", "a", test_db, track="internal", trigger_distill=False)
        append_context_event("case_dual_1", "manual_note", "b", test_db, track="external", trigger_distill=False)
        assert [e.content for e in get_context_events("case_dual_1", test_db, track="internal")] == ["a"]
        assert [e.content for e in get_context_events("case_dual_1", test_db, track="external")] == ["b"]
        assert [e.content for e in get_context_events("case_dual_1", test_db)] == ["a", "b"]

    def test_get_distilled_summary_track(self, test_db):
        _make_case(test_db)
        append_context_event("case_dual_1", "manual_note", "内线蒸馏文本", test_db, track="internal")
        append_context_event("case_dual_1", "manual_note", "外线蒸馏文本", test_db, track="external")
        assert "内线蒸馏文本" in get_distilled_summary("case_dual_1", test_db)
        assert "外线蒸馏文本" in get_distilled_summary("case_dual_1", test_db, track="external")


class TestBuildCaseContext:
    def test_internal_facts_include_internal_notes(self, test_db):
        _make_case(test_db, internal_notes=_SECRET)
        ctx = build_case_context("case_dual_1", test_db, track="internal")
        assert ctx["track"] == "internal"
        assert ctx["facts"]["internal_notes"] == _SECRET

    def test_external_facts_exclude_internal_notes(self, test_db):
        _make_case(test_db, internal_notes=_SECRET)
        ctx = build_case_context("case_dual_1", test_db, track="external")
        assert ctx["track"] == "external"
        assert "internal_notes" not in ctx["facts"]

    def test_external_memory_uses_submission_summary(self, test_db):
        _make_case(test_db, submission_summary="对外递交摘要XYZ")
        ctx = build_case_context("case_dual_1", test_db, track="external")
        assert ctx["memory"] == "对外递交摘要XYZ"

    def test_external_memory_empty_when_no_summary(self, test_db):
        _make_case(test_db)
        ctx = build_case_context("case_dual_1", test_db, track="external")
        assert ctx["memory"] == ""

    def test_internal_memory_uses_context_summary(self, test_db):
        _make_case(test_db, context_summary="内线蒸馏记忆")
        ctx = build_case_context("case_dual_1", test_db, track="internal")
        assert ctx["memory"] == "内线蒸馏记忆"

    def test_invalid_track_raises(self, test_db):
        _make_case(test_db)
        with pytest.raises(ValueError):
            build_case_context("case_dual_1", test_db, track="public")


class TestContextEndpointTracks:
    def test_default_track_is_internal(self, client, test_db):
        _make_case(test_db, internal_notes="内线备注", submission_summary="对外摘要")
        resp = client.get("/api/cases/case_dual_1/context")
        assert resp.status_code == 200
        body = resp.json()
        assert body["track"] == "internal"
        assert body["internal_notes"] == "内线备注"
        assert body["facts"]["internal_notes"] == "内线备注"
        assert body["submission_summary"] is None

    def test_external_track_response(self, client, test_db):
        _make_case(test_db, internal_notes="内线备注", submission_summary="对外摘要")
        resp = client.get("/api/cases/case_dual_1/context", params={"track": "external"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["track"] == "external"
        assert body["submission_summary"] == "对外摘要"
        assert body["memory"] == "对外摘要"
        assert body["internal_notes"] is None
        assert "internal_notes" not in body["facts"]

    def test_invalid_track_returns_422(self, client, test_db):
        _make_case(test_db)
        resp = client.get("/api/cases/case_dual_1/context", params={"track": "public"})
        assert resp.status_code == 422

    def test_external_events_do_not_pollute_internal_memory(self, client, test_db):
        """外线事件只进 submission_summary，内线 memory 不受影响（红线：双轨互不污染）。"""
        case = _make_case(test_db, context_summary="内线蒸馏记忆")
        append_context_event(
            "case_dual_1", "manual_note", "外部事件: 递交首付全自筹", test_db, track="external"
        )
        test_db.refresh(case)
        assert "外部事件" in case.submission_summary
        resp = client.get("/api/cases/case_dual_1/context", params={"track": "internal"})
        assert resp.status_code == 200
        assert "外部事件" not in resp.json()["memory"]

    @pytest.mark.safety
    def test_red_line_external_never_leaks_internal_notes(self, client, test_db):
        """红线：写 internal_notes → ?track=external → 全字段无泄漏。"""
        _make_case(test_db, internal_notes=_SECRET)
        resp = client.get("/api/cases/case_dual_1/context", params={"track": "external"})
        assert resp.status_code == 200
        body = resp.json()

        assert "internal_notes" not in body["facts"]
        assert body["internal_notes"] is None

        strings = _collect_strings(body)
        assert _SECRET not in "".join(strings)
        for marker in ("内线机密", "现金借款", "88万"):
            assert not any(marker in s for s in strings), f"external 视图泄漏内线内容: {marker}"
