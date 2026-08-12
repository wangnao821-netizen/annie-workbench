"""对话协议测试 — 服务端工具循环 + 卡片（#12）。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.ai.gateway import ApiCallResult, ApiGateway
from core.models.orm import Case, CaseChatMessage, CaseContextEvent
from server.deps import get_db
from server.main import app


@pytest.fixture(autouse=True)
def _chat_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-fake-key-12345")
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _add_case(db, case_id: str) -> None:
    db.add(Case(id=case_id, client_name="客户样例", stage="收集资料"))
    db.commit()


def _result(response_text: str, tool_calls=None) -> ApiCallResult:
    return ApiCallResult(
        response_text=response_text,
        prompt_tokens=0,
        completion_tokens=0,
        cost_usd=0.0,
        latency_ms=0,
        tool_calls=tool_calls,
    )


def _record_fact(content: str, confidence: str) -> list[dict]:
    return [{"name": "record_fact", "arguments": {"content": content, "confidence": confidence}}]


def _install_fake(monkeypatch, responses):
    """按调用序号返回响应的假 call_llm，并记录每次调用的入参。"""
    state = {"n": 0, "seen": []}

    def fake(self, **kwargs):
        state["seen"].append(dict(kwargs))
        idx = min(state["n"], len(responses) - 1)
        state["n"] += 1
        return responses[idx]

    monkeypatch.setattr(ApiGateway, "call_llm", fake)
    return state


class TestRecordFact:
    def test_high_confidence_confirmed(self, client, test_db, monkeypatch):
        _add_case(test_db, "RF-1")
        _install_fake(monkeypatch, [
            _result("", _record_fact("客户月收入 $850,000", "high")),
            _result("好的，已记录。"),
        ])
        resp = client.post("/api/chat", json={"case_id": "RF-1", "message": "记一下客户月收入"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["recorded_facts"][0]["status"] == "confirmed"
        assert body["tool_cards"] == []

        evt = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "RF-1").first()
        assert evt is not None
        assert evt.status == "confirmed"

        # 手动验收：GET /context-events?status=confirmed 可见该事实（§验收标准 2）
        ok = client.get("/api/cases/RF-1/context-events", params={"status": "confirmed"})
        assert ok.status_code == 200
        assert [e["content"] for e in ok.json()] == ["客户月收入 $850,000"]
        assert ok.json()[0]["status"] == "confirmed"

    def test_low_confidence_pending_card(self, client, test_db, monkeypatch):
        _add_case(test_db, "RF-2")
        _install_fake(monkeypatch, [
            _result("", _record_fact("客户收入可能不稳定", "low")),
            _result("好的。"),
        ])
        resp = client.post("/api/chat", json={"case_id": "RF-2", "message": "记一下"})
        assert resp.status_code == 200
        body = resp.json()
        cards = body["tool_cards"]
        assert len(cards) == 1
        assert cards[0]["type"] == "record_confirm"
        assert cards[0]["payload"]["status"] == "pending"
        assert cards[0]["payload"]["content"] == "客户收入可能不稳定"

        evt = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "RF-2").first()
        assert evt is not None
        assert evt.status == "pending"
        assert body["recorded_facts"] == []

    def test_global_chat_no_tools(self, client, test_db, monkeypatch):
        state = _install_fake(monkeypatch, [_result("通用咨询回复。")])
        resp = client.post("/api/chat", json={"message": "你好"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["tool_cards"] == []
        assert body["recorded_facts"] == []
        assert state["seen"][0]["tools"] is None
        assert state["seen"][0]["tool_choice"] == "none"

    def test_global_chat_record_fact_rejected(self, client, test_db, monkeypatch):
        _install_fake(monkeypatch, [
            _result("", _record_fact("客户月收入 $850,000", "high")),
            _result("全局对话不能写事实。"),
        ])
        resp = client.post("/api/chat", json={"message": "帮我记一笔"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["tool_cards"] == []
        assert body["recorded_facts"] == []
        assert test_db.query(CaseContextEvent).count() == 0


class TestSubmissionSuggest:
    def test_suggest_card(self, client, test_db, monkeypatch):
        _add_case(test_db, "SS-1")
        _install_fake(monkeypatch, [
            _result("", [{"name": "suggest_submission", "arguments": {}}]),
            _result("好的。"),
        ])
        resp = client.post("/api/chat", json={"case_id": "SS-1", "message": "帮 NAB 写封邮件"})
        assert resp.status_code == 200
        cards = resp.json()["tool_cards"]
        assert len(cards) == 1
        assert cards[0]["type"] == "submission_suggest"
        assert cards[0]["payload"]["message"]


class TestToolLoop:
    def test_max_rounds_truncated(self, client, test_db, monkeypatch):
        _add_case(test_db, "TL-1")

        def always_tool(self, **kwargs):
            return _result("", [{"name": "suggest_submission", "arguments": {}}])

        monkeypatch.setattr(ApiGateway, "call_llm", always_tool)
        resp = client.post("/api/chat", json={"case_id": "TL-1", "message": "递交流程"})
        assert resp.status_code == 200
        assert "截断" in resp.json()["reply"]

    def test_tool_result_no_pii_echo(self, client, test_db, monkeypatch):
        _add_case(test_db, "PII-1")
        content = "王小明 月收入 $850,000"
        state = _install_fake(monkeypatch, [
            _result("", _record_fact(content, "high")),
            _result("已记录。"),
        ])
        resp = client.post("/api/chat", json={"case_id": "PII-1", "message": "帮我记一笔。"})
        assert resp.status_code == 200
        # 第 2 轮 prompt 由 base_prompt + 工具结果回注组成，必须不含事件 content 原文
        round2_prompt = str(state["seen"][1]["text"])
        assert "王小明" not in round2_prompt
        assert "$850,000" not in round2_prompt
        assert "已记录" in resp.json()["reply"]

    def test_chat_persists_messages(self, client, test_db, monkeypatch):
        _add_case(test_db, "PM-1")
        _install_fake(monkeypatch, [_result("案件对话回复。")])
        resp = client.post("/api/chat", json={"case_id": "PM-1", "message": "你好"})
        assert resp.status_code == 200
        rows = (test_db.query(CaseChatMessage)
                .filter(CaseChatMessage.case_id == "PM-1")
                .order_by(CaseChatMessage.id)
                .all())
        assert [r.role for r in rows] == ["user", "assistant"]
        assert rows[0].content == "你好"
        assert rows[1].content == "案件对话回复。"