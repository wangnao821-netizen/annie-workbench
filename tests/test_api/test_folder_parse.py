"""tests/test_api/test_folder_parse.py — 文件夹命名解析（WO-34，Electron 兼容）"""

import pytest
from fastapi.testclient import TestClient

from core.case_engine.folder import parse_folder_naming
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


def test_parse_three_segments():
    data = parse_folder_naming("Brandon/ZhangSan/CASE-2025-001")
    assert data["broker_name"] == "Brandon"
    assert data["client_name"] == "ZhangSan"
    assert data["case_id"] == "CASE-2025-001"


def test_parse_two_segments():
    data = parse_folder_naming("Brandon/David Zhang")
    assert data["client_name"] == "David Zhang"
    assert "broker_name" not in data or data["broker_name"] is None


def test_parse_one_segment_cleaned():
    data = parse_folder_naming("LiSi_2026")
    assert data["client_name"] == "LiSi"


def test_parse_absolute_within_root(test_env, client):
    root = test_env["client_root"]
    (root / "Brandon" / "WangWu" / "CASE-9").mkdir(parents=True, exist_ok=True)
    resp = client.get("/api/folders/parse", params={"path": str(root / "Brandon" / "WangWu" / "CASE-9")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["client_name"] == "WangWu"
    assert body["broker_name"] == "Brandon"
    assert body["case_id"] == "CASE-9"


def test_parse_absolute_outside_root_ok(test_env, client, tmp_path):
    """2026-08-17 无总根：parse 为纯命名解析，任意绝对路径均 200。"""
    outside = tmp_path / "outside" / "ClientX"
    resp = client.get("/api/folders/parse", params={"path": str(outside)})
    assert resp.status_code == 200
    assert resp.json()["case_id"] == "ClientX"


def test_parse_traversal_422(client):
    resp = client.get("/api/folders/parse", params={"path": "../Brandon/Client"})
    assert resp.status_code == 422


def test_parse_empty_returns_null_fields(test_env, client):
    resp = client.get("/api/folders/parse", params={"path": ""})
    assert resp.status_code == 200
    body = resp.json()
    assert body["client_name"] is None
    assert body["broker_name"] is None
    assert body["case_id"] is None


def test_parse_windows_style_absolute(test_env, client):
    root = test_env["client_root"]
    raw = (root / "Brandon" / "ZhaoLiu" / "CASE-7").as_posix()
    resp = client.get("/api/folders/parse", params={"path": raw.replace("/", "\\")})
    assert resp.status_code == 200
    assert resp.json()["client_name"] == "ZhaoLiu"
