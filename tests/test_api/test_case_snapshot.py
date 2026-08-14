"""WO-38 时间点回溯快照端点测试。

覆盖 GET /api/cases/{case_id}/snapshot：
- now 有效 / 未来事实排除 / 区间内包含 / superseded 后排除
- stage 推导 / stage 回退 / track 过滤
- 404 / at 422 / track 422
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from core.models.orm import BrainFact, Case, CaseContextEvent, CaseTimelineEvent
from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _add_case(test_db, case_id="SNAP-1", stage="收集资料"):
    test_db.add(Case(id=case_id, client_name="张三", stage=stage))
    test_db.commit()


def _add_fact(
    test_db,
    case_id,
    key,
    value,
    valid_from,
    valid_to=None,
    category="loan",
    track="internal",
    conflict=False,
):
    test_db.add(
        BrainFact(
            case_id=case_id,
            key=key,
            value=value,
            category=category,
            track=track,
            event_id=1,
            conflict=conflict,
            valid_from=valid_from,
            valid_to=valid_to,
        )
    )
    test_db.commit()


def _add_context_event(
    test_db,
    case_id,
    content,
    created_at,
    track="internal",
    source_type="manual_note",
):
    test_db.add(
        CaseContextEvent(
            case_id=case_id,
            source_type=source_type,
            content=content,
            track=track,
            created_at=created_at,
        )
    )
    test_db.commit()


def _add_timeline(
    test_db,
    case_id,
    event_type,
    title,
    created_at,
    metadata=None,
):
    test_db.add(
        CaseTimelineEvent(
            case_id=case_id,
            event_type=event_type,
            title=title,
            created_at=created_at,
            metadata_json=metadata,
        )
    )
    test_db.commit()


class TestSnapshot:
    def test_snapshot_now_returns_valid(self, client, test_db):
        # 无 at → 200，snapshot_at 非空，facts/events/timeline 为列表
        _add_case(test_db, "SNAP-1")
        resp = client.get("/api/cases/SNAP-1/snapshot")
        assert resp.status_code == 200
        body = resp.json()
        assert body["snapshot_at"]
        assert isinstance(body["facts"], list)
        assert isinstance(body["events"], list)
        assert isinstance(body["timeline"], list)

    def test_snapshot_excludes_future_facts(self, client, test_db):
        # at 早于某事实 valid_from → 该事实不在 facts
        _add_case(test_db, "SNAP-2")
        _add_fact(
            test_db,
            "SNAP-2",
            "income",
            "80000",
            valid_from=datetime(2026, 6, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
        )
        resp = client.get(
            "/api/cases/SNAP-2/snapshot", params={"at": "2026-01-01T00:00:00"}
        )
        assert resp.status_code == 200
        assert resp.json()["facts"] == []

    def test_snapshot_includes_fact_valid_at_point(self, client, test_db):
        # at 落在 valid_from ≤ at < valid_to 内 → 该事实在
        _add_case(test_db, "SNAP-3")
        _add_fact(
            test_db,
            "SNAP-3",
            "income",
            "80000",
            valid_from=datetime(2026, 1, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
            valid_to=datetime(2026, 12, 31),  # noqa: DTZ001 — 与 DB naive UTC 对齐
        )
        resp = client.get(
            "/api/cases/SNAP-3/snapshot", params={"at": "2026-06-01T00:00:00"}
        )
        assert resp.status_code == 200
        facts = resp.json()["facts"]
        assert len(facts) == 1
        assert facts[0]["key"] == "income"
        assert facts[0]["value"] == "80000"

    def test_snapshot_excludes_superseded_after_point(self, client, test_db):
        # valid_to ≤ at 的旧事实不再出现
        _add_case(test_db, "SNAP-4")
        _add_fact(
            test_db,
            "SNAP-4",
            "income",
            "old",
            valid_from=datetime(2026, 1, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
            valid_to=datetime(2026, 5, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
        )
        resp = client.get(
            "/api/cases/SNAP-4/snapshot", params={"at": "2026-06-01T00:00:00"}
        )
        assert resp.status_code == 200
        assert resp.json()["facts"] == []

    def test_snapshot_stage_from_timeline(self, client, test_db):
        # at 前有 stage_advanced（to_stage）→ stage 为该值
        _add_case(test_db, "SNAP-5")
        _add_timeline(
            test_db,
            "SNAP-5",
            "stage_advanced",
            "阶段推进",
            datetime(2026, 5, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
            metadata='{"from_stage": "收集资料", "to_stage": "已递交"}',
        )
        resp = client.get(
            "/api/cases/SNAP-5/snapshot", params={"at": "2026-06-01T00:00:00"}
        )
        assert resp.status_code == 200
        assert resp.json()["stage"] == "已递交"

    def test_snapshot_stage_fallback(self, client, test_db):
        # 无 stage_advanced → stage = case.stage 或 gathering
        _add_case(test_db, "SNAP-6", stage="审核中")
        resp = client.get("/api/cases/SNAP-6/snapshot")
        assert resp.status_code == 200
        assert resp.json()["stage"] == "审核中"

        _add_case(test_db, "SNAP-6b", stage=None)
        resp = client.get("/api/cases/SNAP-6b/snapshot")
        assert resp.status_code == 200
        assert resp.json()["stage"] == "gathering"

    def test_snapshot_track_filter(self, client, test_db):
        # internal/external 事件各归各轨
        _add_case(test_db, "SNAP-7")
        _add_context_event(
            test_db,
            "SNAP-7",
            "内线记录",
            datetime(2026, 3, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
            track="internal",
        )
        _add_context_event(
            test_db,
            "SNAP-7",
            "外线记录",
            datetime(2026, 3, 1),  # noqa: DTZ001 — 与 DB naive UTC 对齐
            track="external",
        )
        internal = client.get(
            "/api/cases/SNAP-7/snapshot",
            params={"at": "2026-06-01T00:00:00", "track": "internal"},
        )
        assert internal.status_code == 200
        assert [e["content"] for e in internal.json()["events"]] == ["内线记录"]

        external = client.get(
            "/api/cases/SNAP-7/snapshot",
            params={"at": "2026-06-01T00:00:00", "track": "external"},
        )
        assert external.status_code == 200
        assert [e["content"] for e in external.json()["events"]] == ["外线记录"]

    def test_snapshot_404_unknown_case(self, client):
        # 无案件 → 404
        resp = client.get("/api/cases/nonexistent/snapshot")
        assert resp.status_code == 404

    def test_snapshot_422_bad_at(self, client, test_db):
        # at="not-a-date" → 422
        _add_case(test_db, "SNAP-8")
        resp = client.get(
            "/api/cases/SNAP-8/snapshot", params={"at": "not-a-date"}
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "at 必须是 ISO 8601 时间"

    def test_snapshot_422_bad_track(self, client, test_db):
        # track="public" → 422
        _add_case(test_db, "SNAP-9")
        resp = client.get(
            "/api/cases/SNAP-9/snapshot", params={"track": "public"}
        )
        assert resp.status_code == 422