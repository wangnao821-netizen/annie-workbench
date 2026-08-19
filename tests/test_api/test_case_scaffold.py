"""tests/test_api/test_case_scaffold.py — WO-56 标准 11 目录脚手架测试。

覆盖：scaffold_case_directories 物理建目录、POST /api/cases/scaffold
端点连通性与异常安全捕获。统一使用 tmp_path，严禁访问真实客户目录。
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from core.case_engine.folder import STANDARD_CASE_SUBDIRS, scaffold_case_directories
from server.deps import get_db
from server.main import app


def _client(test_db) -> TestClient:
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        return TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_standard_case_subdirs_has_11_entries():
    assert len(STANDARD_CASE_SUBDIRS) == 11


def test_scaffold_case_directories_creates_all_subdirs(tmp_path):
    parent = tmp_path / "clients"
    client_name = "Yingkun CHEN"
    case_name = "1. Refinance - CBA - 84 Louis St"

    res = scaffold_case_directories(
        parent_path=str(parent),
        client_name=client_name,
        case_name=case_name,
    )

    assert res["ok"] is True
    client_folder = Path(res["client_folder"])
    case_folder = Path(res["case_folder"])

    assert client_folder == parent / client_name
    assert case_folder == client_folder / case_name
    assert client_folder.is_dir()
    assert case_folder.is_dir()

    assert res["created_subdirs"] == list(STANDARD_CASE_SUBDIRS)
    assert len(res["created_subdirs"]) == 11
    for subdir in STANDARD_CASE_SUBDIRS:
        assert (case_folder / subdir).is_dir()


def test_scaffold_case_directories_default_case_name(tmp_path):
    parent = tmp_path / "clients"
    res = scaffold_case_directories(
        parent_path=str(parent),
        client_name="Default Client",
    )

    assert Path(res["case_folder"]) == parent / "Default Client" / "1. Initial Submission"
    assert Path(res["case_folder"]).is_dir()


def test_scaffold_case_directories_skip_subdirs(tmp_path):
    parent = tmp_path / "clients"
    res = scaffold_case_directories(
        parent_path=str(parent),
        client_name="NoSub Client",
        case_name="2. Purchase - NAB",
        create_subdirs=False,
    )

    assert res["created_subdirs"] == []
    case_folder = Path(res["case_folder"])
    assert case_folder.is_dir()
    assert not (case_folder / "Send to Lender").exists()


def test_scaffold_endpoint_success(tmp_path, test_db):
    parent = tmp_path / "clients"
    client = _client(test_db)

    resp = client.post(
        "/api/cases/scaffold",
        json={
            "parent_path": str(parent),
            "client_name": "Endpoint Client",
            "case_name": "3. Refi & cash - ORDE - 84 Louis St",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert Path(body["client_folder"]) == parent / "Endpoint Client"
    assert Path(body["case_folder"]) == parent / "Endpoint Client" / "3. Refi & cash - ORDE - 84 Louis St"
    assert len(body["created_subdirs"]) == 11
    assert body["message"] is None
    for subdir in STANDARD_CASE_SUBDIRS:
        assert (parent / "Endpoint Client" / "3. Refi & cash - ORDE - 84 Louis St" / subdir).is_dir()


def test_scaffold_endpoint_invalid_parent(tmp_path, test_db):
    client = _client(test_db)

    resp = client.post(
        "/api/cases/scaffold",
        json={
            "parent_path": str(tmp_path / "bad:dir"),
            "client_name": "Bad Parent",
        },
    )
    assert resp.status_code == 400
    assert "创建目录骨架失败" in resp.json()["detail"]