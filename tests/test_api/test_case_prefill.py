"""统一建案后端测试 — LVR/清单/存量壳/识别预填/文件提取。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.ai.gateway import ApiCallResult
from core.models.orm import Case, CaseChecklist
from core.pipeline.parser import ParseResult
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


@pytest.fixture(autouse=True)
def _api_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")


def _create(client, **payload):
    resp = client.post("/api/cases", json=payload)
    assert resp.status_code == 200
    return resp.json()["case_id"]


def _case(db, case_id) -> Case:
    return db.query(Case).filter(Case.id == case_id).first()


class _FakeGateway:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text
        self.last_prompt = ""

    def call_llm(self, **kwargs):
        self.last_prompt = str(kwargs.get("text", ""))
        return ApiCallResult(
            response_text=self._response_text,
            prompt_tokens=0,
            completion_tokens=0,
            cost_usd=0.0,
            latency_ms=0,
        )


class _BrokenGateway:
    def __init__(self, config) -> None:
        pass

    def call_llm(self, **kwargs):
        raise RuntimeError("llm down")


class TestCaseCreationEnhance:
    def test_lvr_auto_computed(self, client, test_db):
        case_id = _create(client, client_name="张三", loan_amount=850000, property_value=1000000)
        case = _case(test_db, case_id)
        assert case.lvr == 85.0
        assert case.property_value == 1000000

    def test_checklist_preselected_on_create(self, client, test_db):
        case_id = _create(client, client_name="李四", lender="CBA", employment_type="PAYG")
        items = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
        assert 15 <= len(items) <= 25
        assert all(it.status == "pending" for it in items)

    def test_legacy_shell_marked_imported(self, client, test_db):
        case_id = _create(client, client_name="王五", lender="CBA", is_imported=True)
        case = _case(test_db, case_id)
        assert case.is_imported is True
        assert case.employment_type is None
        assert case.residency is None
        assert case.loan_amount is None

    def test_employment_residency_interest_saved(self, client, test_db):
        case_id = _create(
            client, client_name="赵六",
            employment_type="PAYG", residency="PR", interest_rate=6.09,
        )
        case = _case(test_db, case_id)
        assert case.employment_type == "PAYG"
        assert case.residency == "PR"
        assert case.interest_rate == "6.09"


class TestPrefill:
    def test_parse_text_prefills_fields(self, client, test_db, monkeypatch):
        resp_text = json.dumps({
            "client_name": "PERSON_1",
            "lender": "CBA",
            "loan_amount": 850000,
            "purpose": "自住",
            "employment_type": "PAYG",
        })
        monkeypatch.setattr("core.facts.prefill.ApiGateway", lambda cfg: _FakeGateway(resp_text))
        resp = client.post("/api/cases/parse-text", json={"raw_text": "张三在 CBA 贷 $850,000 买房，PAYG"})
        assert resp.status_code == 200
        pre = resp.json()["prefilled"]
        assert pre["client_name"] == "张三"
        assert pre["lender"] == "CBA"
        assert pre["loan_amount"] == 850000
        assert pre["purpose"] == "自住"
        assert pre["employment_type"] == "PAYG"
        assert any(f["key"] == "bank.lender" for f in resp.json()["facts"])

    def test_parse_text_llm_failure_empty(self, client, test_db, monkeypatch):
        monkeypatch.setattr("core.facts.prefill.ApiGateway", _BrokenGateway)
        resp = client.post("/api/cases/parse-text", json={"raw_text": "在 CBA 递交中"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["prefilled"] == {}
        assert any(f["key"] == "bank.lender" for f in body["facts"])

    def test_parse_file_returns_and_cleans(self, client, test_db, monkeypatch):
        import tempfile

        real_tmp = tempfile.NamedTemporaryFile
        created: list[str] = []

        def _recording_tmp(*args, **kwargs):
            f = real_tmp(*args, **kwargs)
            created.append(f.name)
            return f

        monkeypatch.setattr(tempfile, "NamedTemporaryFile", _recording_tmp)

        def _fake_parse(path):
            return ParseResult(text="张三在 CBA 贷 $850,000 买房，PAYG 月入 1 万", text_quality="high")

        monkeypatch.setattr("core.pipeline.parser.parse_file", _fake_parse)

        resp = client.post(
            "/api/cases/parse-file",
            files={"file": ("payslip.txt", "张三在 CBA 贷 $850,000 买房".encode(), "text/plain")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["filename"] == "payslip.txt"
        assert body["text_preview"]
        assert created
        assert not Path(created[0]).exists()

    def test_prefill_desensitized(self, client, test_db, monkeypatch):
        fg = _FakeGateway("{}")
        monkeypatch.setattr("core.facts.prefill.ApiGateway", lambda cfg: fg)
        resp = client.post("/api/cases/parse-text", json={"raw_text": "张三在 CBA 贷 $850,000 买房"})
        assert resp.status_code == 200
        assert "张三" not in fg.last_prompt
        assert "PERSON_1" in fg.last_prompt