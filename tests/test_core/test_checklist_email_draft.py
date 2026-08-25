"""WO-75 测试 — 主库加载 / 模板解析 / 三种客群裁剪 / 端点落草稿。

红线：只出草稿（status=draft），绝不自动发送；模板 ref 必须命中 master；
不写真实库（test_db 隔离）。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.checklist.email_draft import (
    _load_master_index,
    _load_template,
    generate_preliminary_assessment_email,
)
from core.models.orm import BrainFact, Case, EmailDraft
from server.deps import get_db
from server.main import app


def _make_case(test_db, **overrides) -> Case:
    fields = {
        "id": "CASE-WO75-001",
        "client_name": "Alice Johnson",
        "client_email": "alice@example.com",
        "lender": "CBA",
        "loan_amount": 850000,
        "stage": "收集资料",
        "broker_name": "Brandon",
        "purpose": "Purchase",
        "employment_type": "PAYG",
        "residency": "PR",
    }
    fields.update(overrides)
    case = Case(**fields)
    test_db.add(case)
    test_db.commit()
    return case


def _set_property_address(test_db, case_id: str, value: str) -> None:
    fact = BrainFact(
        case_id=case_id,
        key="property.address",
        value=value,
        category="property",
        track="internal",
        event_id=0,
    )
    test_db.add(fact)
    test_db.commit()


# ── 主库 / 模板 一致性 ──────────────────────────────────────────────


class TestMasterAndTemplate:
    def test_master_has_new_items(self):
        idx = _load_master_index()
        for ref in [
            "ato_income_statement",
            "salary_credit_statement",
            "living_expense_statement",
            "car_loan_statement",
            "credit_card_statement",
            "deposit_receipt",
            "savings_proof",
            "super_statement",
            "vehicle_asset_info",
            "employment_history",
            "living_history",
            "solicitor_info",
        ]:
            assert ref in idx, f"master 缺失 {ref}"
        # info 项 kind 透传
        assert idx["employment_history"].get("kind") == "info"
        assert idx["solicitor_info"].get("kind") == "info"

    def test_template_refs_all_hit_master(self, test_db):
        """模板所有 ref 命中 master，generate 不抛 ValueError（否则端点会 422）。"""
        _make_case(test_db)
        _set_property_address(test_db, "CASE-WO75-001", "12 Bridge St, Sydney")
        email = generate_preliminary_assessment_email("CASE-WO75-001", test_db)
        assert email["subject"]
        assert "Alice Johnson" in email["subject"]

    def test_template_loads_eight_sections(self):
        tpl = _load_template()
        assert [s["id"] for s in tpl["sections"]] == [
            "id",
            "income",
            "employment_history",
            "living_expense",
            "liability",
            "living_history",
            "asset",
            "solicitor",
        ]


# ── 客群裁剪 ────────────────────────────────────────────────────────


class TestTrimByProfile:
    def test_payg_drops_company_tax_bas(self, test_db):
        _make_case(test_db, employment_type="PAYG", residency="PR")
        email = generate_preliminary_assessment_email("CASE-WO75-001", test_db)
        body = email["body_text"]
        assert "Financial Report" not in body          # 公司财报
        assert "Tax Return" not in body               # 税表
        assert "BAS" not in body                       # BAS
        assert "Payslip" in body                       # PAYG 保留工资单
        assert "Visa Grant" not in body               # PR 删 VISA

    def test_self_employed_keeps_tax_drops_payslip(self, test_db):
        _make_case(test_db, employment_type="SelfEmployed", residency="TR")
        email = generate_preliminary_assessment_email("CASE-WO75-001", test_db)
        body = email["body_text"]
        assert "Tax Return" in body                    # 保留税表
        assert "Financial Report" in body             # 保留公司财报
        assert "Payslip" not in body                  # 删工资单
        assert "Employment Letter" not in body        # 删雇佣信
        assert "Visa Grant" in body                   # TR 保留 VISA

    def test_citizen_pr_drops_visa(self, test_db):
        _make_case(test_db, residency="Citizen")
        email = generate_preliminary_assessment_email("CASE-WO75-001", test_db)
        assert "Visa Grant" not in email["body_text"]

    def test_refinance_swaps_contract_for_payout(self, test_db):
        _make_case(test_db, purpose="Refinance", employment_type="PAYG", residency="Citizen")
        email = generate_preliminary_assessment_email("CASE-WO75-001", test_db)
        body = email["body_text"]
        assert "Contract of Sale" not in body         # 删购房合同
        assert "Deposit Receipt" not in body          # 删首付收据
        assert "Payout Letter" in body                # 出现 Payout Letter


# ── 信息项呈现 ──────────────────────────────────────────────────────


class TestInfoItems:
    def test_info_items_as_provide_section(self, test_db):
        _make_case(test_db)
        email = generate_preliminary_assessment_email("CASE-WO75-001", test_db)
        body = email["body_text"]
        assert "Employment History" in body
        assert "Living History" in body
        assert "Solicitor" in body
        assert "Please provide the following information" in body
        assert email["cc_email"] == "Brandon.He@everstones.com.au"


# ── 端点落草稿 ──────────────────────────────────────────────────────


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


class TestEndpoint:
    def test_creates_draft_status_draft(self, client, test_db):
        _make_case(test_db)
        _set_property_address(test_db, "CASE-WO75-001", "12 Bridge St, Sydney")
        resp = client.post("/api/cases/CASE-WO75-001/email-draft/preliminary", json={})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["ok"] is True
        assert data["case_id"] == "CASE-WO75-001"
        assert data["subject"].startswith("EVERSTONES Preliminary Assessment")
        assert data["draft_id"].startswith("draft_")

        draft = test_db.query(EmailDraft).filter(EmailDraft.case_id == "CASE-WO75-001").first()
        assert draft is not None
        assert draft.draft_type == "preliminary"
        assert draft.status == "draft"          # 绝不自动发送
        assert draft.to_email == "alice@example.com"

    def test_case_not_found_404(self, client, test_db):
        resp = client.post("/api/cases/CASE-NOPE/email-draft/preliminary", json={})
        assert resp.status_code == 404

    def test_template_mismatch_returns_422(self, test_db, monkeypatch):
        # 临时移除 master 中一个 ref，使一致性校验失败 → 422
        idx = _load_master_index()
        removed = idx.pop("salary_credit_statement")

        def _fake_index():
            return idx

        import core.checklist.email_draft as ed

        monkeypatch.setattr(ed, "_load_master_index", _fake_index)
        _make_case(test_db)
        resp = client_post(test_db, "CASE-WO75-001")
        assert resp.status_code == 422
        # 还原，避免影响其他用例
        idx["salary_credit_statement"] = removed


def client_post(test_db, case_id: str):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        with TestClient(app) as c:
            return c.post(f"/api/cases/{case_id}/email-draft/preliminary", json={})
    finally:
        app.dependency_overrides.pop(get_db, None)
