"""WO-54 标题快速匹配与清单自动打勾测试。

统一使用 tmp_path 构造虚拟案卷目录，严禁访问真实客户目录。
覆盖：真实文件名匹配、自动打勾、多文件绑定、进度计算、空目录/缺失目录安全回退。
"""

import pytest
from fastapi.testclient import TestClient

from core.checklist.matcher import match_checklist_files_for_case
from core.models.orm import Case, CaseChecklist, CaseFile
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


def _make_case(db, case_id, folder_path, client_name="WO54 Tester"):
    case = Case(
        id=case_id,
        client_name=client_name,
        folder_path=folder_path,
        gathering_progress=0,
    )
    db.add(case)
    return case


def test_match_checklist_files_success(tmp_path, test_db):
    """真实文件名 → 清单项自动打勾，received_file_id/received_file_ids 正确关联，进度 100。"""
    folder = tmp_path / "case_wo54_success"
    folder.mkdir()
    (folder / "ID DL.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / "ID Passport.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / "Rate Notice - 84 Louis St.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / "SE Declaration.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / ".DS_Store").write_bytes(b"junk")  # 杂文件必须被忽略

    case_id = "CASE-WO54-SUCCESS"
    _make_case(test_db, case_id, str(folder))
    test_db.add_all([
        CaseChecklist(case_id=case_id, item_name="驾照", category="identity",
                      is_required=True, master_id="driver_license", status="pending"),
        CaseChecklist(case_id=case_id, item_name="护照", category="identity",
                      is_required=True, master_id="passport", status="pending"),
        CaseChecklist(case_id=case_id, item_name="地税单", category="council_rates",
                      is_required=True, master_id="council_rates_notice", status="pending"),
        CaseChecklist(case_id=case_id, item_name="自雇声明", category="se",
                      is_required=True, master_id="se_declaration", status="pending"),
    ])
    test_db.commit()

    res = match_checklist_files_for_case(case_id, test_db)

    assert res["matched_count"] == 4
    assert res["gathering_progress"] == 100

    by_mid = {
        it.master_id: it
        for it in test_db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    }
    for mid in ("driver_license", "passport", "council_rates_notice", "se_declaration"):
        item = by_mid[mid]
        assert item.status == "received"
        assert item.received_file_id is not None
        assert item.received_file_ids == [item.received_file_id]
        file = test_db.query(CaseFile).filter(
            CaseFile.id == item.received_file_id, CaseFile.case_id == case_id
        ).first()
        assert file is not None
        assert file.nas_path.startswith(folder.as_posix())

    case = test_db.query(Case).filter(Case.id == case_id).first()
    assert case.gathering_progress == 100


def test_match_checklist_multi_file_binding(tmp_path, test_db):
    """同一清单项绑定多个文件：received_file_ids 聚合全部 CaseFile ID。"""
    folder = tmp_path / "case_wo54_multi"
    folder.mkdir()
    (folder / "Loan Statement - CBA 1.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / "Loan Statement - CBA 2.pdf").write_bytes(b"%PDF-1.4 fake")

    case_id = "CASE-WO54-MULTI"
    _make_case(test_db, case_id, str(folder))
    test_db.add(CaseChecklist(case_id=case_id, item_name="房贷流水", category="home_loan_statement",
                              is_required=True, master_id="existing_loan_statement", status="pending"))
    test_db.commit()

    res = match_checklist_files_for_case(case_id, test_db)

    assert res["matched_count"] == 2
    item = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).first()
    assert item.status == "received"
    assert item.received_file_id is not None
    assert item.received_file_id in item.received_file_ids
    assert len(item.received_file_ids) == 2

    file_ids = {f.id for f in test_db.query(CaseFile).filter(CaseFile.case_id == case_id).all()}
    assert set(item.received_file_ids) == file_ids

    case = test_db.query(Case).filter(Case.id == case_id).first()
    assert case.gathering_progress == 100


def test_match_checklist_partial_progress(tmp_path, test_db):
    """部分命中：进度按必选项已收比例折算。"""
    folder = tmp_path / "case_wo54_partial"
    folder.mkdir()
    (folder / "ID Passport.pdf").write_bytes(b"%PDF-1.4 fake")

    case_id = "CASE-WO54-PARTIAL"
    _make_case(test_db, case_id, str(folder))
    test_db.add_all([
        CaseChecklist(case_id=case_id, item_name="护照", category="identity",
                      is_required=True, master_id="passport", status="pending"),
        CaseChecklist(case_id=case_id, item_name="地税单", category="council_rates",
                      is_required=True, master_id="council_rates_notice", status="pending"),
        CaseChecklist(case_id=case_id, item_name="驾照", category="identity",
                      is_required=True, master_id="driver_license", status="pending"),
    ])
    test_db.commit()

    res = match_checklist_files_for_case(case_id, test_db)

    assert res["matched_count"] == 1
    assert res["gathering_progress"] == 33  # int(1/3*100)

    case = test_db.query(Case).filter(Case.id == case_id).first()
    assert case.gathering_progress == 33


def test_match_checklist_missing_folder_safe(tmp_path, test_db):
    """folder_path 为空或目录不存在时安全返回 0 匹配，不抛异常。"""
    case_id = "CASE-WO54-NOFOLDER"
    _make_case(test_db, case_id, "")
    test_db.add(CaseChecklist(case_id=case_id, item_name="驾照", category="identity",
                              is_required=True, master_id="driver_license", status="pending"))
    test_db.commit()

    res = match_checklist_files_for_case(case_id, test_db)
    assert res["matched_count"] == 0
    assert res["gathering_progress"] == 0
    assert res["items"] == []

    missing_id = "CASE-WO54-MISSING"
    _make_case(test_db, missing_id, str(tmp_path / "does_not_exist"))
    test_db.add(CaseChecklist(case_id=missing_id, item_name="护照", category="identity",
                              is_required=True, master_id="passport", status="pending"))
    test_db.commit()

    res2 = match_checklist_files_for_case(missing_id, test_db)
    assert res2["matched_count"] == 0
    assert res2["gathering_progress"] == 0
    assert res2["items"] == []


def test_match_checklist_empty_folder_safe(tmp_path, test_db):
    """目录存在但为空：安全返回 0 匹配。"""
    folder = tmp_path / "case_wo54_empty"
    folder.mkdir()

    case_id = "CASE-WO54-EMPTY"
    _make_case(test_db, case_id, str(folder))
    test_db.add(CaseChecklist(case_id=case_id, item_name="驾照", category="identity",
                              is_required=True, master_id="driver_license", status="pending"))
    test_db.commit()

    res = match_checklist_files_for_case(case_id, test_db)
    assert res["matched_count"] == 0
    assert res["gathering_progress"] == 0
    assert res["items"] == []


def test_match_checklist_endpoint(tmp_path, test_db, client):
    """POST /api/cases/{case_id}/checklist/match-files → 200 + 响应结构。"""
    folder = tmp_path / "case_wo54_api"
    folder.mkdir()
    (folder / "ID DL.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / "Rate Notice - 84 Louis St.pdf").write_bytes(b"%PDF-1.4 fake")

    case_id = "CASE-WO54-API"
    _make_case(test_db, case_id, str(folder))
    test_db.add_all([
        CaseChecklist(case_id=case_id, item_name="驾照", category="identity",
                      is_required=True, master_id="driver_license", status="pending"),
        CaseChecklist(case_id=case_id, item_name="护照", category="identity",
                      is_required=True, master_id="passport", status="pending"),
        CaseChecklist(case_id=case_id, item_name="地税单", category="council_rates",
                      is_required=True, master_id="council_rates_notice", status="pending"),
    ])
    test_db.commit()

    resp = client.post(f"/api/cases/{case_id}/checklist/match-files")
    assert resp.status_code == 200

    data = resp.json()
    assert data["ok"] is True
    assert data["case_id"] == case_id
    assert data["matched_count"] == 2
    assert data["gathering_progress"] == 66  # int(2/3*100)
    assert len(data["matched_details"]) == 2

    for detail in data["matched_details"]:
        assert {"checklist_id", "item_name", "master_id", "status",
                "matched_file_id", "matched_file_name"} <= set(detail)
        assert detail["status"] == "received"
        assert detail["matched_file_id"]
        assert detail["matched_file_name"]
