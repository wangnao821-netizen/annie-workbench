"""五层注入协议测试 — 缓存友好排序 + 对话窗口 + 模型路由（#8/#10）。"""

from __future__ import annotations

import pytest

from core.ai.gateway import ApiCallResult, ApiGateway
from core.chat.context import DIALOGUE_TOKEN_BUDGET, LAYER_ORDER, build_chat_layers
from core.chat.loop import run_chat_with_tools
from core.models.orm import Case, CaseChatMessage

DIALOGUE_BUDGET_CHARS = DIALOGUE_TOKEN_BUDGET * 2


@pytest.fixture(autouse=True)
def _injection_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-fake-key-12345")
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")


def _add_case(db, case_id: str) -> None:
    db.add(Case(id=case_id, client_name="PERSON_1", lender="CBA"))
    db.commit()


def _result(response_text: str = "ok", tool_calls=None) -> ApiCallResult:
    return ApiCallResult(
        response_text=response_text,
        prompt_tokens=0,
        completion_tokens=0,
        cost_usd=0.0,
        latency_ms=0,
        tool_calls=tool_calls,
    )


def _add_messages(db, case_id: str, n: int, content_fn) -> None:
    for i in range(1, n + 1):
        db.add(CaseChatMessage(
            case_id=case_id,
            session_id=case_id,
            role="user" if i % 2 else "assistant",
            content=content_fn(i),
        ))
    db.commit()


def _dialogue(db, case_id: str) -> str:
    return next(
        l["text"] for l in build_chat_layers(case_id, "你好", "internal", db)
        if l["layer"] == "dialogue"
    )


class TestLayerOrder:
    def test_cache_friendly_order(self, test_db):
        _add_case(test_db, "LO-1")
        layers = build_chat_layers("LO-1", "你好", "internal", test_db)
        assert [l["layer"] for l in layers] == LAYER_ORDER

    def test_global_chat_no_case_layers(self, test_db):
        layers = build_chat_layers(None, "你好", "internal", test_db)
        assert [l["layer"] for l in layers] == ["role", "live"]
        assert "你好" in layers[1]["text"]


class TestDialogueWindow:
    def test_recent_rounds_appended(self, test_db):
        _add_case(test_db, "DW-1")
        _add_messages(test_db, "DW-1", 12, lambda i: f"msg-{i:02d}")
        msgs = [m for m in _dialogue(test_db, "DW-1").split("\n") if m]
        assert len(msgs) == 10
        assert not any("msg-01" in m or "msg-02" in m for m in msgs)
        assert msgs[0].endswith("msg-03")
        assert msgs[-1].endswith("msg-12")

    def test_over_budget_truncated_from_head(self, test_db):
        _add_case(test_db, "DW-2")
        _add_messages(test_db, "DW-2", 6, lambda i: (f"M{i}") + "x" * 290)
        dialogue = _dialogue(test_db, "DW-2")
        assert len(dialogue) <= DIALOGUE_BUDGET_CHARS
        assert "M1" not in dialogue
        assert "M6" in dialogue


class TestModelRouting:
    def test_external_prefers_gemini(self, test_db, monkeypatch):
        _add_case(test_db, "MR-1")
        seen = {}

        def fake(self, **kwargs):
            seen["prefer_provider"] = kwargs.get("prefer_provider")
            return _result()

        monkeypatch.setattr(ApiGateway, "call_llm", fake)
        run_chat_with_tools("MR-1", "写封英文邮件给 NAB", "external", test_db)
        assert seen["prefer_provider"] == "gemini"

    def test_internal_no_prefer(self, test_db, monkeypatch):
        _add_case(test_db, "MR-2")
        seen = {}

        def fake(self, **kwargs):
            seen["prefer_provider"] = kwargs.get("prefer_provider")
            return _result()

        monkeypatch.setattr(ApiGateway, "call_llm", fake)
        run_chat_with_tools("MR-2", "帮我看看进度", "internal", test_db)
        assert seen["prefer_provider"] is None