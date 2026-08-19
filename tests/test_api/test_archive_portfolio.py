"""tests/test_api/test_archive_portfolio.py — WO-60 档案中心全景聚合测试。

覆盖：客户多房产资产聚合（get_client_portfolios）、档案大盘总额指标
（get_archive_hub_stats）与 GET /api/archive/stats、GET /api/archive/portfolio
两个端点。数据全部用内存 DB 构造，绝不访问真实客户目录。
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from core.archive.portfolio import get_archive_hub_stats, get_client_portfolios
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
    loan_amount: float,
    lender: str = "CBA",
    closed_at: datetime = datetime(2026, 7, 15, tzinfo=UTC),
    stage: str = "closed",
    close_reason: str = "settled",
    **kw,
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
        **kw,
    )


def test_get_client_portfolios_multi_properties(test_db):
    test_db.add_all([
        _settled_case(case_id="PORT-A1", client_name="Yingkun CHEN", lender="CBA", loan_amount=450000.0),
        _settled_case(case_id="PORT-A2", client_name="Yingkun CHEN", lender="ORDE", loan_amount=320000.0),
        _settled_case(case_id="PORT-B1", client_name="Alice Wang", lender="CBA", loan_amount=250000.0),
    ])
    test_db.commit()

    items = get_client_portfolios(test_db)
    by_name = {item["client_name"]: item for item in items}
    assert set(by_name) == {"Yingkun CHEN", "Alice Wang"}

    chen = by_name["Yingkun CHEN"]
    assert chen["total_properties_count"] == 2
    assert chen["total_loan_amount"] == 770000.0
    assert chen["primary_lender"] == "CBA"
    assert chen["latest_settlement_date"] == "2026-07-15"
    assert len(chen["cases_summary"]) == 2
    assert {c["case_id"] for c in chen["cases_summary"]} == {"PORT-A1", "PORT-A2"}

    alice = by_name["Alice Wang"]
    assert alice["total_properties_count"] == 1
    assert alice["total_loan_amount"] == 250000.0


def test_get_client_portfolios_query_and_limit(test_db):
    test_db.add_all([
        _settled_case(case_id="PORT-Q1", client_name="Yingkun CHEN", loan_amount=450000.0),
        _settled_case(case_id="PORT-Q2", client_name="Alice Wang", loan_amount=250000.0),
    ])
    test_db.commit()

    assert [i["client_name"] for i in get_client_portfolios(test_db, query="Alice")] == ["Alice Wang"]
    assert len(get_client_portfolios(test_db, limit=1)) == 1


def test_get_archive_hub_stats(test_db):
    test_db.add_all([
        _settled_case(
            case_id="STAT-A1",
            client_name="Yingkun CHEN",
            loan_amount=450000.0,
            ai_experience="银行接受两年 BAS 作为收入证明",
        ),
        _settled_case(
            case_id="STAT-A2",
            client_name="Yingkun CHEN",
            loan_amount=300000.0,
            context_summary="客户为自雇人士",
        ),
        _settled_case(case_id="STAT-B1", client_name="Alice Wang", loan_amount=250000.0),
        _settled_case(
            case_id="STAT-ACTIVE",
            client_name="Active Client",
            loan_amount=999999.0,
            stage="gathering",
            close_reason=None,
        ),
    ])
    test_db.commit()

    stats = get_archive_hub_stats(test_db)
    assert stats["total_archived_clients"] == 2
    assert stats["total_cases_count"] == 3
    assert stats["total_loan_volume"] == 1000000.0
    assert stats["total_precedents_count"] == 2
    assert isinstance(stats["total_opportunities_count"], int)
    assert stats["total_opportunities_count"] >= 0


def test_archive_portfolio_endpoints(test_db):
    test_db.add_all([
        _settled_case(case_id="API-A1", client_name="Yingkun CHEN", lender="CBA", loan_amount=450000.0),
        _settled_case(case_id="API-B1", client_name="Alice Wang", lender="ORDE", loan_amount=250000.0),
    ])
    test_db.commit()

    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.get("/api/archive/stats")
        assert r.status_code == 200
        body = r.json()
        assert body["total_archived_clients"] == 2
        assert body["total_cases_count"] == 2
        assert body["total_loan_volume"] == 700000.0

        r = client.get("/api/archive/portfolio")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["stats"]["total_cases_count"] == 2
        assert len(body["clients"]) == 2
        names = {c["client_name"] for c in body["clients"]}
        assert names == {"Yingkun CHEN", "Alice Wang"}

        r = client.get("/api/archive/portfolio", params={"query": "Alice"})
        assert r.status_code == 200
        body = r.json()
        assert [c["client_name"] for c in body["clients"]] == ["Alice Wang"]
    finally:
        next(gen, None)
