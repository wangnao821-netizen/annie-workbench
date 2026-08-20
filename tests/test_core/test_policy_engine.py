"""政策规则引擎测试 — 自雇/签证/LVR/替代银行 + 建档自动政策事件（#14）。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.ai.gateway import ApiGateway
from core.models.orm import CaseContextEvent
from core.policy.engine import check_policy
from server.deps import get_db
from server.main import app

_MINIMAL_YAML = """\
lenders:
  ANZ:
    max_lvr_no_lmi: 80
    max_lvr_with_lmi: 95
    special_requirements:
      - "自雇要求严格（需 2 年税表+会计师信）"
    avoid_for:
      - "自雇 < 2 年"
  CBA:
    max_lvr_no_lmi: 80
    max_lvr_with_lmi: 95
    special_requirements:
      - "自雇政策相对宽松（接受 add-backs）"
    avoid_for:
      - "高 bonus/commission 结构客户"
  NAB:
    max_lvr_no_lmi: 80
    max_lvr_with_lmi: 95
    special_requirements:
      - "自雇要求严格（需 2 年税表）"
    avoid_for:
      - "自雇 < 2 年"
"""


def _write_policies(tmp_path) -> None:
    (tmp_path / "lender_policies.yaml").write_text(_MINIMAL_YAML, encoding="utf-8")


@pytest.fixture(autouse=True)
def _policy_env(monkeypatch, tmp_path):
    """隔离环境 + 强制 LLM 失败（验证回退模板，保证端点测试确定性）。"""
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-fake-key-12345")
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")

    def _fail(*args, **kwargs):
        from core.ai.gateway import LLMError

        raise LLMError("test: LLM 不可用，验证回退模板")

    monkeypatch.setattr(ApiGateway, "call_llm", _fail)


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


class TestPolicyEngine:
    def test_self_employed_anz_red(self, tmp_path):
        # 自雇 + ANZ（无 ABN 年限）→ overall red；issues 含"自雇要求严格"；alternative 含 CBA
        _write_policies(tmp_path)
        result = check_policy(
            lender="ANZ", employment_type="自雇", residency=None,
            lvr=None, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert result.overall == "red"
        assert any(i.level == "red" and "自雇要求严格" in i.title for i in result.issues)
        assert result.alternative_lenders[0] == "CBA"

    def test_self_employed_cba_green_or_amber(self, tmp_path):
        # 自雇 + CBA → 非 red（lenient）
        _write_policies(tmp_path)
        result = check_policy(
            lender="CBA", employment_type="ABN", residency=None,
            lvr=None, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert result.overall in ("green", "amber")
        assert not any(i.level == "red" for i in result.issues)

    def test_temp_visa_amber(self, tmp_path):
        # residency=temp_visa + NAB → 含 amber 签证提示
        _write_policies(tmp_path)
        result = check_policy(
            lender="NAB", employment_type="PAYG", residency="temp_visa",
            lvr=None, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert any(i.level == "amber" and "临时签证" in i.title for i in result.issues)
        assert result.overall == "amber"

    def test_lvr_over_no_lmi(self, tmp_path):
        # lvr=85 + ANZ → 含 "LVR 超过 80% 需 LMI"（amber）；lvr=96 → red
        _write_policies(tmp_path)
        amber = check_policy(
            lender="ANZ", employment_type="PAYG", residency=None,
            lvr=85, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert amber.overall == "amber"
        assert any(i.level == "amber" and "LVR 超过 80%" in i.title for i in amber.issues)
        red = check_policy(
            lender="ANZ", employment_type="PAYG", residency=None,
            lvr=96, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert red.overall == "red"
        assert any(i.level == "red" and "LVR 超过 95%" in i.title for i in red.issues)

    def test_unknown_lender_empty(self, tmp_path):
        # lender="Unknown" → overall green、无 issues、alternative 空
        _write_policies(tmp_path)
        result = check_policy(
            lender="Unknown", employment_type="自雇", residency=None,
            lvr=None, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert result.overall == "green"
        assert result.issues == []
        assert result.alternative_lenders == []

    def test_no_lender_data(self, tmp_path):
        # lender="" → green 空结果
        _write_policies(tmp_path)
        result = check_policy(
            lender="", employment_type="PAYG", residency=None,
            lvr=None, loan_amount=None, property_value=None, config_dir=tmp_path,
        )
        assert result.overall == "green"
        assert result.issues == []
        assert result.alternative_lenders == []


class TestCreatePolicyEvent:
    def _create(self, client, **kwargs):
        payload = {"client_name": "张三", "source": "manual"}
        payload.update(kwargs)
        return client.post("/api/cases/", json=payload)

    def test_create_case_writes_policy_event(self, client, test_db):
        # create_case(lender=ANZ, employment_type=自雇, lvr=85) → confirmed internal 政策事件
        resp = self._create(
            client,
            lender="ANZ", employment_type="自雇",
            loan_amount=850000, property_value=1000000,
        )
        assert resp.status_code == 200
        case_id = resp.json()["case_id"]
        events = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == case_id).all()
        assert any("政策检查" in e.content for e in events)
        event = next(e for e in events if "政策检查" in e.content)
        assert event.track == "internal"
        assert event.status == "confirmed"
        # 脱敏核验：事件文案不含客户名（无 PII 泄露）
        assert "张三" not in event.content

    def test_create_case_no_issues_no_event(self, client, test_db):
        # create_case(lender=CBA, employment_type=PAYG, lvr=60) → 无 policy 事件
        resp = self._create(
            client,
            lender="CBA", employment_type="PAYG",
            loan_amount=600000, property_value=1000000,
        )
        assert resp.status_code == 200
        case_id = resp.json()["case_id"]
        events = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == case_id).all()
        assert not any("政策检查" in e.content for e in events)

    def test_policy_check_endpoint(self, client):
        # GET /api/cases/{id}/policy-check → 200 含 overall/issues/summary/disclaimer；404 案件
        resp = self._create(
            client,
            lender="ANZ", employment_type="自雇",
            loan_amount=850000, property_value=1000000,
        )
        case_id = resp.json()["case_id"]
        check = client.get(f"/api/cases/{case_id}/policy-check")
        assert check.status_code == 200
        body = check.json()
        assert body["lender"] == "ANZ"
        assert body["overall"] == "red"
        assert body["issues"]
        assert "CBA" in body["alternative_lenders"]
        assert body["summary"]  # LLM 失败回退模板文案
        assert "政策会变" in body["disclaimer"]
        missing = client.get("/api/cases/NOPE-404/policy-check")
        assert missing.status_code == 404
