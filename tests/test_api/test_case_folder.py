"""tests/test_api/test_case_folder.py — 案件文件夹关联 API 及 Core 逻辑测试（WO-29）。"""

import pytest
from fastapi.testclient import TestClient

from core.case_engine.folder import auto_create, link_existing
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


def _create_sample_case(db, case_id="CASE-WO29-001", client_name="ZhangSan"):
    case = Case(
        id=case_id,
        client_name=client_name,
        broker_name="Brandon",
        stage="收集资料",
    )
    db.add(case)
    db.commit()
    return case


def test_link_existing_success(test_env, client):
    """1. link_existing：合法路径关联成功，Case.folder_path 落库"""
    db = test_env["db"]
    client_root = test_env["client_root"]
    case = _create_sample_case(db, "CASE-WO29-001")

    target_dir = client_root / "Brandon" / "ZhangSan" / "CASE-WO29-001"
    target_dir.mkdir(parents=True, exist_ok=True)

    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "existing", "path": str(target_dir)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["case_id"] == case.id
    assert data["mode"] == "existing"
    assert "CASE-WO29-001" in data["folder_path"]

    db.refresh(case)
    assert case.folder_path is not None
    assert "CASE-WO29-001" in case.folder_path


def test_link_existing_out_of_bounds(test_env, client):
    """2. 路径越界（client_root 之外 / `..` 穿越）→ 422 拒绝"""
    db = test_env["db"]
    case = _create_sample_case(db, "CASE-WO29-002")

    # 穿越符 ..
    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "existing", "path": "../outside_dir"},
    )
    assert resp.status_code == 422
    assert "穿越" in resp.json()["detail"] or ".." in resp.json()["detail"]

    # client_root 之外
    outside_dir = test_env["tmp_path"] / "outside_secret"
    outside_dir.mkdir(parents=True, exist_ok=True)

    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "existing", "path": str(outside_dir)},
    )
    assert resp.status_code == 422
    assert "越界" in resp.json()["detail"] or "CLIENT_FILES_ROOT" in resp.json()["detail"]


def test_link_existing_target_not_found(test_env, client):
    """3. 目标目录不存在 → 422 可读错误"""
    db = test_env["db"]
    client_root = test_env["client_root"]
    case = _create_sample_case(db, "CASE-WO29-003")

    non_existent_path = client_root / "NonExistentFolder"

    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "existing", "path": str(non_existent_path)},
    )
    assert resp.status_code == 422
    assert "目标目录不存在" in resp.json()["detail"]


def test_link_existing_idempotent(test_env, client):
    """4. 重复关联同一路径 → 幂等（200，folder_path 不变）"""
    db = test_env["db"]
    client_root = test_env["client_root"]
    case = _create_sample_case(db, "CASE-WO29-004")

    target_dir = client_root / "Brandon" / "ZhangSan" / "CASE-WO29-004"
    target_dir.mkdir(parents=True, exist_ok=True)

    resp1 = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "existing", "path": str(target_dir)},
    )
    assert resp1.status_code == 200
    folder1 = resp1.json()["folder_path"]

    resp2 = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "existing", "path": str(target_dir)},
    )
    assert resp2.status_code == 200
    folder2 = resp2.json()["folder_path"]

    assert folder1 == folder2


def test_auto_create_success(test_env, client):
    """5. auto_create：自动建标准子目录并关联成功"""
    db = test_env["db"]
    client_root = test_env["client_root"]
    case = _create_sample_case(db, "CASE-WO29-005")

    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "auto"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["case_id"] == case.id
    assert data["mode"] == "auto"

    created_dir = client_root / data["folder_path"]
    assert created_dir.is_dir()

    for subdir in ["_Inbox", "Send to Lender", "Don't send"]:
        assert (created_dir / subdir).is_dir()


def test_auto_create_conflict(test_env, client):
    """6. auto_create 冲突目录 → 可读错误或唯一后缀（断言其一）"""
    db = test_env["db"]
    client_root = test_env["client_root"]
    case = _create_sample_case(db, "CASE-WO29-006")

    default_dir = client_root / "Brandon" / "ZhangSan" / "CASE-WO29-006"
    default_dir.mkdir(parents=True, exist_ok=True)

    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "auto"},
    )
    assert resp.status_code == 200
    data = resp.json()

    new_dir = client_root / data["folder_path"]
    assert new_dir.name.startswith("CASE-WO29-006_")
    assert new_dir.is_dir()


def test_case_not_found(test_env, client):
    """7. 案件不存在 → 404"""
    resp = client.post(
        "/api/cases/CASE-NON-EXISTENT/folder",
        json={"mode": "auto"},
    )
    assert resp.status_code == 404
    assert "不存在" in resp.json()["detail"]


def test_invalid_mode(test_env, client):
    """8. mode 非法 → 422"""
    db = test_env["db"]
    case = _create_sample_case(db, "CASE-WO29-008")

    resp = client.post(
        f"/api/cases/{case.id}/folder",
        json={"mode": "invalid_mode_xxx"},
    )
    assert resp.status_code == 422


def test_direct_core_function_unit_tests(test_env):
    """9. 直接测试 core/case_engine/folder.py 导出函数异常及自定义 naming。"""
    db = test_env["db"]
    client_root = test_env["client_root"]
    case = _create_sample_case(db, "CASE-WO29-CORE")

    with pytest.raises(ValueError, match="关联路径不能为空"):
        link_existing(db, case.id, "", client_root=client_root)

    updated = auto_create(db, case.id, naming="CustomFolder/SubCase", client_root=client_root)
    assert updated.folder_path == "CustomFolder/SubCase"
    assert (client_root / "CustomFolder/SubCase").is_dir()
