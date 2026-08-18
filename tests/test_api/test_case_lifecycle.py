"""案件生命周期闭环测试：撤回/终止/暂停/恢复/换行重递/解封。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from core.models.orm import Case, CaseKnowledge
from server.deps import get_db
from server.main import app


def _client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _make_case(test_db, case_id: str = "LC-1", stage: str = "收集资料"):
    test_db.add(Case(id=case_id, client_name="流转测试", lender="CBA", stage=stage))
    test_db.commit()


def _get(test_db, case_id: str) -> Case:
    return test_db.query(Case).filter(Case.id == case_id).first()


def test_withdraw_goes_terminal(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        _make_case(test_db, "LC-1")
        r = client.post("/api/cases/LC-1/withdraw", json={"reason": "客户找到更好利率"})
        assert r.status_code == 200
        assert r.json()["status"] == "withdrawn"
        c = _get(test_db, "LC-1")
        assert c.stage == "已撤回"
        assert c.close_reason == "客户找到更好利率"
        assert c.closed_at is not None
    finally:
        next(gen, None)


def test_decline_and_reopen(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        _make_case(test_db, "LC-2")
        r = client.post("/api/cases/LC-2/decline", json={"reason": "银行拒绝", "note": "不可上诉"})
        assert r.json()["status"] == "declined"
        c = _get(test_db, "LC-2")
        assert c.stage == "已拒绝" and c.close_note == "不可上诉"

        r2 = client.post("/api/cases/LC-2/reopen")
        assert r2.status_code == 200
        c2 = _get(test_db, "LC-2")
        assert c2.stage == "收集资料" and c2.closed_at is None and c2.close_reason is None
    finally:
        next(gen, None)


def test_hold_and_resume(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        _make_case(test_db, "LC-3", stage="已递交")
        r = client.post(
            "/api/cases/LC-3/hold",
            json={"reason": "估值过低等待复议", "reminder_date": "2026-09-01"},
        )
        assert r.status_code == 200
        c = _get(test_db, "LC-3")
        assert c.stage == "暂停中" and c.previous_stage == "已递交"
        assert c.hold_reminder_date.strftime("%Y-%m-%d") == "2026-09-01"

        r2 = client.post("/api/cases/LC-3/resume")
        assert r2.status_code == 200
        c2 = _get(test_db, "LC-3")
        assert c2.stage == "已递交" and c2.hold_reminder_date is None
    finally:
        next(gen, None)


def test_resubmit_creates_new_case(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        _make_case(test_db, "LC-4")
        test_db.add(CaseKnowledge(case_id="LC-4", content="客户自雇 2 年", source="case_profile"))
        test_db.commit()

        r = client.post(
            "/api/cases/LC-4/resubmit",
            json={"reason": "估值过低", "new_lender": "ANZ", "new_loan_amount": 1900000},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "resubmitted"
        new_id = body["new_case_id"]
        assert new_id != "LC-4"

        old = _get(test_db, "LC-4")
        assert old.stage == "已重递" and old.resub_to == new_id
        new = _get(test_db, new_id)
        assert new is not None and new.lender == "ANZ" and new.loan_amount == 1900000
        inherited = test_db.query(CaseKnowledge).filter(CaseKnowledge.case_id == new_id).all()
        assert any("自雇" in row.content for row in inherited)
    finally:
        next(gen, None)


def test_invalid_transitions_409(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        _make_case(test_db, "LC-5")
        assert client.post("/api/cases/LC-5/resume").status_code == 409
        assert client.post("/api/cases/LC-5/reopen").status_code == 409
        client.post("/api/cases/LC-5/hold", json={"reason": "x"})
        assert client.post("/api/cases/LC-5/hold", json={"reason": "x"}).status_code == 409
    finally:
        next(gen, None)
