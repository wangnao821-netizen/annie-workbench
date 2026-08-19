"""tests/test_api/test_archive_ingestion.py — WO-60 历史案卷批量归档入库与放款事实解析测试。

覆盖：已放款终态识别与放款事实提取、在途案卷跨区冲突拦截、已归档拦截、
批量归档入库（stage="closed"）与 /api/archive 两个 API 端点。
统一使用 tmp_path 构造虚拟目录树，严禁访问真实客户目录。
"""

from __future__ import annotations

from pathlib import Path

import docx
from fastapi.testclient import TestClient

from core.archive.ingestion import scan_archive_folder
from core.models.orm import Case, ImportRecord
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


def _make_docx(path: Path, text: str) -> None:
    doc = docx.Document()
    doc.add_paragraph(text)
    doc.save(str(path))


def test_scan_archive_settled_detection(tmp_path, test_db):
    root = tmp_path / "Yingkun CHEN"
    sub = root / "1. Refinance - CBA - 84 Louis St - Settled"
    sub.mkdir(parents=True)
    (sub / "Settlement Statement 2026-07-15.txt").write_text(
        "Settlement Statement\nLoan Amount: $450,000",
        encoding="utf-8",
    )
    _make_docx(sub / "Broker Notes.docx", "Interest Rate: 6.09%")

    res = scan_archive_folder(str(root), db=test_db)
    assert res["ok"] is True
    assert res["client_name"] == "Yingkun CHEN"
    assert res["total_found"] == 1
    assert res["eligible_count"] == 1

    case = res["cases"][0]
    assert case["dir_name"] == sub.name
    assert case["status"] == "settled"
    assert case["eligible"] is True
    assert case["in_workbench"] is False
    assert case["already_archived"] is False
    assert case["filter_reason"] is None
    assert case["lender"] == "CBA"
    assert case["property_address"] == "84 Louis St"
    assert case["settlement_date"] == "2026-07-15"
    assert case["interest_rate"] == "6.09"
    assert case["loan_amount"] == 450000.0
    assert case["file_count"] == 2


def test_scan_archive_in_workbench_conflict_blocked(tmp_path, test_db):
    root = tmp_path / "Client A"
    sub = root / "1. Refinance - Settled"
    sub.mkdir(parents=True)
    (sub / "Settlement Statement.txt").write_text("settled", encoding="utf-8")
    test_db.add(
        Case(
            id="CASE-ARCHIVE-WORKBENCH1",
            client_name="Client A",
            stage="gathering",
            folder_path=str(sub),
        )
    )
    test_db.commit()

    res = scan_archive_folder(str(root), db=test_db)
    case = res["cases"][0]
    assert case["in_workbench"] is True
    assert case["eligible"] is False
    assert case["filter_reason"] is not None
    assert "在办" in case["filter_reason"]
    assert res["eligible_count"] == 0


def test_scan_archive_already_archived_blocked(tmp_path, test_db):
    root = tmp_path / "Client B"
    sub = root / "1. Refinance - Settled"
    sub.mkdir(parents=True)
    (sub / "Settlement Statement.txt").write_text("settled", encoding="utf-8")
    test_db.add(
        Case(
            id="CASE-ARCHIVE-DONE1",
            client_name="Client B",
            stage="closed",
            close_reason="settled",
            folder_path=str(sub),
        )
    )
    test_db.commit()

    res = scan_archive_folder(str(root), db=test_db)
    case = res["cases"][0]
    assert case["already_archived"] is True
    assert case["eligible"] is False
    assert case["filter_reason"] is not None
    assert "已归档" in case["filter_reason"]


def test_batch_import_archive_creates_closed_cases(tmp_path, test_db):
    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.post(
            "/api/archive/batch-import",
            json={
                "items": [
                    {
                        "folder_path": str(tmp_path / "case1"),
                        "client_name": "Yingkun CHEN",
                        "lender": "CBA",
                        "loan_amount": 450000,
                        "settlement_date": "2026-07-15",
                        "interest_rate": "6.09",
                        "status": "settled",
                    }
                ]
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["imported_count"] == 1

        case_id = body["created_cases"][0]["case_id"]
        case = test_db.query(Case).filter(Case.id == case_id).first()
        assert case is not None
        assert case.stage == "closed"
        assert case.close_reason == "settled"
        assert case.is_imported is True
        assert case.closed_at is not None
        assert case.interest_rate == "6.09"
        assert case.loan_amount == 450000.0

        rec = (
            test_db.query(ImportRecord)
            .filter(ImportRecord.source == "archive_batch")
            .first()
        )
        assert rec is not None
        assert rec.status == "done"
    finally:
        next(gen, None)


def test_archive_api_endpoints(tmp_path, test_db):
    root = tmp_path / "Client A"
    sub = root / "1. Refinance - CBA - Settled"
    sub.mkdir(parents=True)
    (sub / "Settlement Statement.txt").write_text("Loan Amount: $300,000", encoding="utf-8")

    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.post("/api/archive/scan", json={"folder_path": str(root)})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["total_found"] == 1
        assert body["eligible_count"] == 1
        assert body["cases"][0]["folder_path"] == str(sub)

        r = client.post(
            "/api/archive/batch-import",
            json={
                "items": [
                    {
                        "folder_path": str(sub),
                        "client_name": "Client A",
                        "status": "settled",
                    }
                ]
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["imported_count"] == 1

        case_id = body["created_cases"][0]["case_id"]
        case = test_db.query(Case).filter(Case.id == case_id).first()
        assert case.stage == "closed"
        assert case.close_reason == "settled"
    finally:
        next(gen, None)