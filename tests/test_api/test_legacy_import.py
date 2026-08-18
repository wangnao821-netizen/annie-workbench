"""tests/test_api/test_legacy_import.py — WO-50 存量导入预览测试。"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import docx
from fastapi.testclient import TestClient

from core.case_folder.discovery import classify_file
from core.case_folder.legacy_import import (
    build_legacy_import_preview,
    find_broker_notes,
)
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


def test_classify_real_file_names():
    assert classify_file("ID DL.pdf")[0] == "driver_license"
    assert classify_file("ID DL.pdf")[1] >= 0.8
    assert classify_file("ID Visa 155.pdf")[0] == "pr_grant_notice"
    assert classify_file("Rate Notice - 84 Louis Street.pdf")[0] == "council_rates_notice"
    assert classify_file("Liability HL Zank Fxx8440.pdf")[0] == "existing_loan_statement"
    assert classify_file("ORDE Financial - Accountant's Declaration v042025.pdf")[0] == "accountant_letter"


def test_find_broker_notes_prefers_docx(tmp_path):
    case_dir = tmp_path / "case"
    (case_dir / "Send to Lender").mkdir(parents=True)
    (case_dir / "Broker Notes.pdf").write_text("pdf", encoding="utf-8")
    _make_docx(case_dir / "Send to Lender" / "Broker Notes.docx", "Loan Amount: $500,000")
    found = find_broker_notes(case_dir)
    assert found is not None
    assert found.name == "Broker Notes.docx"
    assert found.parent.name == "Send to Lender"


def test_build_preview_prefilled_and_submissions(tmp_path, test_db, monkeypatch):
    case_dir = tmp_path / "case"
    (case_dir / "Send to Lender").mkdir(parents=True)
    (case_dir / "Send to Infynity").mkdir(parents=True)
    _make_docx(case_dir / "Broker Notes.docx", "Loan Amount: $500,000")
    (case_dir / "Send to Lender" / "ID Passport.pdf").write_text("x", encoding="utf-8")
    (case_dir / "Send to Infynity" / "Products.pdf").write_text("x", encoding="utf-8")
    monkeypatch.setattr("core.facts.prefill.ApiGateway", _FakePrefillGateway)
    preview = build_legacy_import_preview(str(case_dir), test_db)
    assert preview["ok"] is True
    assert preview["broker_notes_found"] is True
    assert preview["broker_notes_name"] == "Broker Notes.docx"
    assert preview["prefilled"].get("loan_amount") == 500000
    platforms = {s["platform"] for s in preview["submissions"]}
    assert platforms == {"Lender", "Infynity"}
    lender = next(s for s in preview["submissions"] if s["dir_name"] == "Send to Lender")
    assert lender["is_lender"] is True
    assert preview["submitted_platforms"] == ["Infynity"]


def test_preview_folder_missing(tmp_path, test_db):
    missing = str(tmp_path / "no_such_folder")
    preview = build_legacy_import_preview(missing, test_db)
    assert preview["ok"] is False
    assert "文件夹不存在" in preview["message"]


def test_preview_endpoint(tmp_path, test_db):
    case_dir = tmp_path / "case"
    (case_dir / "Send to Infynity").mkdir(parents=True)
    (case_dir / "Send to Infynity" / "Products.pdf").write_text("x", encoding="utf-8")
    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.post("/api/cases/legacy-import/preview", json={"folder_path": str(case_dir)})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["submissions"][0]["dir_name"] == "Send to Infynity"
        assert body["submitted_platforms"] == ["Infynity"]
    finally:
        next(gen, None)