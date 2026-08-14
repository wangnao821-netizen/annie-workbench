"""tests/test_api/test_knowledge_crud.py — 知识中心 CRUD（B 收尾：清 mock）"""

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case
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


def _create(client: TestClient, layer: str = "global", **kw):
    body = {"layer": layer, "content": "团队经验：CBA 自雇客需 2 年 ABN", **kw}
    return client.post("/api/knowledge/", json=body)


def test_create_and_list(client):
    resp = _create(client)
    assert resp.status_code == 201
    data = resp.json()
    assert data["layer"] == "global"
    assert data["source"] == "vera_manual"
    assert data["vera_confirmed"] is False
    assert data["id"].startswith("ke_")

    listing = client.get("/api/knowledge/").json()
    assert any(item["id"] == data["id"] for item in listing)


def test_create_case_layer_requires_case_id(client):
    resp = _create(client, layer="case")
    assert resp.status_code == 422


def test_create_case_layer_unknown_case(client):
    resp = _create(client, layer="case", case_id="NO_SUCH_CASE")
    assert resp.status_code == 404


def test_create_case_layer_with_case(test_db):
    test_db.add(Case(id="K-CASE-1", client_name="PERSON_1"))
    test_db.commit()

    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        client = TestClient(app)
        resp = _create(client, layer="case", case_id="K-CASE-1")
        assert resp.status_code == 201
        assert resp.json()["case_id"] == "K-CASE-1"
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_patch_update_and_confirm(client):
    created = _create(client).json()
    entry_id = created["id"]

    patched = client.patch(f"/api/knowledge/{entry_id}", json={"content": "更新后的经验", "vera_confirmed": True})
    assert patched.status_code == 200
    assert patched.json()["content"] == "更新后的经验"
    assert patched.json()["vera_confirmed"] is True

    confirmed = client.post(f"/api/knowledge/{entry_id}/confirm").json()
    assert confirmed["vera_confirmed"] is True


def test_delete_removes_entry(client):
    entry_id = _create(client).json()["id"]
    resp = client.delete(f"/api/knowledge/{entry_id}")
    assert resp.status_code == 204
    listing = client.get("/api/knowledge/").json()
    assert all(item["id"] != entry_id for item in listing)


def test_404_unknown_id(client):
    assert client.patch("/api/knowledge/ke_unknown", json={"content": "x"}).status_code == 404
    assert client.delete("/api/knowledge/ke_unknown").status_code == 404


def test_422_bad_layer_filter(client):
    assert client.get("/api/knowledge/", params={"layer": "bogus"}).status_code == 422
