"""tests/test_api/test_knowledge_mining.py — WO-59 审批官画像/先例检索/复盘卡与端点测试。"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from core.archive.knowledge_mining import (
    generate_case_knowledge_card,
    get_all_assessor_insights,
    search_case_precedents,
)
from core.models.orm import Case, CaseContextEvent
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


def _case(**kw):
    defaults = {
        "id": "CASE-KN-1",
        "client_name": "Yingkun CHEN",
        "stage": "closed",
        "close_reason": "settled",
        "closed_at": datetime(2026, 7, 15, tzinfo=UTC),
        "lender": "ORDE",
        "loan_amount": 450000.0,
        "case_type": "Alt Doc",
        "interest_rate": "6.09",
        "strategy_report": "自雇 Alt Doc 方案，使用两年 BAS 现金流证明收入",
        "ai_experience": "银行接受两年 BAS 作为收入证明，注意提前备好估价复议材料",
        "context_summary": "客户为自雇人士，银行估值偏低",
    }
    defaults.update(kw)
    return Case(**defaults)


def _event(case_id: str, content: str) -> CaseContextEvent:
    return CaseContextEvent(case_id=case_id, source_type="email_timeline", content=content, status="confirmed")


def test_get_assessor_insights_aggregation(test_db):
    test_db.add_all([
        _case(id="CASE-KN-A1", client_name="Yingkun CHEN", lender="ORDE", closed_at=datetime(2026, 7, 15, tzinfo=UTC)),
        _case(id="CASE-KN-A2", client_name="Alice Wang", lender="ORDE", closed_at=datetime(2026, 8, 1, tzinfo=UTC)),
    ])
    test_db.add_all([
        _event("CASE-KN-A1", "[assessor_assigned] Assigned\n审批官：Rachel Fonseka\n案号：23174 (EX 11199)\n卡点：银行要求补充材料（MIR）"),
        _event("CASE-KN-A2", "[assessor_assigned] Assigned\n审批官：Rachel Fonseka\n案号：23175\n卡点：银行估价低于预期"),
    ])
    test_db.commit()

    items = get_all_assessor_insights(test_db)
    assert len(items) == 1
    item = items[0]
    assert item["assessor_name"] == "Rachel Fonseka"
    assert item["lender"] == "ORDE"
    assert item["case_count"] == 2
    assert item["latest_case_id"] == "CASE-KN-A2"
    assert item["latest_case_ref"] == "23175"
    assert set(item["common_blockers"]) == {"银行要求补充材料（MIR）", "银行估价低于预期"}
    assert item["communication_tips"]


def test_search_case_precedents_filtering(test_db):
    test_db.add_all([
        _case(id="CASE-P-1", client_name="Yingkun CHEN", lender="ORDE", case_type="Alt Doc", broker_notes="自雇 BAS 收入证明"),
        _case(id="CASE-P-2", client_name="Alice Wang", lender="CBA", case_type="Full Doc", broker_notes="工资单材料齐全", ai_experience="Full Doc 材料齐全，审批顺利", context_summary=None),
        _case(id="CASE-P-3", client_name="Active Case", lender="ORDE", case_type="Alt Doc", stage="gathering", close_reason=None, closed_at=None),
    ])
    test_db.commit()

    res = search_case_precedents(test_db, lender="ORDE")
    assert len(res) == 1 and res[0]["case_id"] == "CASE-P-1"

    res = search_case_precedents(test_db, doc_type="Full Doc")
    assert len(res) == 1 and res[0]["lender"] == "CBA"

    res = search_case_precedents(test_db, keyword="BAS")
    assert len(res) == 1 and res[0]["case_id"] == "CASE-P-1"

    res = search_case_precedents(test_db, lender="CBA", doc_type="Full Doc")
    assert len(res) == 1 and res[0]["case_id"] == "CASE-P-2"

    assert search_case_precedents(test_db, keyword="不存在的关键词") == []


def test_generate_case_knowledge_card(test_db):
    test_db.add(_case(id="CASE-KN-C1", client_name="Yingkun CHEN", lender="ORDE"))
    test_db.add_all([
        _event("CASE-KN-C1", "[valuation_shortfall] Valuation Shortfall\n卡点：估价过低：$1.9M vs 期望 $2.3M"),
        _event("CASE-KN-C1", "[approval_issued] Approved\n批准条件：提供两年 BAS 记录"),
    ])
    test_db.add(_case(id="CASE-KN-C2", client_name="Active Client", stage="gathering", close_reason=None, closed_at=None))
    test_db.commit()

    card = generate_case_knowledge_card("CASE-KN-C1", test_db)
    assert card is not None
    assert card["case_id"] == "CASE-KN-C1"
    assert card["client_name"] == "Yingkun CHEN"
    assert card["lender"] == "ORDE"
    assert card["loan_amount"] == 450000.0
    assert card["strategy_summary"]
    assert "估价" in card["key_challenges"][0]
    assert "BAS" in card["approved_conditions"]
    assert card["takeaway"]

    assert generate_case_knowledge_card("CASE-KN-C2", test_db) is None
    assert generate_case_knowledge_card("NOT-EXIST", test_db) is None


def test_archive_knowledge_endpoints(test_db):
    test_db.add_all([
        _case(id="CASE-KN-E1", client_name="Yingkun CHEN", lender="ORDE", case_type="Alt Doc"),
        _case(id="CASE-KN-E2", client_name="Alice Wang", lender="CBA", case_type="Full Doc"),
    ])
    test_db.add_all([
        _event("CASE-KN-E1", "[assessor_assigned] Assigned\n审批官：Rachel Fonseka\n卡点：银行要求补充材料（MIR）"),
        _event("CASE-KN-E1", "[valuation_shortfall] Valuation\n卡点：估价低于预期"),
    ])
    test_db.commit()

    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.get("/api/archive/assessors")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and body["total_assessors"] == 1
        assert body["assessors"][0]["assessor_name"] == "Rachel Fonseka"

        r = client.get("/api/archive/precedents", params={"lender": "ORDE"})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and body["total_found"] == 1
        assert body["precedents"][0]["case_id"] == "CASE-KN-E1"

        r = client.get("/api/archive/precedents", params={"doc_type": "Full Doc"})
        assert r.status_code == 200
        assert r.json()["precedents"][0]["case_id"] == "CASE-KN-E2"

        r = client.get("/api/archive/cases/CASE-KN-E1/knowledge-card")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and body["card"]["case_id"] == "CASE-KN-E1"
        assert body["card"]["key_challenges"]

        r = client.get("/api/archive/cases/NOT-EXIST/knowledge-card")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False and body["message"]
    finally:
        next(gen, None)