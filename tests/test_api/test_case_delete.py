"""案件物理删除端点测试（闭环管理：DELETE /api/cases/{id} 级联清理）。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from core.models.orm import Action, Case, CaseChecklist, CaseContextEvent
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


def _make_case(test_db, case_id: str = "DEL-1"):
    test_db.add(Case(id=case_id, client_name="删除测试", lender="CBA", stage="收集资料"))
    test_db.add_all(
        [
            CaseChecklist(case_id=case_id, item_name="护照", category="identity", status="pending"),
            CaseContextEvent(case_id=case_id, source_type="manual_note", content="测试事件"),
            Action(case_id=case_id, type="FOLLOWUP_TODO", title="待办", status="pending"),
        ]
    )
    test_db.commit()


def test_delete_case_cascades(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        _make_case(test_db, "DEL-1")
        r = client.delete("/api/cases/DEL-1")
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] is True
        assert body["affected"]["cases"] == 1
        assert body["affected"]["case_checklist"] == 1
        assert body["affected"]["case_context_events"] == 1
        assert body["affected"]["actions"] == 1

        assert client.get("/api/cases/DEL-1").status_code == 404
        assert test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "DEL-1").count() == 0
        assert test_db.query(Action).filter(Action.case_id == "DEL-1").count() == 0
        assert test_db.query(Case).filter(Case.id == "DEL-1").count() == 0
    finally:
        next(gen, None)


def test_delete_missing_case_404(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        assert client.delete("/api/cases/NOPE").status_code == 404
    finally:
        next(gen, None)
