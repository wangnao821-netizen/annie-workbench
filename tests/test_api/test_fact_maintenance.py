"""WO-42 事实维护 API — 锁定/解锁/披露标记/修正 + 蒸馏锁定保护 测试。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.context.accumulator import append_context_event
from core.facts.extract import sync_brain_facts
from core.models.orm import BrainFact, Case
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


def _add_case(db, case_id: str) -> None:
    db.add(Case(id=case_id, client_name=f"客户{case_id}", stage="收集资料"))
    db.commit()


def _add_fact(
    db,
    case_id: str,
    *,
    fact_id: int = 1,
    key: str = "bank.lender",
    value: str = "CBA",
    track: str = "internal",
    event_id: int = 1,
    locked: bool = False,
    disclosure: str | None = None,
) -> BrainFact:
    row = BrainFact(
        id=fact_id,
        case_id=case_id,
        key=key,
        value=value,
        category=key.split(".", 1)[0],
        track=track,
        event_id=event_id,
        locked_by_user=locked,
        disclosure=disclosure,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestLockUnlock:
    def test_lock_idempotent(self, client, test_db):
        _add_case(test_db, "FM-1")
        fact = _add_fact(test_db, "FM-1")
        resp = client.post(f"/api/cases/FM-1/facts/{fact.id}/lock")
        assert resp.status_code == 200
        assert resp.json()["locked_by_user"] is True
        resp2 = client.post(f"/api/cases/FM-1/facts/{fact.id}/lock")
        assert resp2.status_code == 200
        assert resp2.json()["locked_by_user"] is True

    def test_unlock_idempotent(self, client, test_db):
        _add_case(test_db, "FM-2")
        fact = _add_fact(test_db, "FM-2", locked=True)
        resp = client.post(f"/api/cases/FM-2/facts/{fact.id}/unlock")
        assert resp.status_code == 200
        assert resp.json()["locked_by_user"] is False
        resp2 = client.post(f"/api/cases/FM-2/facts/{fact.id}/unlock")
        assert resp2.status_code == 200
        assert resp2.json()["locked_by_user"] is False

    def test_lock_404(self, client, test_db):
        _add_case(test_db, "FM-3")
        _add_case(test_db, "FM-3B")
        fact = _add_fact(test_db, "FM-3", fact_id=301)
        # 不存在
        resp = client.post("/api/cases/FM-3/facts/99999/lock")
        assert resp.status_code == 404
        # 属其他案件
        resp2 = client.post(f"/api/cases/FM-3B/facts/{fact.id}/lock")
        assert resp2.status_code == 404


class TestDisclosure:
    def test_disclosure_mark_and_clear(self, client, test_db):
        _add_case(test_db, "FM-4")
        fact = _add_fact(test_db, "FM-4")
        r1 = client.patch(f"/api/cases/FM-4/facts/{fact.id}/disclosure", json={"disclosure": "disclosed"})
        assert r1.status_code == 200
        assert r1.json()["disclosure"] == "disclosed"
        r2 = client.patch(f"/api/cases/FM-4/facts/{fact.id}/disclosure", json={"disclosure": "internal_only"})
        assert r2.status_code == 200
        assert r2.json()["disclosure"] == "internal_only"
        r3 = client.patch(f"/api/cases/FM-4/facts/{fact.id}/disclosure", json={"disclosure": None})
        assert r3.status_code == 200
        assert r3.json()["disclosure"] is None

    def test_disclosure_invalid(self, client, test_db):
        _add_case(test_db, "FM-5")
        fact = _add_fact(test_db, "FM-5")
        resp = client.patch(f"/api/cases/FM-5/facts/{fact.id}/disclosure", json={"disclosure": "xxx"})
        assert resp.status_code == 422


class TestAmend:
    def test_amend_replaces_with_chain(self, client, test_db):
        _add_case(test_db, "FM-6")
        old = _add_fact(test_db, "FM-6", fact_id=601, value="CBA")
        resp = client.post(f"/api/cases/FM-6/facts/{old.id}/amend", json={"value": "ANZ", "reason": "客户转行"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["value"] == "ANZ"
        assert body["locked_by_user"] is True
        assert body["id"] != old.id
        test_db.refresh(old)
        assert old.superseded_by == body["id"]
        assert old.conflict is True
        assert old.valid_to is not None

    def test_amend_writes_event(self, client, test_db):
        _add_case(test_db, "FM-7")
        old = _add_fact(test_db, "FM-7", fact_id=701, value="CBA")
        client.post(f"/api/cases/FM-7/facts/{old.id}/amend", json={"value": "NAB"})
        resp = client.get("/api/cases/FM-7/context-events")
        assert resp.status_code == 200
        events = resp.json()
        assert any(e["source_type"] == "manual_fact_amend" and e["status"] == "confirmed" for e in events)

    def test_amend_blank_value(self, client, test_db):
        _add_case(test_db, "FM-8")
        old = _add_fact(test_db, "FM-8", fact_id=801)
        resp = client.post(f"/api/cases/FM-8/facts/{old.id}/amend", json={"value": "   "})
        assert resp.status_code == 422

    def test_amend_wrong_case(self, client, test_db):
        _add_case(test_db, "FM-9")
        _add_case(test_db, "FM-9B")
        old = _add_fact(test_db, "FM-9", fact_id=901)
        resp = client.post(f"/api/cases/FM-9B/facts/{old.id}/amend", json={"value": "ANZ"})
        assert resp.status_code == 404


class TestSyncLockProtection:
    def test_sync_skips_locked(self, test_db, monkeypatch):
        monkeypatch.setattr("core.facts.extract.extract_facts_from_text", lambda *a, **k: [])
        _add_case(test_db, "FM-10")
        append_context_event("FM-10", "manual_note", "客户在 CBA 申请", test_db, trigger_distill=False)
        sync_brain_facts("FM-10", test_db)
        rows = test_db.query(BrainFact).filter(BrainFact.case_id == "FM-10", BrainFact.key == "bank.lender").all()
        assert len(rows) == 1
        locked = rows[0]
        assert locked.value == "CBA"
        locked.locked_by_user = True
        test_db.commit()
        # 新事件同 key 不同值 → 锁定保护：跳过覆盖
        append_context_event("FM-10", "manual_note", "客户在 ANZ 申请", test_db, trigger_distill=False)
        written = sync_brain_facts("FM-10", test_db)
        test_db.refresh(locked)
        rows = test_db.query(BrainFact).filter(BrainFact.case_id == "FM-10", BrainFact.key == "bank.lender").all()
        assert len(rows) == 1
        assert rows[0].id == locked.id
        assert rows[0].value == "CBA"
        assert rows[0].valid_to is None
        assert rows[0].superseded_by is None
        assert written == 0

    def test_external_track_unchanged(self, client, test_db):
        """红线：internal 事实（含 disclosed）不进 ?track=external。"""
        _add_case(test_db, "FM-11")
        _add_fact(test_db, "FM-11", fact_id=1101, value="CBA", track="internal", disclosure="disclosed")
        _add_fact(test_db, "FM-11", fact_id=1102, value="内部备注", track="internal", disclosure="internal_only", key="client.goal")
        _add_fact(test_db, "FM-11", fact_id=1103, value="NAB", track="external")
        resp = client.get("/api/cases/FM-11/facts", params={"track": "external"})
        assert resp.status_code == 200
        facts = resp.json()
        assert all(f["track"] == "external" for f in facts)
        assert len(facts) == 1
        assert facts[0]["value"] == "NAB"
