"""WO-35 会话压缩单元测试。"""

from __future__ import annotations

import pytest

from core.ai.gateway import ApiCallResult, ApiGateway
from core.chat.compression import (
    _SOURCE_REF_PREFIX,
    SESSION_COMPRESSION_SOURCE_TYPE,
    ensure_session_compression,
)
from core.chat.context import build_chat_layers
from core.config import get_config
from core.models.orm import Case, CaseChatMessage, CaseContextEvent, PIIMap


@pytest.fixture(autouse=True)
def _session_compression_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-fake-key-12345")
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")


def _add_case(db, case_id: str) -> None:
    db.add(Case(id=case_id, client_name="PERSON_1", lender="CBA"))
    db.commit()


def _add_messages(db, case_id: str, n: int, content_fn=None) -> list[CaseChatMessage]:
    if content_fn is None:
        content_fn = lambda i: f"对话消息-{i:03d}"
    msgs = []
    for i in range(1, n + 1):
        m = CaseChatMessage(
            case_id=case_id,
            session_id=case_id,
            role="user" if i % 2 else "assistant",
            content=content_fn(i),
        )
        db.add(m)
        msgs.append(m)
    db.commit()
    return msgs


def test_disabled_does_not_compress(test_db, monkeypatch):
    # enabled=False 时插入 40 条消息 → 无 session_compression 事件
    _add_case(test_db, "SC-1")
    _add_messages(test_db, "SC-1", 40)
    monkeypatch.setattr(get_config().settings.ai.session_compression, "enabled", False)
    summary = ensure_session_compression("SC-1", test_db)
    assert summary == ""
    events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "SC-1",
            CaseContextEvent.source_type == SESSION_COMPRESSION_SOURCE_TYPE,
        )
        .all()
    )
    assert len(events) == 0


def test_below_threshold_returns_empty(test_db):
    # 15 条消息（< trigger_messages 30） → ensure_session_compression 返回 ""
    _add_case(test_db, "SC-2")
    _add_messages(test_db, "SC-2", 15)
    summary = ensure_session_compression("SC-2", test_db)
    assert summary == ""


def test_compress_writes_event(test_db, monkeypatch):
    # 40 条消息 → 事件存在，source_type=="session_compression"、status=="confirmed"、source_ref 前缀 session_compression:、content 非空、track=="internal"
    monkeypatch.setattr(
        ApiGateway,
        "call_llm",
        lambda self, **kw: ApiCallResult(response_text="蒸馏摘要测试内容"),
    )
    _add_case(test_db, "SC-3")
    _add_messages(test_db, "SC-3", 40)
    summary = ensure_session_compression("SC-3", test_db, track="internal")
    assert summary != ""
    events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "SC-3",
            CaseContextEvent.source_type == SESSION_COMPRESSION_SOURCE_TYPE,
        )
        .all()
    )
    assert len(events) == 1
    evt = events[0]
    assert evt.source_type == SESSION_COMPRESSION_SOURCE_TYPE
    assert evt.status == "confirmed"
    assert evt.source_ref.startswith(_SOURCE_REF_PREFIX)
    assert evt.content != ""
    assert evt.track == "internal"


def test_compress_idempotent(test_db, monkeypatch):
    # 再次调用 → 事件总数不变（source_ref 去重生效）
    monkeypatch.setattr(
        ApiGateway,
        "call_llm",
        lambda self, **kw: ApiCallResult(response_text="蒸馏摘要测试内容"),
    )
    _add_case(test_db, "SC-4")
    _add_messages(test_db, "SC-4", 40)
    ensure_session_compression("SC-4", test_db)
    ensure_session_compression("SC-4", test_db)
    events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "SC-4",
            CaseContextEvent.source_type == SESSION_COMPRESSION_SOURCE_TYPE,
        )
        .all()
    )
    assert len(events) == 1


def test_keep_recent_messages_not_compressed(test_db, monkeypatch):
    # 摘要 content 不含最近 20 条内的标记词（构造消息时用唯一标记词验证）
    seen_prompts = []

    def fake_llm(self, text, **kwargs):
        seen_prompts.append(str(text))
        return ApiCallResult(response_text="摘要")

    monkeypatch.setattr(ApiGateway, "call_llm", fake_llm)
    _add_case(test_db, "SC-5")
    _add_messages(
        test_db,
        "SC-5",
        40,
        lambda i: f"OLD_MARKER_{i}" if i <= 20 else f"RECENT_MARKER_{i}",
    )
    ensure_session_compression("SC-5", test_db)
    assert len(seen_prompts) == 1
    assert "OLD_MARKER_1" in seen_prompts[0]
    assert "RECENT_MARKER_21" not in seen_prompts[0]
    assert "RECENT_MARKER_40" not in seen_prompts[0]


def test_llm_failure_fallback_truncation(test_db, monkeypatch):
    # monkeypatch ApiGateway.call_llm 抛异常 → 事件仍写入、content 为截断文本非空
    def raise_err(self, **kwargs):
        raise RuntimeError("LLM Failure Test")

    monkeypatch.setattr(ApiGateway, "call_llm", raise_err)
    _add_case(test_db, "SC-6")
    _add_messages(test_db, "SC-6", 40)
    summary = ensure_session_compression("SC-6", test_db)
    assert summary != ""
    events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "SC-6",
            CaseContextEvent.source_type == SESSION_COMPRESSION_SOURCE_TYPE,
        )
        .all()
    )
    assert len(events) == 1


def test_summary_injected_into_dialogue(test_db, monkeypatch):
    # 压缩后 build_chat_layers(case_id, "你好", "internal", db) 的 dialogue 层文本含【历史对话摘要】
    monkeypatch.setattr(
        ApiGateway,
        "call_llm",
        lambda self, **kw: ApiCallResult(response_text="历史摘要节点"),
    )
    _add_case(test_db, "SC-7")
    _add_messages(test_db, "SC-7", 40)
    layers = build_chat_layers("SC-7", "你好", "internal", test_db)
    dialogue_layer = next(l for l in layers if l["layer"] == "dialogue")
    assert "【历史对话摘要】" in dialogue_layer["text"]


def test_pii_rehydrated_in_summary(test_db, monkeypatch):
    # 消息含 PERSON_1 占位符 → 摘要经 rehydrate 后不含原始占位符形态的泄漏标记（或含还原值）
    _add_case(test_db, "SC-8")
    test_db.add(
        PIIMap(
            case_id="SC-8",
            token="PERSON_1",
            real_value="张三",
            pii_type="person",
        )
    )
    test_db.commit()
    _add_messages(
        test_db,
        "SC-8",
        40,
        lambda i: f"客户张三的贷款额度{i}" if i <= 20 else f"近期消息{i}",
    )
    monkeypatch.setattr(
        ApiGateway,
        "call_llm",
        lambda self, **kw: ApiCallResult(response_text="PERSON_1 申请贷款 100 万"),
    )
    summary = ensure_session_compression("SC-8", test_db)
    assert "PERSON_1" not in summary
    assert "张三" in summary
