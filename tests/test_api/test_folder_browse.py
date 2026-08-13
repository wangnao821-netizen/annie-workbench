"""tests/test_api/test_folder_browse.py — 文件夹浏览端点（WO-34，前端契约对齐）"""


import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case, CaseChecklist, CaseFile
from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_env):
    test_db = test_env["db"]

    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_browse_root_lists_subdirs(test_env, client):
    root = test_env["client_root"]
    (root / "Brandon" / "ZhangSan" / "CASE-1").mkdir(parents=True, exist_ok=True)
    (root / "Brandon" / "LiSi" / "CASE-2").mkdir(parents=True, exist_ok=True)
    resp = client.get("/api/folders/browse")
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_path"] == ""
    names = [i["name"] for i in body["items"]]
    assert "Brandon" in names
    assert all(i["is_dir"] for i in body["items"])
    assert all("path" in i and "mtime" in i for i in body["items"])


def test_browse_enter_subdir(test_env, client):
    root = test_env["client_root"]
    (root / "Brandon" / "ZhangSan" / "CASE-1").mkdir(parents=True, exist_ok=True)
    resp = client.get("/api/folders/browse", params={"path": "Brandon"})
    assert resp.status_code == 200
    names = [i["name"] for i in resp.json()["items"]]
    assert "ZhangSan" in names


def test_browse_traversal_422(client):
    resp = client.get("/api/folders/browse", params={"path": "../Brandon"})
    assert resp.status_code == 422


def test_browse_missing_dir_422(test_env, client):
    resp = client.get("/api/folders/browse", params={"path": "Brandon/NoSuch"})
    assert resp.status_code == 422


def test_browse_hidden_dirs_filtered(test_env, client):
    root = test_env["client_root"]
    (root / "Brandon").mkdir(parents=True, exist_ok=True)
    (root / ".hidden").mkdir(exist_ok=True)
    resp = client.get("/api/folders/browse")
    names = [i["name"] for i in resp.json()["items"]]
    assert ".hidden" not in names


def test_revoke_endpoint_response_shape(test_env, client):
    db = test_env["db"]
    case = Case(id="c_rev_ep", client_name="Rev")
    db.add(case)
    db.add(CaseChecklist(case_id="c_rev_ep", item_name="Payslip", category="income",
                         is_required=True, status="received", master_id="payslip_2"))
    db.add(CaseFile(id="file_ep1", case_id="c_rev_ep", original_name="payslip.pdf",
                    nas_path="x", status="discovered"))
    db.commit()
    item = db.query(CaseChecklist).filter(CaseChecklist.case_id == "c_rev_ep").first()
    item.received_file_ids = ["file_ep1"]
    db.commit()
    resp = client.post("/api/cases/c_rev_ep/folder-files/file_ep1/revoke")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "message" in body
    assert body["reverted_items"] == 1