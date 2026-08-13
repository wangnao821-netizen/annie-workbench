"""tests/test_api/test_agent_router.py — Agent 对话路由集成测试 (WO-26)"""

import pytest
from fastapi.testclient import TestClient

from core.ai.gateway import ApiCallResult
from core.models.orm import Case, CaseChatMessage
from server.deps import get_db
from server.main import app


@pytest.fixture(autouse=True)
def _router_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    import core.config
    core.config._cached_config = None


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_router_declaration_check(client, test_db):
    test_db.add(Case(id="case_dec_api", client_name="Test Client"))
    test_db.commit()

    resp = client.post(
        "/api/chat/",
        json={"message": "检查一下申报一致性", "case_id": "case_dec_api"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tool_cards"]) == 1
    card = data["tool_cards"][0]
    assert card["type"] == "flow_declaration_check"
    assert card["presentation"] == "result_card"


def test_router_calculator(client):
    resp = client.post(
        "/api/chat/",
        json={"message": "算一下贷款能力"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tool_cards"]) == 1
    card = data["tool_cards"][0]
    assert card["type"] == "flow_calculator"
    assert card["presentation"] == "dialog"


def test_router_case_intake(client):
    resp = client.post(
        "/api/chat/",
        json={"message": "帮我建个案件"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tool_cards"]) == 1
    card = data["tool_cards"][0]
    assert card["type"] == "flow_case_intake"
    assert card["presentation"] == "dialog"


def test_router_unmatched_falls_to_tool_loop(client, monkeypatch):
    def fake_llm(*args, **kwargs):
        return ApiCallResult(
            response_text="今天天气晴朗。",
            prompt_tokens=10,
            completion_tokens=5,
            cost_usd=0.0,
            latency_ms=100,
            tool_calls=None,
        )

    monkeypatch.setattr("core.ai.gateway.ApiGateway.call_llm", fake_llm)

    resp = client.post(
        "/api/chat/",
        json={"message": "今天有什么安排"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert not any(c["type"].startswith("flow_") for c in data["tool_cards"])
    assert "今天天气" in data["reply"]


def test_router_flow_history_saved(client, test_db):
    test_db.add(Case(id="case_hist_api", client_name="History Case"))
    test_db.commit()

    resp = client.post(
        "/api/chat/",
        json={"message": "帮我检查一下申报", "case_id": "case_hist_api"},
    )
    assert resp.status_code == 200

    history = (
        test_db.query(CaseChatMessage)
        .filter(CaseChatMessage.case_id == "case_hist_api")
        .all()
    )
    assert len(history) == 2
    assert history[0].role == "user"
    assert history[0].content == "帮我检查一下申报"
    assert history[1].role == "assistant"


def test_router_no_pii_leakage(client, test_db):
    test_db.add(Case(id="case_pii", client_name="张三"))
    test_db.commit()

    resp = client.post(
        "/api/chat/",
        json={"message": "算一下贷款能力", "case_id": "case_pii"},
    )
    assert resp.status_code == 200
    data = resp.json()
    reply = data["reply"]
    assert "[PERSON_" not in reply
    assert "[PHONE_" not in reply
    assert "[EMAIL_" not in reply
