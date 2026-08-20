"""WO-22 银行/平台主数据端点测试 + 建案规范化绑定。

覆盖 GET /api/banks/、GET /api/platforms/ 与 POST /api/cases 的 lender/submission_platform 规范化。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case
from server.api.schemas import CaseDetailResponse
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
    resp = client.post("/api/cases/", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestBanksEndpoint:
    def test_banks_list_twenty_two_full_first(self, client):
        resp = client.get("/api/banks/")
        assert resp.status_code == 200
        banks = resp.json()["banks"]
        assert len(banks) == 22
        assert all(b["tier"] == "full" for b in banks[:9])
        assert all(b["tier"] == "basic" for b in banks[9:])
        assert banks[0]["key"] == "cba"
        assert banks[0]["display_name"] == "CBA"
        assert banks[0]["has_calculator"] is True

    def test_banks_has_calculator_exactly_six(self, client):
        banks = client.get("/api/banks/").json()["banks"]
        assert sum(1 for b in banks if b["has_calculator"]) == 6


class TestPlatformsEndpoint:
    def test_platforms_list_five_includes_required(self, client):
        resp = client.get("/api/platforms/")
        assert resp.status_code == 200
        platforms = resp.json()["platforms"]
        assert len(platforms) == 5
        keys = {p["key"] for p in platforms}
        assert {"mqg", "infynity", "manual"} <= keys
        assert any(p["key"] == "mqg" and p["type"] == "aggregator" for p in platforms)


class TestCaseCreateNormalization:
    def test_resolved_lender_normalized_to_key(self, client, test_db):
        body = _create(client, client_name="张三", lender="Commonwealth Bank")
        assert body["lender"] == "CBA"
        assert body["lender_ref"] == "cba"
        case = test_db.query(Case).filter(Case.id == body["case_id"]).first()
        assert case.lender == "CBA"
        assert case.lender_ref == "cba"

    def test_unknown_lender_passthrough(self, client, test_db):
        body = _create(client, client_name="李四", lender="野鸡银行")
        assert body["lender"] == "野鸡银行"
        assert body["lender_ref"] is None
        case = test_db.query(Case).filter(Case.id == body["case_id"]).first()
        assert case.lender == "野鸡银行"
        assert case.lender_ref is None

    def test_submission_platform_ref_backfilled(self, client, test_db):
        body = _create(client, client_name="王五", submission_platform="MoneyQuest")
        assert body["submission_platform"] == "MoneyQuest"
        assert body["submission_platform_ref"] == "mqg"
        case = test_db.query(Case).filter(Case.id == body["case_id"]).first()
        assert case.submission_platform_ref == "mqg"

    def test_case_detail_response_includes_ref_fields(self, client, test_db):
        body = _create(client, client_name="赵六", lender="St.George", submission_platform="ApplyOnline")
        assert body["lender"] == "St George"
        assert body["lender_ref"] == "st_george"
        assert body["submission_platform"] == "ApplyOnline"
        assert body["submission_platform_ref"] == "aol"
        for field in ("lender_ref", "submission_platform_ref"):
            assert field in body
            assert field in CaseDetailResponse.model_fields
