"""tests/test_intent_driven_tools.py — 意图驱动工具强制调用测试 (WO-64)。

验证各意图下 loop 强制调用对应工具，产生 tool_cards 事件，工具异常不阻断生成。
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from core.chat.loop import run_chat_with_tools_stream
from core.models.db import get_sa_session


@pytest.fixture
def db_session(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key-mock")
    db = next(get_sa_session())
    yield db
    db.close()


def _collect_stream_events(gen):
    events = []
    text_chunks = []
    for item in gen:
        events.append(item.get("event"))
        if item.get("event") == "text_chunk":
            text_chunks.append(item.get("data", {}).get("chunk", ""))
    return events, "".join(text_chunks)


def test_intent_calculator_forced_call(db_session, monkeypatch):
    called = []
    def fake_calc(args, case_id, db):
        called.append(True)
        return {"status": "result", "card": {"type": "calculator_result"}, "summary": "Max loan $1.5M"}

    monkeypatch.setattr("core.chat.tools._calculator_assess", fake_calc)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["测算完成"]):
        gen = run_chat_with_tools_stream("CASE-T", "算一下能贷多少", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert len(called) == 1, "calculator_assess must be called"
    assert "tool_cards" in events
    assert "done" in events


def test_intent_task_create_forced_call(db_session, monkeypatch):
    called = []
    def fake_task(args, case_id, db):
        called.append(args)
        return {"ok": True, "task_id": 1, "title": args.get("title"), "priority": args.get("priority"), "deadline": args.get("deadline")}

    monkeypatch.setattr("core.chat.tools._create_task", fake_task)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["任务已记录"]):
        gen = run_chat_with_tools_stream("CASE-T", "帮我建一个加急任务：明天催客户补交ANZ对账单", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert len(called) == 1
    assert "催客户补交ANZ对账单" in called[0]["title"]
    assert called[0]["priority"] == "high"
    assert called[0]["deadline"] is not None
    assert "tool_cards" in events
    assert "done" in events


def test_intent_task_create_global_needs_case_card(db_session):
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["请在左侧选择案件"]):
        gen = run_chat_with_tools_stream(None, "下周一记一下，电话客户", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert "tool_cards" in events
    assert "done" in events



def test_intent_checklist_gap_forced_call(db_session, monkeypatch):
    called = []
    def fake_check(args, case_id, db):
        called.append("check")
        return {"ok": True, "card": {"type": "checklist_query"}, "summary": "缺2项"}
    def fake_gap(args, case_id, db):
        called.append("gap")
        return {"ok": True, "card": {"type": "gap_analysis"}, "summary": "gap ready"}

    monkeypatch.setattr("core.chat.tools._checklist_query", fake_check)
    monkeypatch.setattr("core.chat.tools._gap_analysis", fake_gap)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["清单核对完成"]):
        gen = run_chat_with_tools_stream("CASE-T", "核对一下当前清单缺哪些材料", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert "check" in called and "gap" in called
    assert "tool_cards" in events
    assert "done" in events


def test_intent_declaration_check_forced_call(db_session, monkeypatch):
    called = []
    def fake_decl(args, case_id, db):
        called.append(True)
        return {"ok": True, "card": {"type": "declaration_check"}, "summary": "一致性核对完成"}

    monkeypatch.setattr("core.chat.tools._declaration_check", fake_decl)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["申报检查完成"]):
        gen = run_chat_with_tools_stream("CASE-T", "检查一下申报材料一致性", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert len(called) == 1
    assert "tool_cards" in events
    assert "done" in events


def test_intent_draft_email_forced_call(db_session, monkeypatch):
    called = []
    def fake_draft(args, case_id, db, track="internal"):
        called.append(True)
        return {"ok": True, "card": {"type": "draft_email"}, "summary": "草稿已起草"}

    monkeypatch.setattr("core.chat.tools._draft_email", fake_draft)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["邮件已生成"]):
        gen = run_chat_with_tools_stream("CASE-T", "帮我写一封催件邮件", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert len(called) == 1
    assert "tool_cards" in events
    assert "done" in events


def test_intent_policy_query_forced_call(db_session, monkeypatch):
    called = []
    def fake_pol(args, case_id, db):
        called.append(True)
        return {"ok": True, "card": {"type": "policy_check"}, "summary": "政策查询结果"}

    monkeypatch.setattr("core.chat.tools._policy_check", fake_pol)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["政策要求如下"]):
        gen = run_chat_with_tools_stream("CASE-T", "查一下ORDE的LVR政策要求", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert len(called) == 1
    assert "tool_cards" in events
    assert "done" in events


def test_intent_tool_failure_does_not_block_done(db_session, monkeypatch):
    def fake_failing_calc(args, case_id, db):
        raise RuntimeError("Calculation backend exploded")

    monkeypatch.setattr("core.chat.tools._calculator_assess", fake_failing_calc)
    with patch("core.ai.gateway.ApiGateway.call_llm_stream", return_value=["即使计算失败也正常回复"]):
        gen = run_chat_with_tools_stream("CASE-T", "算一下能贷多少", "internal", db_session)
        events, _text = _collect_stream_events(gen)

    assert "done" in events
    assert len(_text) > 0
