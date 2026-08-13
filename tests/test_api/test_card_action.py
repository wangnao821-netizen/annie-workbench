"""tests/test_api/test_card_action.py — 共创卡动作通道（F-15 对接补丁）"""

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case, CaseContextEvent
from server.deps import get_db
from server.main import app

FAKE_DRAFT = {"subject": "Loan Progress Update", "body": "Dear Sir/Madam, ..."}


@pytest.fixture(autouse=True)
def _no_real_llm(monkeypatch):
    monkeypatch.setattr("core.agents.draft_email._gen_draft",
                        lambda case_id, intent, recipient, previous, db: dict(FAKE_DRAFT))


@pytest.fixture
def client(test_env):
    test_db = test_env["db"]

    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _case(test_env, cid: str) -> None:
    db = test_env["db"]
    db.add(Case(id=cid, client_name=f"Case {cid}"))
    db.commit()


def test_card_action_new_followup(client, test_env):
    _case(test_env, "ca_v1")
    res = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_v1", "action": "new"})
    assert res.status_code == 200
    body = res.json()
    card = body["tool_cards"][0]
    assert card["type"] == "flow_followup"
    assert card["presentation"] == "dialog"
    assert card["payload"]["status"] == "draft"
    assert card["payload"]["result"]["versions"][0]["version"] == "V1"


def test_card_action_version_chain(client, test_env):
    _case(test_env, "ca_v2")
    first = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_v2", "action": "new"}).json()
    msg_id = first["tool_cards"][0]["payload"]["state"]["message_id"]
    second = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_v2", "action": "version", "parent_message_id": msg_id}).json()
    payload = second["tool_cards"][0]["payload"]
    assert payload["result"]["versions"][0]["version"] == "V2"


def test_card_action_branch(client, test_env):
    _case(test_env, "ca_br")
    res = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_br", "action": "new", "branch_label": "B"}).json()
    payload = res["tool_cards"][0]["payload"]
    assert payload["state"]["branch_label"] == "B"


def test_card_action_confirm_distills(client, test_env):
    _case(test_env, "ca_cf")
    first = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_cf", "action": "new"}).json()
    msg_id = first["tool_cards"][0]["payload"]["state"]["message_id"]
    res = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_cf", "action": "confirm", "parent_message_id": msg_id}).json()
    payload = res["tool_cards"][0]["payload"]
    assert payload["action"] == "confirm"
    assert payload["status"] == "confirmed_draft"
    events = test_env["db"].query(CaseContextEvent).filter(CaseContextEvent.case_id == "ca_cf").all()
    assert any(e.source_type == "flow:draft_email" for e in events)


def test_card_action_unknown_flow_404(client):
    res = client.post("/api/agent/cards/action", json={"flow_key": "bogus", "action": "new"})
    assert res.status_code == 404


def test_card_action_no_case_blocked(client):
    res = client.post("/api/agent/cards/action", json={"flow_key": "followup", "action": "new"}).json()
    assert res["tool_cards"][0]["payload"]["status"] == "blocked"


def test_card_action_skips_pai(client, test_env, monkeypatch):
    _case(test_env, "ca_pai")

    def should_not_run(*a, **k):
        raise AssertionError("卡片动作不应走 PAI/LLM")

    monkeypatch.setattr("core.agents.pai.run_flow_with_pai", should_not_run)
    res = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_pai", "action": "new"})
    assert res.status_code == 200
    assert res.json()["tool_cards"][0]["payload"]["status"] == "draft"


def test_card_action_response_shape(client, test_env):
    _case(test_env, "ca_shape")
    res = client.post("/api/agent/cards/action", json={"flow_key": "followup", "case_id": "ca_shape", "action": "new"}).json()
    assert set(res.keys()) == {"reply", "tool_cards", "recorded_facts", "presentation"}