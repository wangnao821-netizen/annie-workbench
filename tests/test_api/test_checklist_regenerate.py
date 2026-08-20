"""清单重新生成端点测试（WO-52）：POST /{case_id}/checklist/regenerate。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from core.models.orm import Case, CaseChecklist
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


def test_regenerate_replaces_items(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        test_db.add(Case(id="RG-1", client_name="重生成测试", lender="CBA", stage="收集资料"))
        test_db.add(
            CaseChecklist(case_id="RG-1", item_name="旧项", category="identity",
                          is_required=True, master_id=None, status="pending")
        )
        test_db.commit()

        r = client.post("/api/cases/RG-1/checklist/regenerate")
        assert r.status_code == 200
        body = r.json()
        assert body["case_id"] == "RG-1"
        assert body["count"] >= 10
        assert body["generated_by"] in ("ai", "rule_fallback")

        rows = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "RG-1").all()
        assert len(rows) == body["count"]
        assert all("旧项" != it.item_name for it in rows)
        assert all(it.master_id for it in rows), "重新生成后 master_id 必须全部非空"
    finally:
        next(gen, None)


def test_regenerate_missing_case_404(test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        assert client.post("/api/cases/NOPE/checklist/regenerate").status_code == 404
    finally:
        next(gen, None)
