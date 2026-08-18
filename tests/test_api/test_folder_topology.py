"""tests/test_api/test_folder_topology.py — WO-53 目录拓扑与多案卷智能识别测试。

覆盖：目录名语义解析、客户目录拓扑扫描（多案卷 / 单案卷回退）、
批量拓扑导入端点与平台事件。统一使用 tmp_path 构造虚拟目录树，
严禁访问真实客户目录。
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import docx
from fastapi.testclient import TestClient

from core.case_folder.topology import (
    parse_case_folder_name,
    scan_customer_topology,
)
from core.models.orm import Case, CaseContextEvent
from server.deps import get_db
from server.main import app


class _FakePrefillGateway:
    """替换 ApiGateway：返回固定 prefill JSON，避免真实 LLM 调用。"""

    def __init__(self, *args, **kwargs):
        pass

    def call_llm(self, **kwargs):
        return SimpleNamespace(response_text='{"loan_amount": 500000, "client_name": "Test Client"}')


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


def test_parse_case_folder_name_varieties():
    meta = parse_case_folder_name(
        "8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val"
    )
    assert meta["sequence"] == 8
    assert meta["is_resub"] is False
    assert meta["loan_type"] == "Refinance & cash out"
    assert meta["lender"] == "ORDE"
    assert meta["property_address"] == "84 Louis St"
    assert meta["doc_type"] == "Alt Doc"
    assert meta["status"] == "onhold"
    assert meta["onhold_reason"] == "估价过低阻断，进入复议"

    meta = parse_case_folder_name(
        "2. Resub - Refinance & cash out - Zank Financial - "
        "84 Louis Street, Granville NSW 2142 - Withdrawn"
    )
    assert meta["sequence"] == 2
    assert meta["is_resub"] is True
    assert meta["loan_type"] == "Refinance & cash out"
    assert meta["lender"] == "Zank Financial"
    assert meta["property_address"] == "84 Louis Street, Granville NSW 2142"
    assert meta["doc_type"] is None
    assert meta["status"] == "withdrawn"
    assert meta["onhold_reason"] is None

    meta = parse_case_folder_name(
        "5. Resub - Refinance & cash out - Brighten - 84 Louis St (Alt Doc) - Val Fees Not Paid"
    )
    assert meta["sequence"] == 5
    assert meta["is_resub"] is True
    assert meta["lender"] == "Brighten"
    assert meta["property_address"] == "84 Louis St"
    assert meta["doc_type"] == "Alt Doc"
    assert meta["status"] == "onhold"
    assert meta["onhold_reason"] == "估价费未支付"

    meta = parse_case_folder_name("Refinance")
    assert meta["sequence"] is None
    assert meta["is_resub"] is False
    assert meta["status"] == "active"
    assert meta["lender"] is None


def test_scan_customer_topology_multi_cases(tmp_path, test_db, monkeypatch):
    root = tmp_path / "Yingkun CHEN"
    sub1 = root / "1. Purchase - CBA - 84 Louis St"
    sub1.mkdir(parents=True)
    (sub1 / "ID DL.pdf").write_text("x", encoding="utf-8")

    sub2 = root / "2. Resub - Refinance & cash out - Zank Financial - Withdrawn"
    sub2.mkdir(parents=True)
    (sub2 / "ID DL.pdf").write_text("x", encoding="utf-8")
    _make_docx(sub2 / "Broker Notes.docx", "Loan Amount: $400,000")

    sub5 = root / "5. Resub - Refinance & cash out - Brighten - 84 Louis St (Alt Doc) - Val Fees Not Paid"
    sub5.mkdir(parents=True)
    (sub5 / "ID DL.pdf").write_text("x", encoding="utf-8")

    sub8 = root / "8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc) - onhold due to poor val"
    sub8.mkdir(parents=True)
    (sub8 / "ID DL.pdf").write_text("x", encoding="utf-8")
    _make_docx(sub8 / "Broker Notes.docx", "Loan Amount: $500,000")
    (sub8 / "Send to Infynity").mkdir(parents=True)
    (sub8 / "Send to Infynity" / "Products.pdf").write_text("x", encoding="utf-8")

    monkeypatch.setattr("core.facts.prefill.ApiGateway", _FakePrefillGateway)
    res = scan_customer_topology(str(root), db=test_db)

    assert res["ok"] is True
    assert res["message"] is None
    assert res["client_name"] == "Yingkun CHEN"
    assert res["client_root"] == str(root)
    assert len(res["cases"]) == 4

    by_seq = {c["sequence"]: c for c in res["cases"]}
    assert by_seq[1]["status"] == "active"
    assert by_seq[2]["status"] == "withdrawn"
    assert by_seq[2]["has_broker_notes"] is True
    assert by_seq[5]["status"] == "onhold"
    assert by_seq[5]["onhold_reason"] == "估价费未支付"

    c8 = by_seq[8]
    assert c8["lender"] == "ORDE"
    assert c8["property_address"] == "84 Louis St"
    assert c8["doc_type"] == "Alt Doc"
    assert c8["status"] == "onhold"
    assert c8["onhold_reason"] == "估价过低阻断，进入复议"
    assert c8["has_broker_notes"] is True
    assert c8["broker_notes_name"] == "Broker Notes.docx"
    assert c8["file_count"] == 3
    assert c8["submitted_platforms"] == ["Infynity"]
    assert c8["prefilled"].get("loan_amount") == 500000

    recommended = [c for c in res["cases"] if c["is_recommended_active"]]
    assert len(recommended) == 1
    assert recommended[0]["sequence"] == 8


def test_scan_customer_topology_single_folder_fallback(tmp_path):
    root = tmp_path / "Yingkun CHEN"
    root.mkdir(parents=True)
    (root / "Broker Notes.pdf").write_text("x", encoding="utf-8")
    (root / "ID DL.pdf").write_text("x", encoding="utf-8")

    res = scan_customer_topology(str(root))
    assert res["ok"] is True
    assert res["client_name"] == "Yingkun CHEN"
    assert len(res["cases"]) == 1
    case = res["cases"][0]
    assert case["dir_name"] == "Yingkun CHEN"
    assert case["folder_path"] == str(root)
    assert case["status"] == "active"
    assert case["file_count"] == 2
    assert case["is_recommended_active"] is True


def test_scan_customer_topology_missing_folder(tmp_path):
    res = scan_customer_topology(str(tmp_path / "no_such_folder"))
    assert res["ok"] is False
    assert "文件夹不存在" in res["message"]


def test_batch_topology_import_endpoint(tmp_path, test_db):
    root = tmp_path / "Yingkun CHEN"
    sub = root / "8. Refi & cash - ORDE小号 - 84 Louis St (Alt doc)"
    sub.mkdir(parents=True)
    (sub / "ID DL.pdf").write_text("x", encoding="utf-8")

    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.post(
            "/api/cases/topology-import/batch",
            json={
                "items": [
                    {
                        "folder_path": str(sub),
                        "client_name": "Yingkun CHEN",
                        "lender": "ORDE",
                        "loan_amount": 500000,
                        "platform_submissions": ["Infynity", "Lender"],
                    }
                ]
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert len(body["created_cases"]) == 1
        case_id = body["created_cases"][0]["case_id"]
        assert body["created_cases"][0]["folder_path"] == str(sub)

        case = test_db.query(Case).filter(Case.id == case_id).first()
        assert case is not None
        assert case.is_imported is True
        assert case.client_name == "Yingkun CHEN"
        assert case.folder_path == str(sub)

        events = (
            test_db.query(CaseContextEvent)
            .filter(CaseContextEvent.case_id == case_id)
            .all()
        )
        contents = [e.content for e in events]
        assert any("Infynity" in c for c in contents)
        assert any("Lender" in c for c in contents)
    finally:
        next(gen, None)