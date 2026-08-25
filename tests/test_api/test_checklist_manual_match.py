"""WO-74 手动匹配闭环测试：双向绑定/多文件/替换/解绑/幂等/进度联动/404。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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


def _make_case(db, case_id="WM-1"):
    db.add(
        Case(
            id=case_id,
            client_name="手动匹配测试",
            lender="CBA",
            gathering_progress=0,
        )
    )
    db.commit()


def _make_file(db, case_id, file_id, name="Payslip Jan.pdf"):
    db.add(
        CaseFile(
            id=file_id,
            case_id=case_id,
            original_name=name,
            nas_path=f"data/uploads/{case_id}/{name}",
            status="discovered",
        )
    )
    db.commit()


def _make_item(db, case_id, item_id=1, master_id="payslip_2"):
    db.add(
        CaseChecklist(
            id=item_id,
            case_id=case_id,
            item_name="工资单",
            category="income_payg",
            is_required=True,
            status="pending",
            master_id=master_id,
            phase="initial",
            item_kind="document",
        )
    )
    db.commit()


def test_manual_match_binds_and_returns_matched_info(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_item(test_db, "WM-1", 1)

    r = client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "received"
    assert body["matched_file_id"] == "file_a"
    assert body["matched_file_name"] == "Payslip Jan.pdf"
    assert body["file_ids"] == ["file_a"]
    assert body["phase"] == "initial"
    assert body["item_kind"] == "document"


def test_manual_match_multi_file_append(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_file(test_db, "WM-1", "file_b", "Payslip Feb.pdf")
    _make_item(test_db, "WM-1", 1)

    client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    r = client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_b"})
    assert r.status_code == 200
    assert r.json()["file_ids"] == ["file_a", "file_b"]


def test_manual_match_replace_clears_old(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_file(test_db, "WM-1", "file_b", "Payslip Feb.pdf")
    _make_item(test_db, "WM-1", 1)

    client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    r = client.post(
        "/api/cases/WM-1/checklist/1/match",
        json={"file_id": "file_b", "replace": True},
    )
    assert r.json()["file_ids"] == ["file_b"]


def test_manual_match_idempotent(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_item(test_db, "WM-1", 1)

    client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    r = client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    assert r.json()["file_ids"] == ["file_a"]


def test_unmatch_specific_then_all(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_file(test_db, "WM-1", "file_b", "Payslip Feb.pdf")
    _make_item(test_db, "WM-1", 1)
    client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_b"})

    r = client.post(
        "/api/cases/WM-1/checklist/1/unmatch", json={"file_id": "file_a"}
    )
    assert r.json()["status"] == "received"
    assert r.json()["file_ids"] == ["file_b"]

    r2 = client.post("/api/cases/WM-1/checklist/1/unmatch", json={})
    assert r2.json()["status"] == "pending"
    assert r2.json()["file_ids"] == []


def test_file_side_match(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_item(test_db, "WM-1", 1)

    r = client.post(
        "/api/cases/WM-1/files/file_a/match", json={"item_id": 1}
    )
    assert r.status_code == 200
    assert r.json()["matched_file_id"] == "file_a"
    assert r.json()["status"] == "received"


def test_match_cross_case_404(client, test_db):
    _make_case(test_db, "WM-1")
    _make_case(test_db, "WM-2")
    _make_file(test_db, "WM-2", "file_a")
    _make_item(test_db, "WM-1", 1)

    r = client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    assert r.status_code == 404


def test_match_unknown_item_404(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    r = client.post("/api/cases/WM-1/checklist/999/match", json={"file_id": "file_a"})
    assert r.status_code == 404


def test_gathering_progress_updates(client, test_db):
    _make_case(test_db)
    _make_file(test_db, "WM-1", "file_a")
    _make_item(test_db, "WM-1", 1)
    _make_item(test_db, "WM-1", 2, master_id="passport")

    client.post("/api/cases/WM-1/checklist/1/match", json={"file_id": "file_a"})
    case = test_db.query(Case).filter(Case.id == "WM-1").first()
    assert case.gathering_progress == 50
