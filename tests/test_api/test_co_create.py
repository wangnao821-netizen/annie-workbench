"""tests/test_api/test_co_create.py — WO-46b 共创弹窗深谈端点专项测试。

覆盖：clarify 全景/不落草稿、无案件 404、generate 出 V1 + 脱敏还原红线、
version V2 引用上一版、branch B 分支独立版本链、confirm 写事件 + create_todo 建 Action、
blocked（confirm 无父版本）、flow_key/action 白名单 422。
"""

import pytest
from fastapi.testclient import TestClient

from core.ai.gateway import ApiCallResult
from core.models.orm import Action, Case, CaseChatMessage, CaseContextEvent
from server.deps import get_db
from server.main import app

FAKE_DRAFT_SUBJECT = "Loan Progress Update"


def _llm_result(response_text: str) -> ApiCallResult:
    return ApiCallResult(
        response_text=response_text,
        prompt_tokens=0,
        completion_tokens=0,
        cost_usd=0.0,
        latency_ms=0,
    )


@pytest.fixture
def fake_llm(monkeypatch):
    """确定性假 LLM：绕过网络，返回固定英文草稿 JSON。"""
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")

    def fake_call_llm(self, *args, **kwargs):
        return _llm_result('{"subject": "Loan Progress Update", "body": "Dear Sir/Madam, we are following up on your loan application."}')

    monkeypatch.setattr("core.ai.gateway.ApiGateway.call_llm", fake_call_llm)


@pytest.fixture
def client(test_env):
    test_db = test_env["db"]

    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _case(test_env, cid: str, client_name: str = "王小明", lender: str = "CBA", stage: str = "submitted") -> None:
    db = test_env["db"]
    db.add(Case(id=cid, client_name=client_name, lender=lender, stage=stage))
    db.commit()


def _chat(client, case_id: str, action: str, **extra):
    body = {"case_id": case_id, "flow_key": "followup", "action": action}
    body.update(extra)
    return client.post("/api/agent/co-create/chat", json=body)


def test_clarify_returns_panorama_no_draft(client, test_env):
    _case(test_env, "cc_cl", client_name="王小明", lender="CBA", stage="submitted")
    res = _chat(client, "cc_cl", "clarify")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "clarifying"
    assert body["draft"] is None
    assert body["versions"] == []
    assert body["event_id"] is None and body["task_id"] is None
    reply = body["reply"]
    assert "客户名" in reply and "王小明" in reply
    assert "银行" in reply and "CBA" in reply
    assert "阶段" in reply and "submitted" in reply
    assert test_env["db"].query(CaseChatMessage).filter(CaseChatMessage.case_id == "cc_cl").count() == 0


def test_clarify_no_case_404(client, test_env):
    res = _chat(client, "cc_missing", "clarify")
    assert res.status_code == 404


def test_generate_v1(client, test_env, fake_llm):
    _case(test_env, "cc_g1")
    res = _chat(client, "cc_g1", "generate")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft"
    assert body["draft"]["version"] == "V1"
    assert body["draft"]["subject"] == FAKE_DRAFT_SUBJECT
    assert body["draft"]["branch_label"] == "main"
    assert len(body["versions"]) == 1
    assert body["event_id"] is None and body["task_id"] is None
    row = test_env["db"].query(CaseChatMessage).filter(CaseChatMessage.case_id == "cc_g1").first()
    assert row is not None
    assert row.session_id.startswith("draft:")
    assert row.branch_label == "main"


def test_generate_desensitize_rehydrate(client, test_env, monkeypatch):
    """红线：脱敏 → LLM → 还原。回复与落库均为还原值，无 PERSON_N 泄漏。"""
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    _case(test_env, "cc_rl", client_name="Zhang Wei", lender="CBA", stage="submitted")

    def echo_token_llm(self, *args, **kwargs):
        return _llm_result('{"subject": "Status for PERSON_1", "body": "Dear PERSON_1, your loan is progressing."}')

    monkeypatch.setattr("core.ai.gateway.ApiGateway.call_llm", echo_token_llm)
    res = _chat(client, "cc_rl", "generate")
    assert res.status_code == 200
    body = res.json()
    assert body["draft"]["body"] == "Dear Zhang Wei, your loan is progressing."
    assert "PERSON_1" not in body["draft"]["body"]
    row = test_env["db"].query(CaseChatMessage).filter(CaseChatMessage.case_id == "cc_rl").first()
    assert "Zhang Wei" in row.content
    assert "PERSON_1" not in row.content


def test_version_v2_references_parent(client, test_env, fake_llm):
    _case(test_env, "cc_v2")
    first = _chat(client, "cc_v2", "generate").json()
    msg_id = first["draft"]["message_id"]
    res = _chat(client, "cc_v2", "version", parent_message_id=msg_id, message="改成更客气的语气").json()
    assert res["status"] == "draft"
    assert res["draft"]["version"] == "V2"
    assert len(res["versions"]) == 2
    assert res["versions"][0]["version"] == "V1"
    assert res["versions"][1]["version"] == "V2"
    v2 = test_env["db"].get(CaseChatMessage, res["draft"]["message_id"])
    assert v2.parent_message_id == msg_id
    assert v2.branch_label == "main"


def test_branch_independent_chain(client, test_env, fake_llm):
    _case(test_env, "cc_br")
    _chat(client, "cc_br", "generate", branch_label="main").json()
    res = _chat(client, "cc_br", "generate", branch_label="B").json()
    assert res["status"] == "draft"
    assert res["draft"]["branch_label"] == "B"
    assert res["draft"]["version"] == "V1"
    assert len(res["versions"]) == 1
    assert test_env["db"].query(CaseChatMessage).filter(CaseChatMessage.case_id == "cc_br").count() == 2


def test_confirm_writes_event_and_todo(client, test_env, fake_llm):
    _case(test_env, "cc_cf1")
    first = _chat(client, "cc_cf1", "generate").json()
    msg_id = first["draft"]["message_id"]
    res = _chat(client, "cc_cf1", "confirm", parent_message_id=msg_id, create_todo=True).json()
    assert res["status"] == "confirmed"
    assert res["event_id"] is not None
    assert res["task_id"] is not None
    db = test_env["db"]
    events = db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "cc_cf1").all()
    assert any(e.source_type == "flow:draft_email" for e in events)
    todo = db.get(Action, res["task_id"])
    assert todo is not None
    assert todo.type == "FOLLOWUP_TODO"
    assert todo.title == FAKE_DRAFT_SUBJECT
    assert todo.status == "pending"
    assert todo.assignee == "vera"


def test_confirm_without_create_todo_no_action(client, test_env, fake_llm):
    _case(test_env, "cc_cf2")
    first = _chat(client, "cc_cf2", "generate").json()
    msg_id = first["draft"]["message_id"]
    res = _chat(client, "cc_cf2", "confirm", parent_message_id=msg_id).json()
    assert res["status"] == "confirmed"
    assert res["event_id"] is not None
    assert res["task_id"] is None
    assert test_env["db"].query(Action).filter(Action.case_id == "cc_cf2").count() == 0


def test_confirm_no_parent_blocked(client, test_env):
    _case(test_env, "cc_np")
    res = _chat(client, "cc_np", "confirm").json()
    assert res["status"] == "blocked"
    assert res["reason"]
    assert res["event_id"] is None and res["task_id"] is None


def test_invalid_flow_key_422(client, test_env):
    _case(test_env, "cc_wl")
    res = client.post("/api/agent/co-create/chat", json={"case_id": "cc_wl", "flow_key": "bogus", "action": "generate"})
    assert res.status_code == 422


def test_invalid_action_422(client, test_env):
    _case(test_env, "cc_wa")
    res = client.post("/api/agent/co-create/chat", json={"case_id": "cc_wa", "flow_key": "followup", "action": "send"})
    assert res.status_code == 422