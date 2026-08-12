"""佣金计算测试 — 钉住 commission_status / 费率匹配 / 单案金额计算 / 汇总。"""

import pytest
from fastapi.testclient import TestClient

from core.commission.calculator import (
    calculate_case_commission,
    commission_status,
    get_commission_rates,
    get_commission_summary,
    resolve_lender_key,
)
from core.models.orm import Case
from server.deps import get_db
from server.main import app


class TestCommissionStatus:
    """阶段 → 状态归类。"""

    def test_settled_stage(self):
        assert commission_status("已结算") == "settled"

    def test_approved_stage(self):
        assert commission_status("已批准") == "approved"
        assert commission_status("结算中") == "approved"

    def test_potential_stage(self):
        assert commission_status("收集资料") == "potential"
        assert commission_status("已递交") == "potential"
        assert commission_status("") == "potential"
        assert commission_status(None) == "potential"

    def test_terminal_stage_excluded(self):
        assert commission_status("已撤回") == "excluded"
        assert commission_status("已拒绝") == "excluded"
        assert commission_status("on_hold") == "excluded"


class TestRateResolution:
    """银行名 → lender_policies.yaml 标准键。"""

    def test_rates_contain_major_lenders(self):
        rates = get_commission_rates()
        assert "CBA" in rates
        assert rates["CBA"]["upfront"] > 0

    def test_exact_match(self):
        assert resolve_lender_key("CBA") == "CBA"

    def test_case_insensitive_match(self):
        assert resolve_lender_key("cba") == "CBA"

    def test_unknown_lender_none(self):
        assert resolve_lender_key("NoSuchBank") is None

    def test_empty_lender_none(self):
        assert resolve_lender_key("") is None
        assert resolve_lender_key(None) is None


class TestCalculateCaseCommission:
    """单案佣金金额计算。"""

    def test_settled_upfront_trail(self, sample_case, test_db):
        sample_case.lender = "CBA"
        sample_case.loan_amount = 850000
        sample_case.stage = "已结算"
        test_db.commit()
        row = calculate_case_commission(sample_case)
        assert row["status"] == "settled"
        # 850000 × 0.65% = 5525
        assert row["upfront"] == 5525.0
        assert row["trail_annual"] == pytest.approx(850000 * 0.15 / 100, rel=1e-6)
        assert row["has_rate"] is True

    def test_excluded_returns_none(self, sample_case, test_db):
        sample_case.stage = "已撤回"
        test_db.commit()
        assert calculate_case_commission(sample_case) is None

    def test_approved_status(self, sample_case, test_db):
        sample_case.stage = "已批准"
        test_db.commit()
        row = calculate_case_commission(sample_case)
        assert row["status"] == "approved"

    def test_missing_rate_upfront_none(self, sample_case, test_db):
        """无费率案件 has_rate=False 且金额为 None（前端显示 —）。"""
        sample_case.lender = "NoSuchBank"
        sample_case.loan_amount = 500000
        sample_case.stage = "已结算"
        test_db.commit()
        row = calculate_case_commission(sample_case)
        assert row["has_rate"] is False
        assert row["upfront"] is None
        assert row["trail_annual"] is None


class TestCommissionSummary:
    """get_commission_summary 汇总口径。"""

    def _add_case(self, db, case_id: str, stage: str, amount: float = 850000) -> Case:
        case = Case(
            id=case_id,
            client_name=f"PERSON_{case_id}",
            lender="CBA",
            loan_amount=amount,
            stage=stage,
        )
        db.add(case)
        db.commit()
        return case

    def test_summary_totals(self, test_db):
        self._add_case(test_db, "SUM-001", "已结算")
        self._add_case(test_db, "SUM-002", "已批准")
        self._add_case(test_db, "SUM-003", "已撤回")  # excluded，不计入

        summary = get_commission_summary(test_db)
        totals = summary["totals"]
        assert totals["case_count"] == 2
        assert totals["settled"]["case_count"] == 1
        assert totals["approved"]["case_count"] == 1
        assert totals["settled"]["upfront"] == 5525.0

    def test_by_lender_groups(self, test_db):
        self._add_case(test_db, "SUM-011", "已结算")
        self._add_case(test_db, "SUM-012", "已批准")
        summary = get_commission_summary(test_db)
        lenders = {g["lender"] for g in summary["by_lender"]}
        assert "CBA" in lenders


class TestCommissionEndpoint:
    """GET /api/commission 端点。"""

    @staticmethod
    def _override(test_db):
        def _get_db():
            yield test_db

        return _get_db

    def test_returns_summary_fields(self, test_db):
        test_db.add(
            Case(
                id="EP-001",
                client_name="PERSON_EP",
                lender="CBA",
                loan_amount=850000,
                stage="已结算",
            )
        )
        test_db.add(
            Case(
                id="EP-002",
                client_name="PERSON_EP2",
                lender="CBA",
                loan_amount=500000,
                stage="收集资料",
            )
        )
        test_db.commit()

        client = TestClient(app)
        app.dependency_overrides[get_db] = self._override(test_db)
        try:
            resp = client.get("/api/commission")
            assert resp.status_code == 200
            body = resp.json()
            assert body["month_settled"] == 5525.0
            assert body["pipeline_estimate"] > 0
            assert body["active_cases"] == 1
            assert "generated_at" in body
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_empty_db(self, test_db):
        client = TestClient(app)
        app.dependency_overrides[get_db] = self._override(test_db)
        try:
            resp = client.get("/api/commission")
            assert resp.status_code == 200
            body = resp.json()
            assert body["month_settled"] == 0
            assert body["pipeline_estimate"] == 0
            assert body["active_cases"] == 0
        finally:
            app.dependency_overrides.pop(get_db, None)
