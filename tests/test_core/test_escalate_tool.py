"""tests/test_core/test_escalate_tool.py — 老板拍板链路（WO-40）"""

import pytest
from fastapi.testclient import TestClient

from core.chat.tools import execute_tool
from core.escalation.service import create_escalation, parse_escalation_note
from core.models.orm import Action, Case
from core.task_engine.dispatcher import to_task_response
from server.api.cases import _to_case_response
from server.deps import get_db
from server.main import app


def test_escalate_tool_creates_brandon_action(test_db):
    test_db.add(Case(id="ESC-1", client_name="PERSON_1", lender="CBA"))
    test_db.commit()
    res = execute_tool(
        "escalate_to_boss",
        {"problem": "客户收入口径银行不认，需要老板拍板", "preference": "倾向 CBA 口径", "deadline": "2026-08-20T17:00:00"},
        "ESC-1",
        "internal",
        test_db,
    )
    assert res["ok"] is True
    action = test_db.get(Action, res["action_id"])
    assert action.assignee == "brandon"
    assert action.escalated_at is not None
    assert action.scheduled_at is not None
    assert parse_escalation_note(action.vera_note)["problem"] == "客户收入口径银行不认，需要老板拍板"


def test_escalate_tool_requires_case():
    res = execute_tool("escalate_to_boss", {"problem": "测试"}, "", "internal", None)  # type: ignore[arg-type]
    assert res["ok"] is False


def test_escalate_tool_requires_problem(test_db):
    res = execute_tool("escalate_to_boss", {}, "ESC-1", "internal", test_db)
    assert res["ok"] is False


def test_task_response_exposes_escalation(test_db):
    case = Case(id="ESC-2", client_name="PERSON_1", lender="NAB")
    test_db.add(case)
    action = create_escalation(test_db, "ESC-2", "审批卡在银行，需要老板拍板换行")
    test_db.commit()
    data = to_task_response(action, case)
    assert data["escalated_to_boss"] is True
    assert data["boss_decision"] == "审批卡在银行，需要老板拍板换行"


def test_task_response_not_escalated(test_db):
    case = Case(id="ESC-3", client_name="PERSON_1")
    test_db.add(case)
    action = Action(case_id="ESC-3", type="classify", title="普通任务")
    test_db.add(action)
    test_db.commit()
    data = to_task_response(action, case)
    assert data["escalated_to_boss"] is False
    assert data["boss_decision"] is None


def test_case_response_has_boss_pending(test_db):
    case = Case(id="ESC-4", client_name="PERSON_1", lender="CBA")
    test_db.add(case)
    test_db.commit()
    create_escalation(test_db, "ESC-4", "需要老板拍板：是否接受客户 90% LVR")
    test_db.commit()
    resp = _to_case_response(case, test_db)
    assert resp.has_boss_pending is True


def test_case_response_no_boss_pending(test_db):
    case = Case(id="ESC-5", client_name="PERSON_1", lender="CBA")
    test_db.add(case)
    test_db.commit()
    resp = _to_case_response(case, test_db)
    assert resp.has_boss_pending is False


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_api_cases_expose_boss_pending(client, test_db):
    test_db.add(Case(id="ESC-6", client_name="PERSON_1", lender="CBA"))
    test_db.commit()
    create_escalation(test_db, "ESC-6", "请老板拍板：LVR 90% 是否接受")
    test_db.commit()
    resp = client.get("/api/cases/")
    assert resp.status_code == 200
    match = [c for c in resp.json() if c["case_id"] == "ESC-6"]
    assert match and match[0]["has_boss_pending"] is True
