"""WO-41 任务 Agent — 聊天建任意任务 测试。

覆盖：
- POST /api/tasks/ 建任务（minimal/full/非法 deadline/非法 priority/case 缺失）
- chat 工具 create_task（execute_tool 成功/无 case）
- task_ops 流程包 run_flow
- 能力中心 agent-task 注册
- create_task priority 向后兼容（context 回退）
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from core.agents.flows import load_flows
from core.agents.runner import run_flow
from core.chat.tools import execute_tool
from core.models.orm import Action, Case
from core.task_engine.dispatcher import create_task
from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _case(test_db, cid: str) -> None:
    test_db.add(Case(id=cid, client_name=f"客户 {cid}", lender="CBA", loan_amount=100000))
    test_db.commit()


class TestCreateTaskEndpoint:
    """POST /api/tasks/ — WO-41 新增字段透传。"""

    def test_create_task_minimal(self, client, test_db):
        """仅 title → 200，priority=normal、assignee=vera、deadline=None。"""
        _case(test_db, "WA-1")
        resp = client.post("/api/tasks/", json={"case_id": "WA-1", "title": "跟进客户"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["priority"] == "normal"
        action = test_db.query(Action).filter(Action.case_id == "WA-1").first()
        assert action is not None
        assert action.priority == "normal"
        assert action.assignee == "vera"
        assert action.scheduled_at is None

    def test_create_task_full(self, client, test_db):
        """title+deadline(ISO)+priority=high+assignee=brandon → 落库字段正确、scheduled_at 生效。"""
        _case(test_db, "WA-2")
        resp = client.post(
            "/api/tasks/",
            json={
                "case_id": "WA-2",
                "title": "催客户交 NOA",
                "deadline": "2026-08-20T18:00:00",
                "priority": "high",
                "assignee": "brandon",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["priority"] == "high"
        action = test_db.query(Action).filter(Action.case_id == "WA-2").first()
        assert action.priority == "high"
        assert action.assignee == "brandon"
        assert action.scheduled_at == datetime.fromisoformat("2026-08-20T18:00:00")

    def test_create_task_invalid_deadline(self, client, test_db):
        """deadline 非 ISO → 422。"""
        _case(test_db, "WA-3")
        resp = client.post(
            "/api/tasks/",
            json={"case_id": "WA-3", "title": "坏截止", "deadline": "not-a-date"},
        )
        assert resp.status_code == 422

    def test_create_task_invalid_priority(self, client, test_db):
        """priority=xxx → 400。"""
        _case(test_db, "WA-4")
        resp = client.post(
            "/api/tasks/",
            json={"case_id": "WA-4", "title": "坏优先级", "priority": "xxx"},
        )
        assert resp.status_code == 400
        assert "非法优先级" in resp.json()["detail"]

    def test_create_task_no_case(self, client):
        """case_id 空 → 422。"""
        resp = client.post("/api/tasks/", json={"title": "无案件任务"})
        assert resp.status_code == 422
        assert "请先关联案件或新建案件" in resp.json()["detail"]


class TestChatToolCreateTask:
    """core.chat.tools create_task 工具。"""

    def test_chat_tool_create_task(self, test_db):
        _case(test_db, "WA-5")
        res = execute_tool(
            "create_task",
            {"title": "周五前发银行函", "deadline": "2026-08-20T18:00:00", "priority": "high"},
            "WA-5",
            "internal",
            test_db,
        )
        assert res["ok"] is True
        assert res["task_id"] > 0
        assert res["title"] == "周五前发银行函"
        assert res["priority"] == "high"
        assert res["deadline"] == "2026-08-20T18:00:00"
        assert res["assignee"] == "vera"

    def test_chat_tool_no_case(self, test_db):
        res = execute_tool(
            "create_task",
            {"title": "无案件任务"},
            "",
            "internal",
            test_db,
        )
        assert res["ok"] is False
        assert "案件对话" in res["error"]

    def test_chat_tool_invalid_deadline(self, test_db):
        _case(test_db, "WA-6")
        res = execute_tool(
            "create_task",
            {"title": "坏截止", "deadline": "not-a-date"},
            "WA-6",
            "internal",
            test_db,
        )
        assert res["ok"] is False
        assert "不是合法 ISO 时间" in res["error"]


class TestFlowTaskOps:
    """task_ops 流程包（WO-41）。"""

    def test_flow_task_ops(self, test_db):
        _case(test_db, "WA-7")
        flow = load_flows()["task_ops"]
        result = run_flow(flow, "WA-7", {"title": "测试任务"}, test_db)
        assert "已创建任务" in result["reply"]
        card = result["tool_cards"][0]
        assert card["type"] == "flow_task_ops"
        assert card["payload"]["summary"] == "已创建任务：测试任务"


class TestAgentRegistry:
    """能力中心注册（agent-task）。"""

    def test_agent_registry(self, client):
        resp = client.get("/api/agents/")
        assert resp.status_code == 200
        agents = resp.json()["agents"]
        assert any(a["key"] == "agent-task" for a in agents)


class TestBackwardCompat:
    """create_task priority 向后兼容。"""

    def test_legacy_priority_backward(self, test_db):
        action = create_task(
            case_id="WA-8",
            task_type="general",
            source_channel="manual",
            title="遗留任务",
            context={"priority": "high"},
            db=test_db,
        )
        assert action.priority == "high"


class TestStageAdvanceDispatch:
    """阶段推进 Action 经由调度器 dispatch approve 时真正推进 Case.stage。"""

    def test_stage_advance_dispatch_approve_progresses_case(self, client, test_db):
        # 1. 创建处于「收集资料」阶段的案件
        case = Case(
            id="CASE-ADV-001",
            client_name="李四",
            stage="收集资料",
            lender="CBA",
            loan_amount=500000,
        )
        test_db.add(case)
        test_db.commit()

        # 2. 调用 stage-advance 生成 Action
        advance_resp = client.post("/api/cases/CASE-ADV-001/stage-advance", json={
            "signal": "application_submitted",
        })
        assert advance_resp.status_code == 200
        action_id = advance_resp.json()["action_id"]

        # 3. 调度器 approve 该 Action
        dispatch_resp = client.post(f"/api/tasks/{action_id}/dispatch", json={
            "action": "approve",
        })
        assert dispatch_resp.status_code == 200

        # 4. 验证 Case.stage 已真实流转为「已递交(等银行)」
        test_db.refresh(case)
        assert case.stage == "已递交(等银行)"
