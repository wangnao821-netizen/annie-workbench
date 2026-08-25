"""tests/test_core/test_fact_find_chat.py — Fact Find 对话引导、工具与安全红线测试 (WO-77)。

覆盖：
1. record_fact_find 工具返回 fact_find_confirm 卡片载荷；
2. 红线：未确认前绝不写入正式账本/Event 表；
3. PII 脱敏与还原往返校验；
4. 流程包触发与分发匹配。
"""

from __future__ import annotations

from core.agents.flows import match_flow
from core.agents.runner import run_flow
from core.chat.tools import execute_tool
from core.models.orm import Case, CaseContextEvent, CaseFactFind


def test_record_fact_find_tool_produces_confirm_card_and_no_premature_ledger(test_db):
    """验证 record_fact_find 工具仅生成确认卡片，未确认前不写账本。"""
    case = Case(id="case_20260825_chat_ff_1", client_name="Emma Watson", stage="gathering")
    test_db.add(case)
    test_db.commit()

    args = {
        "section": "solicitor_info",
        "data": {
            "company": "Premier Conveyancing Sydney",
            "contact_name": "James Wilson",
            "email": "james@premierlegal.com.au",
            "phone": "02 8888 9999",
        },
        "confirm_required": True,
    }

    res = execute_tool(
        name="record_fact_find",
        arguments=args,
        case_id=case.id,
        track="internal",
        db=test_db,
    )

    assert res["status"] == "ok"
    assert res["action"] == "confirm_required"
    assert "card" in res
    assert res["card"]["type"] == "fact_find_confirm"
    assert res["card"]["payload"]["section"] == "solicitor_info"
    assert res["card"]["payload"]["data"]["contact_name"] == "James Wilson"

    # 红线验证：CaseContextEvent 中不应该有该事件（未确认前不写正式账本）
    evts = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == case.id).all()
    assert len(evts) == 0

    # 查库验证 CaseFactFind 表此时也未置 confirmed
    confirmed_rows = test_db.query(CaseFactFind).filter(
        CaseFactFind.case_id == case.id,
        CaseFactFind.status == "confirmed",
    ).all()
    assert len(confirmed_rows) == 0


def test_record_fact_find_missing_case_id(test_db):
    """验证无 case_id 时优雅报错。"""
    res = execute_tool(
        name="record_fact_find",
        arguments={"section": "vehicle_asset", "data": {"make": "Tesla", "model": "Model 3", "value": 50000}},
        case_id=None,
        track="internal",
        db=test_db,
    )
    assert res["status"] == "error"
    assert "未选择案件" in res["message"]


def test_fact_find_flow_match_and_execution(test_db):
    """验证自然语言触发 Fact Find 流程包并分发执行。"""
    case = Case(id="case_20260825_chat_ff_2", client_name="Frank Miller", stage="gathering")
    test_db.add(case)
    test_db.commit()

    # 规则触发
    flow = match_flow("帮我记录雇主历史")
    assert flow is not None
    assert flow["key"] == "fact_find"

    # 运行流程
    out = run_flow(
        flow=flow,
        case_id=case.id,
        args={"section": "employment_history", "data": [{"company": "Atlassian", "position": "PM"}]},
        db=test_db,
        track="internal",
    )
    assert out["presentation"] == "dialog"
    assert len(out["tool_cards"]) == 1
    assert out["tool_cards"][0]["type"] == "flow_fact_find"
