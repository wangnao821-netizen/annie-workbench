"""tests/test_api/test_retention_radar.py — WO-58 二次经营时钟引擎与商机雷达测试。

覆盖：🔴固定利率到期、🟡满年降息体检、🟢增值套现、🔵放款关怀四种时钟触发、
在办案件严格隔离（只处理已归结案）与 GET /api/archive/retention-radar 端点统计。
所有时间计算基于 UTC，数据全部用内存 DB / tmp_path 构造，绝不访问真实客户目录。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from core.archive.retention import compute_case_retention_opportunities
from core.models.orm import Case
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


def _settled_case(
    *,
    case_id: str,
    client_name: str,
    closed_at: datetime,
    lender: str = "CBA",
    loan_amount: float = 500000.0,
    stage: str = "closed",
    close_reason: str = "settled",
) -> Case:
    return Case(
        id=case_id,
        client_name=client_name,
        stage=stage,
        close_reason=close_reason,
        closed_at=closed_at,
        lender=lender,
        loan_amount=loan_amount,
        interest_rate="6.09",
    )


def test_fixed_rate_expiry_red_alert():
    now = datetime.now(UTC)
    case = _settled_case(
        case_id="CASE-RED-1",
        client_name="Red Client",
        closed_at=now - timedelta(days=330),
    )
    case.rate_type = "fixed"  # 距 1 年固定期还剩 35 天
    opps = compute_case_retention_opportunities(case, now=now)
    reds = [o for o in opps if o["opp_type"] == "fixed_rate_expiry"]
    assert reds, opps
    red = reds[0]
    assert red["level"] == "red"
    assert red["case_id"] == "CASE-RED-1"
    assert red["days_relevant"] == 35
    assert "35" in red["title"]
    assert red["action_suggest"] == "联系客户锁定新转贷方案"


def test_annual_repricing_yellow_alert():
    now = datetime.now(UTC)
    case = _settled_case(
        case_id="CASE-YELLOW-1",
        client_name="Yellow Client",
        closed_at=now - timedelta(days=365),
    )
    opps = compute_case_retention_opportunities(case, now=now)
    yellows = [o for o in opps if o["opp_type"] == "annual_repricing"]
    assert yellows, opps
    yellow = yellows[0]
    assert yellow["level"] == "yellow"
    assert yellow["days_relevant"] == 1
    assert "1 周年" in yellow["title"]


def test_equity_cashout_green_alert():
    now = datetime.now(UTC)
    case = _settled_case(
        case_id="CASE-GREEN-1",
        client_name="Green Client",
        closed_at=now - timedelta(days=750),
    )
    opps = compute_case_retention_opportunities(case, now=now)
    greens = [o for o in opps if o["opp_type"] == "equity_cashout"]
    assert greens, opps
    green = greens[0]
    assert green["level"] == "green"
    assert green["days_relevant"] == 750
    assert green["action_suggest"] == "咨询增值套现与第二套投资房置业意向"


def test_settlement_care_blue_alert():
    now = datetime.now(UTC)
    case = _settled_case(
        case_id="CASE-BLUE-1",
        client_name="Blue Client",
        closed_at=now - timedelta(days=30),
    )
    opps = compute_case_retention_opportunities(case, now=now)
    blues = [o for o in opps if o["opp_type"] == "settlement_care"]
    assert blues, opps
    blue = blues[0]
    assert blue["level"] == "blue"
    assert blue["days_relevant"] == 30
    assert blue["action_suggest"] == "确认首次扣款正常与对账单服务"


def test_active_cases_excluded():
    now = datetime.now(UTC)
    case = _settled_case(
        case_id="CASE-ACTIVE-1",
        client_name="Active Client",
        closed_at=now - timedelta(days=30),
        stage="gathering",
        close_reason=None,
    )
    assert compute_case_retention_opportunities(case, now=now) == []


def test_retention_radar_endpoint(tmp_path, test_db):
    now = datetime.now(UTC)
    test_db.add_all([
        _settled_case(case_id="RADAR-A", client_name="Alpha", closed_at=now - timedelta(days=30)),
        _settled_case(case_id="RADAR-B", client_name="Beta", closed_at=now - timedelta(days=365)),
        _settled_case(case_id="RADAR-C", client_name="Gamma", closed_at=now - timedelta(days=750)),
    ])
    test_db.commit()

    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.get("/api/archive/retention-radar")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        summary = body["summary"]
        assert summary["total_opportunities"] == 4
        assert summary["red_count"] == 0
        assert summary["yellow_count"] == 2
        assert summary["green_count"] == 1
        assert summary["blue_count"] == 1
        opps = body["opportunities"]
        assert len(opps) == 4
        assert {o["level"] for o in opps} == {"yellow", "green", "blue"}
    finally:
        next(gen, None)