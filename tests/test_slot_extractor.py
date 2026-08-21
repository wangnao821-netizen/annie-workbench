"""tests/test_slot_extractor.py — 槽位提取与时间解析测试 (WO-65)。

包含相对时间规则折算、任务标题深度降噪、财务槽位提取与 LLM 兜底 mock 测试。
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from core.chat.slot_extractor import (
    extract_financial_slots,
    extract_task_slots,
    llm_extract_slots,
)
from core.chat.time_parser import resolve_relative_time
from core.models.db import get_sa_session


@pytest.fixture
def db_session(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key-mock")
    db = next(get_sa_session())
    yield db
    db.close()


def test_relative_time_resolution():
    tz = ZoneInfo("Australia/Sydney")
    # 基准时间：2026-08-20 (周四) 10:00
    ref = datetime(2026, 8, 20, 10, 0, 0, tzinfo=tz)

    assert "2026-08-20T18:00:00+10:00" == resolve_relative_time("今天", ref)
    assert "2026-08-20T21:00:00+10:00" == resolve_relative_time("今晚", ref)
    assert "2026-08-21T09:00:00+10:00" == resolve_relative_time("明天", ref)
    assert "2026-08-21T15:00:00+10:00" == resolve_relative_time("明天下午", ref)
    assert "2026-08-22T09:00:00+10:00" == resolve_relative_time("后天", ref)
    assert "2026-08-24T17:00:00+10:00" == resolve_relative_time("下周一", ref)
    assert "2026-08-28T17:00:00+10:00" == resolve_relative_time("下周五", ref)
    assert "2026-08-21T17:00:00+10:00" == resolve_relative_time("周五前", ref)
    assert "2026-08-23T17:00:00+10:00" == resolve_relative_time("3天后", ref)
    assert "2026-08-31T17:00:00+10:00" == resolve_relative_time("月底", ref)

    # 歧义规则：周日时说"下周一" = 明天 (+1天)
    ref_sun = datetime(2026, 8, 23, 10, 0, 0, tzinfo=tz)
    assert "2026-08-24T17:00:00+10:00" == resolve_relative_time("下周一", ref_sun)


def test_task_slots_cleaning_and_priority():
    tz = ZoneInfo("Australia/Sydney")
    ref = datetime(2026, 8, 20, 10, 0, 0, tzinfo=tz)

    r1 = extract_task_slots("下周一记一下，我要去电话和客户沟通一下", ref_time=ref)
    assert "电话和客户沟通一下" in r1["title"]
    assert "记一下" not in r1["title"]
    assert r1["deadline"] == "2026-08-24T17:00:00+10:00"
    assert r1["priority"] == "normal"
    assert r1["confidence"] == "high"

    r2 = extract_task_slots("帮我建一个加急待办：明天下午催客户补交ANZ对账单", ref_time=ref)
    assert "催客户补交ANZ对账单" in r2["title"]
    assert r2["deadline"] == "2026-08-21T15:00:00+10:00"
    assert r2["priority"] == "high"

    r3 = extract_task_slots("设个提醒：周五前给律师发邮件", ref_time=ref)
    assert "给律师发邮件" in r3["title"]
    assert r3["deadline"] is not None

    # WO-70 补充：口语应答词与调度废话清洗测试
    r4 = extract_task_slots("好的把下周一的催收电话也排到这个时间", ref_time=ref)
    assert "催收电话" in r4["title"]
    assert "好的把" not in r4["title"]
    assert "也排到" not in r4["title"]
    assert r4["deadline"] == "2026-08-24T17:00:00+10:00"

    r5 = extract_task_slots("嗯安排一下明天下午跟客户打电话确认材料", ref_time=ref)
    assert "跟客户打电话确认材料" in r5["title"]
    assert "安排一下" not in r5["title"]


def test_financial_slots_extraction(db_session):
    s1 = extract_financial_slots("算一下如果加配偶收入8万能不能借180万", db_session)
    assert s1["spouse_income"] == 80000.0
    assert s1["target_loan"] == 1800000.0
    assert s1["confidence"] == "high"

    s2 = extract_financial_slots("自雇营业额80万，利率降到6.2%月供大概多少", db_session)
    assert s2["employment_income"] == 800000.0
    assert s2["interest_rate"] == 6.2
    assert s2["confidence"] == "high"


def test_llm_extract_slots_fallback(db_session, monkeypatch):
    fake_json = '{"title": "跟进银行批复", "deadline": "2026-08-25T17:00:00+10:00", "priority": "high"}'
    with patch("core.ai.gateway.ApiGateway.call_llm") as mock_call:
        from core.ai.gateway import ApiCallResult
        mock_call.return_value = ApiCallResult(response_text=fake_json, prompt_tokens=10, completion_tokens=10, cost_usd=0.0, latency_ms=50)
        res = llm_extract_slots("特殊的未知口语指令", "task_create", "CASE-T", db_session)
        assert res.get("title") == "跟进银行批复"
        assert res.get("priority") == "high"


def test_llm_fallback_error_silently_handled(db_session, monkeypatch):
    with patch("core.ai.gateway.ApiGateway.call_llm", side_effect=RuntimeError("LLM exploded")):
        res = llm_extract_slots("任何内容", "task_create", "CASE-T", db_session)
        assert res == {}
