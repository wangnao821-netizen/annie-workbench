"""tests/test_api/test_file_match_badge.py — 文件与清单匹配角标测试 (WO-67)。

测试 list_files 与 GET /api/cases/{case_id}/folder/files 包含 matched_checklist 字段。
"""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.file_ops.service import list_files
from core.models.db import get_sa_session
from core.models.orm import Case, CaseChecklist, CaseFile
from server.main import app


@pytest.fixture
def db_session():
    db = next(get_sa_session())
    yield db
    db.close()


@pytest.fixture
def sample_case_with_files(tmp_path: Path, db_session: Session):
    uid = uuid4().hex[:6]
    case_dir = tmp_path / f"Test_Client_Case_{uid}"
    case_dir.mkdir(parents=True, exist_ok=True)

    f1 = case_dir / "2025_Tax_Return.pdf"
    f1.write_bytes(b"%PDF-1.4 mock tax return")
    f2 = case_dir / "Bank_Statement_Jan.pdf"
    f2.write_bytes(b"%PDF-1.4 mock bank statement")
    f3 = case_dir / "Unmatched_Document.pdf"
    f3.write_bytes(b"%PDF-1.4 mock unclassified")

    c = Case(
        id=f"CASE-BADGE-{uid}",
        client_name=f"Badge Test Client {uid}",
        folder_path=str(case_dir),
        stage="收集资料",
    )
    db_session.add(c)
    db_session.commit()

    # 添加 CaseFile 记录
    cf1 = CaseFile(
        id=f"file_tax_{uid}",
        case_id=c.id,
        original_name="2025_Tax_Return.pdf",
        nas_path=str(f1),
        status="discovered",
    )
    cf2 = CaseFile(
        id=f"file_bank_{uid}",
        case_id=c.id,
        original_name="Bank_Statement_Jan.pdf",
        nas_path=str(f2),
        status="discovered",
    )
    db_session.add_all([cf1, cf2])
    db_session.commit()

    # 添加 CaseChecklist 记录
    chk1 = CaseChecklist(
        case_id=c.id,
        item_name="2025 财年 NOA 税单",
        category="income",
        status="received",
        received_file_id=cf1.id,
    )
    chk2 = CaseChecklist(
        case_id=c.id,
        item_name="报税记录证明",
        category="income",
        status="pending",
        candidate_file_ids=json.dumps([cf1.id]),
    )
    chk3 = CaseChecklist(
        case_id=c.id,
        item_name="近 3 个月银行流水",
        category="liability",
        status="received",
        received_file_id=cf2.id,
    )
    db_session.add_all([chk1, chk2, chk3])
    db_session.commit()

    try:
        yield c
    finally:
        # 清理测试数据
        db_session.query(CaseChecklist).filter(CaseChecklist.case_id == c.id).delete()
        db_session.query(CaseFile).filter(CaseFile.case_id == c.id).delete()
        db_session.query(Case).filter(Case.id == c.id).delete()
        db_session.commit()


def test_list_files_matched_checklist(sample_case_with_files: Case, db_session: Session):
    res = list_files(sample_case_with_files, db=db_session)
    items = res["items"]
    assert len(items) == 3

    by_name = {item["name"]: item for item in items}

    # f1 命中两个清单项
    tax_file = by_name["2025_Tax_Return.pdf"]
    assert "2025 财年 NOA 税单" in tax_file["matched_checklist"]
    assert "报税记录证明" in tax_file["matched_checklist"]
    assert len(tax_file["matched_checklist"]) == 2

    # f2 命中一个清单项
    bank_file = by_name["Bank_Statement_Jan.pdf"]
    assert bank_file["matched_checklist"] == ["近 3 个月银行流水"]

    # f3 未匹配
    unmatched = by_name["Unmatched_Document.pdf"]
    assert unmatched["matched_checklist"] == []


def test_api_folder_files_badge_response(sample_case_with_files: Case):
    client = TestClient(app)
    resp = client.get(f"/api/cases/{sample_case_with_files.id}/folder/files")
    assert resp.status_code == 200
    data = resp.json()
    items = data["items"]
    by_name = {item["name"]: item for item in items}

    tax_item = by_name["2025_Tax_Return.pdf"]
    assert "matched_checklist" in tax_item
    assert len(tax_item["matched_checklist"]) == 2
    assert "2025 财年 NOA 税单" in tax_item["matched_checklist"]
