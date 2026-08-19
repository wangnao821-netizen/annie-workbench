"""tests/test_api/test_knowledge_bridge.py — WO-61 档案库↔知识中心双向打通与工作台先例推荐测试。

覆盖：归档先例自动同步落库（幂等）、批量归档自动静默沉淀、工作台先例打分匹配
与 2 个 API 端点（sync-knowledge / recommended-precedents）。
统一使用内存/临时 DB，严禁访问真实客户目录。
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from core.archive.ingestion import batch_import_archive_cases
from core.archive.knowledge_bridge import (
    get_recommended_precedents_for_case,
    sync_archive_to_knowledge_base,
)
from core.models.orm import Case, CaseContextEvent, KnowledgeEntry
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


def _closed_case(**kw):
    defaults = {
        "id": "CASE-BRIDGE-1",
        "client_name": "Yingkun CHEN",
        "stage": "closed",
        "close_reason": "settled",
        "closed_at": datetime(2026, 7, 15, tzinfo=UTC),
        "lender": "ORDE",
        "loan_amount": 450000.0,
        "case_type": "Alt Doc",
        "strategy_report": "自雇 Alt Doc 方案，使用两年 BAS 现金流证明收入",
        "ai_experience": "银行接受两年 BAS 作为收入证明，注意提前备好估价复议材料",
    }
    defaults.update(kw)
    return Case(**defaults)


def _blocker_event(case_id: str, blocker: str) -> CaseContextEvent:
    return CaseContextEvent(
        case_id=case_id,
        source_type="email_timeline",
        content=f"[valuation_shortfall] Valuation\n卡点：{blocker}",
        status="confirmed",
    )


def _card(**kw):
    data = {
        "case_id": "",
        "client_name": "Yingkun CHEN",
        "lender": "ORDE",
        "loan_amount": 450000.0,
        "strategy_summary": "自雇 Alt Doc 方案，使用两年 BAS 现金流证明收入",
        "key_challenges": ["估价过低"],
        "approved_conditions": "提供两年 BAS 记录",
        "takeaway": "提前备好估价复议材料",
    }
    data.update(kw)
    return data


def _precedent_entry(db, entry_id, case_id, card, lender=None, tags=None):
    db.add(
        KnowledgeEntry(
            id=entry_id,
            layer="global_experience",
            case_id=case_id,
            content=json.dumps(card, ensure_ascii=False),
            source="archive_precedent",
            vera_confirmed=True,
            lender=lender if lender is not None else card.get("lender"),
            tags=json.dumps(tags, ensure_ascii=False) if tags else None,
        )
    )


def test_sync_archive_to_knowledge_base(test_db):
    test_db.add_all([
        _closed_case(id="CASE-BRIDGE-S1", client_name="Yingkun CHEN", lender="ORDE"),
        _closed_case(
            id="CASE-BRIDGE-S2",
            client_name="Alice Wang",
            lender="CBA",
            case_type="Full Doc",
            loan_amount=680000.0,
        ),
        _closed_case(
            id="CASE-BRIDGE-ACTIVE",
            client_name="Active Client",
            stage="gathering",
            close_reason=None,
            closed_at=None,
            lender="ORDE",
        ),
    ])
    test_db.commit()

    res = sync_archive_to_knowledge_base(test_db)
    assert res["ok"] is True
    assert res["synced_count"] == 2
    assert res["total_precedents"] == 2

    entries = (
        test_db.query(KnowledgeEntry)
        .filter(KnowledgeEntry.source == "archive_precedent")
        .all()
    )
    assert len(entries) == 2
    for entry in entries:
        assert entry.layer == "global_experience"
        assert entry.source == "archive_precedent"
        assert entry.vera_confirmed is True
        assert entry.case_id in {"CASE-BRIDGE-S1", "CASE-BRIDGE-S2"}
        card = json.loads(entry.content)
        assert card["case_id"] == entry.case_id
        assert entry.lender == card["lender"]

    # 反向溯源：知识条目 → 原始案卷
    first = next(e for e in entries if e.case_id == "CASE-BRIDGE-S1")
    assert first.lender == "ORDE"
    assert test_db.query(Case).filter(Case.id == first.case_id).first() is not None

    # 幂等：再次调用不再重复写入
    res2 = sync_archive_to_knowledge_base(test_db)
    assert res2["synced_count"] == 0
    assert res2["total_precedents"] == 2
    assert (
        test_db.query(KnowledgeEntry)
        .filter(KnowledgeEntry.source == "archive_precedent")
        .count()
        == 2
    )


def test_batch_import_archive_auto_syncs_knowledge(tmp_path, test_db):
    res = batch_import_archive_cases(
        [
            {
                "folder_path": str(tmp_path / "case1"),
                "client_name": "Yingkun CHEN",
                "lender": "ORDE",
                "loan_amount": 300000,
                "settlement_date": "2026-07-15",
                "interest_rate": "6.09",
                "status": "settled",
            }
        ],
        test_db,
    )
    assert res["ok"] is True
    case_id = res["created_cases"][0]["case_id"]

    # 无需手动触发：KnowledgeEntry 已自动沉淀对应实战先例
    entries = (
        test_db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.source == "archive_precedent",
            KnowledgeEntry.case_id == case_id,
        )
        .all()
    )
    assert len(entries) == 1
    entry = entries[0]
    assert entry.layer == "global_experience"
    assert entry.vera_confirmed is True
    assert entry.lender == "ORDE"
    assert json.loads(entry.content)["case_id"] == case_id


def test_get_recommended_precedents_matching(test_db):
    # 先例 1：ORDE + Alt Doc + 估价卡点（完全命中 30+20+40=90）
    test_db.add(_closed_case(id="CASE-PRE-1", client_name="Yingkun CHEN", lender="ORDE", case_type="Alt Doc"))
    test_db.add(_blocker_event("CASE-PRE-1", "估价过低"))
    _precedent_entry(
        test_db,
        "ke_pre_1",
        "CASE-PRE-1",
        _card(case_id="CASE-PRE-1", client_name="Yingkun CHEN", lender="ORDE", key_challenges=["估价过低"]),
    )
    # 先例 2：CBA + Full Doc（完全无关，得分 0 → 不返回）
    test_db.add(_closed_case(id="CASE-PRE-2", client_name="Alice Wang", lender="CBA", case_type="Full Doc"))
    _precedent_entry(
        test_db,
        "ke_pre_2",
        "CASE-PRE-2",
        _card(
            case_id="CASE-PRE-2",
            client_name="Alice Wang",
            lender="CBA",
            key_challenges=["材料不齐"],
            strategy_summary="Full Doc 材料齐全，审批顺利",
        ),
    )
    # 先例 3：ORDE + Alt Doc，但卡点不同（仅 30+20=50）
    test_db.add(_closed_case(id="CASE-PRE-3", client_name="Bob Li", lender="ORDE", case_type="Alt Doc"))
    _precedent_entry(
        test_db,
        "ke_pre_3",
        "CASE-PRE-3",
        _card(case_id="CASE-PRE-3", client_name="Bob Li", lender="ORDE", key_challenges=["审批慢"]),
    )
    # 当前在办案件：ORDE + Alt Doc + 估价卡点
    test_db.add(Case(id="CASE-ACTIVE-1", client_name="New Client", stage="gathering", lender="ORDE", case_type="Alt Doc"))
    test_db.add(_blocker_event("CASE-ACTIVE-1", "估价过低"))
    test_db.commit()

    items = get_recommended_precedents_for_case("CASE-ACTIVE-1", test_db, limit=3)
    assert len(items) == 2
    top = items[0]
    assert top["precedent_id"] == "ke_pre_1"
    assert top["case_id"] == "CASE-PRE-1"
    assert top["relevance_score"] == 90
    assert set(top["match_reasons"]) == {"同机构", "同卡点", "同方案"}
    assert "ORDE" in top["title"]
    assert top["client_name"] == "Yingkun CHEN"
    assert top["strategy_summary"]
    assert top["takeaway"]
    assert items[1]["relevance_score"] == 50

    # 案件不存在 → 空列表
    assert get_recommended_precedents_for_case("NOT-EXIST", test_db) == []


def test_archive_and_cases_endpoints(test_db):
    test_db.add(_closed_case(id="CASE-BRIDGE-E1", client_name="Yingkun CHEN", lender="ORDE", case_type="Alt Doc"))
    test_db.add(_blocker_event("CASE-BRIDGE-E1", "估价过低"))
    test_db.add(Case(id="CASE-BRIDGE-E2", client_name="New Client", stage="gathering", lender="ORDE", case_type="Alt Doc"))
    test_db.add(_blocker_event("CASE-BRIDGE-E2", "估价过低"))
    test_db.commit()
    sync_archive_to_knowledge_base(test_db)

    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.post("/api/archive/sync-knowledge")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["synced_count"] == 0  # 已同步过，幂等
        assert body["total_precedents"] >= 1

        r = client.get("/api/cases/CASE-BRIDGE-E2/recommended-precedents")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["case_id"] == "CASE-BRIDGE-E2"
        assert body["total_recommended"] >= 1
        first = body["precedents"][0]
        assert first["case_id"] == "CASE-BRIDGE-E1"
        assert first["relevance_score"] == 90
    finally:
        next(gen, None)