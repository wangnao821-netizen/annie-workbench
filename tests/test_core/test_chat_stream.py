"""流式对话工具调用测试：tool_start / tool_cards / text_chunk / done 事件序列。"""

from __future__ import annotations

from core.ai.gateway import ApiCallResult
from core.chat.loop import run_chat_with_tools_stream
from core.models.orm import Case


class _FakeGateway:
    """首个 call_llm 返回工具调用，后续无工具；call_llm_stream 逐步 yield 文本。"""

    def __init__(self, config=None):
        self.config = config
        self.calls = 0

    def call_llm(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return ApiCallResult(
                response_text="",
                prompt_tokens=10,
                completion_tokens=5,
                cost_usd=0.0,
                latency_ms=100,
                tool_calls=[
                    {
                        "name": "folder_lookup",
                        "arguments": {"query": "payslip"},
                    }
                ],
            )
        return ApiCallResult(
            response_text="已检索到相关文件。",
            prompt_tokens=10,
            completion_tokens=5,
            cost_usd=0.0,
            latency_ms=100,
            tool_calls=None,
        )

    def call_llm_stream(self, **kwargs):
        yield "已"
        yield "完成"


class _NoToolGateway(_FakeGateway):
    """无工具场景：call_llm 从不返回 tool_calls。"""

    def call_llm(self, **kwargs):
        return ApiCallResult(
            response_text="你好！",
            prompt_tokens=10,
            completion_tokens=5,
            cost_usd=0.0,
            latency_ms=100,
            tool_calls=None,
        )


def test_stream_emits_tool_start_and_cards(test_db, monkeypatch):
    test_db.add(Case(id="ST-1", client_name="流式测试", lender="CBA", folder_path="C:/tmp/cf"))
    test_db.commit()
    monkeypatch.setattr("core.chat.loop.ApiGateway", _FakeGateway)
    monkeypatch.setattr("core.agents.router.route_flow", lambda *a, **k: None)
    monkeypatch.setattr(
        "core.chat.loop.execute_tool",
        lambda name, args, case_id, track, db: {"status": "ok", "files": ["payslip.pdf"]},
    )

    events = list(run_chat_with_tools_stream("ST-1", "去文件夹找 payslip", "internal", test_db))
    kinds = [ev["event"] for ev in events]

    assert "tool_start" in kinds
    assert "tool_cards" in kinds
    assert "text_chunk" in kinds
    assert "done" in kinds

    tool_start = next(ev for ev in events if ev["event"] == "tool_start")
    assert tool_start["data"]["tool"] == "folder_lookup"
    assert tool_start["data"]["label"]  # 中文标签非空

    done = next(ev for ev in events if ev["event"] == "done")
    assert done["data"]["reply"] == "已完成"
    assert isinstance(done["data"]["tool_cards"], list)


def test_stream_without_tools_only_text(test_db, monkeypatch):
    """无 case_id（全局对话）不触发工具，直接文本流式。"""
    monkeypatch.setattr("core.chat.loop.ApiGateway", _NoToolGateway)
    monkeypatch.setattr("core.agents.router.route_flow", lambda *a, **k: None)

    events = list(run_chat_with_tools_stream(None, "你好", "internal", test_db))
    kinds = [ev["event"] for ev in events]
    assert "tool_start" not in kinds
    assert "text_chunk" in kinds
    assert "done" in kinds
