"""防串案协议② — 事实归属校验建议卡 测试（2026-08-14）。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.ai.gateway import ApiCallResult, ApiGateway
from core.models.orm import Case, CaseContextEvent, PIIMap
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


def _result(response_text: str, tool_calls=None) -> ApiCallResult:
    return ApiCallResult(
        response_text=response_text,
        prompt_tokens=0,
        completion_tokens=0,
        cost_usd=0.0,
        latency_ms=0,
        tool_calls=tool_calls,
    )


def _install_fake(monkeypatch, responses):
    """按调用序号返回响应的假 call_llm。"""
    state = {"n": 0}

    def fake(self, **kwargs):
        idx = min(state["n"], len(responses) - 1)
        state["n"] += 1
        return responses[idx]

    monkeypatch.setattr(ApiGateway, "call_llm", fake)
    return state


class TestAttributionSuggest:
    def test_other_client_name_blocks_and_cards(self, client, test_db, monkeypatch):
        test_db.add(Case(id="AS-1", client_name="张三", lender="CBA"))
        test_db.add(Case(id="AS-2", client_name="李四", lender="NAB"))
        test_db.commit()
        _install_fake(
            monkeypatch,
            [
                _result(
                    "",
                    [{"name": "record_fact", "arguments": {"content": "李四也要转贷", "confidence": "high"}}],
                ),
                _result("这条信息看起来属于李四（NAB），我没有记录。"),
            ],
        )
        resp = client.post("/api/chat", json={"case_id": "AS-1", "message": "记一下李四转贷"})
        assert resp.status_code == 200
        body = resp.json()
        cards = body["tool_cards"]
        assert len(cards) == 1
        assert cards[0]["type"] == "attribution_suggest"
        payload = cards[0]["payload"]
        assert payload["matched_client"] == "李四"
        assert payload["matched_lender"] == "NAB"
        assert payload["matched_case_id"] == "AS-2"
        # 未确认不写入、不进蒸馏
        assert test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "AS-1").count() == 0
        assert body["recorded_facts"] == []

    def test_placeholder_name_rehydrated_and_blocked(self, client, test_db, monkeypatch):
        test_db.add(Case(id="AS-3", client_name="张三", lender="CBA"))
        test_db.add(Case(id="AS-4", client_name="李四", lender="NAB"))
        test_db.add(PIIMap(case_id="AS-3", token="PERSON_2", real_value="李四", pii_type="name"))
        test_db.commit()
        _install_fake(
            monkeypatch,
            [
                _result(
                    "",
                    [{"name": "record_fact", "arguments": {"content": "PERSON_2 也要转贷", "confidence": "high"}}],
                ),
                _result("好的。"),
            ],
        )
        resp = client.post("/api/chat", json={"case_id": "AS-3", "message": "记一笔"})
        body = resp.json()
        cards = body["tool_cards"]
        assert len(cards) == 1
        assert cards[0]["payload"]["matched_client"] == "李四"
        assert test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "AS-3").count() == 0

    def test_current_client_name_not_blocked(self, client, test_db, monkeypatch):
        test_db.add(Case(id="AS-5", client_name="张三", lender="CBA"))
        test_db.add(Case(id="AS-6", client_name="李四", lender="NAB"))
        test_db.commit()
        _install_fake(
            monkeypatch,
            [
                _result(
                    "",
                    [{"name": "record_fact", "arguments": {"content": "张三月收入 $850,000", "confidence": "high"}}],
                ),
                _result("好的，已记录。"),
            ],
        )
        resp = client.post("/api/chat", json={"case_id": "AS-5", "message": "记收入"})
        body = resp.json()
        assert body["tool_cards"] == []
        assert len(body["recorded_facts"]) == 1
        assert test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "AS-5").count() == 1

    def test_no_other_client_match_writes_normally(self, client, test_db, monkeypatch):
        test_db.add(Case(id="AS-7", client_name="张三", lender="CBA"))
        test_db.commit()
        _install_fake(
            monkeypatch,
            [
                _result(
                    "",
                    [{"name": "record_fact", "arguments": {"content": "月收入 $850,000", "confidence": "high"}}],
                ),
                _result("好的，已记录。"),
            ],
        )
        resp = client.post("/api/chat", json={"case_id": "AS-7", "message": "记收入"})
        body = resp.json()
        assert body["tool_cards"] == []
        assert len(body["recorded_facts"]) == 1
        assert test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "AS-7").count() == 1
