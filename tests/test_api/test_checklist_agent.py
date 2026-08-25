"""WO-43 清单 Agent 测试：新增端点 / chat 工具 / 流程包 / 能力中心 / 迁移。

覆盖（验收 7-16）：
- POST /api/cases/{id}/checklist → 201 + master_id 为 custom id；GET 再次可见
- chat 工具 checklist_query：done/total/missing；无 case → ok=False
- AI 重选只在 VERA 询问时执行（use_ai 默认 false 不触发 LLM）
- checklist_ops 流程包：结果卡呈现预选、只推荐不落库；无 case → status=error
- 能力中心 /api/agents/ 含 agent-checklist
- WO-43 迁移 upgrade/downgrade 对称可逆
"""

from pathlib import Path

import pytest
import sqlalchemy
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from core.agents.flows import load_flows
from core.agents.runner import run_flow
from core.chat.tools import execute_tool
from core.models.orm import Case, CaseChecklist
from server.deps import get_db
from server.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _case(test_db, case_id, lender="CBA", employment_type="PAYG"):
    test_db.add(
        Case(id=case_id, client_name=f"客户{case_id}", lender=lender, employment_type=employment_type)
    )
    test_db.commit()


class TestAddChecklistEndpoint:
    """新增项端点（验收 7/8）。"""

    def test_add_checklist_endpoint(self, client, test_db):
        _case(test_db, "CL-1")

        resp = client.post(
            "/api/cases/CL-1/checklist",
            json={"name_zh": "额外资产证明", "category": "property", "is_required": True},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["item_name"] == "额外资产证明"
        assert body["case_id"] == "CL-1"
        assert body["category"] == "property"
        assert body["status"] == "pending"

        row = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "CL-1").first()
        assert row is not None
        assert row.master_id.startswith("custom_"), "案件清单项 master_id 应为沉淀出的 custom id"

    def test_add_persists_case(self, client, test_db):
        _case(test_db, "CL-2")
        client.post(
            "/api/cases/CL-2/checklist",
            json={"name_zh": "信托文件", "category": "special"},
        )

        resp = client.get("/api/cases/CL-2/checklist")
        assert resp.status_code == 200
        names = [it["item_name"] for it in resp.json()]
        assert "信托文件" in names


class TestConfirmWithoutBody:
    """确认清单项允许无 body：前端勾选只传 case_id + item_id（received_file_id 可选）。"""

    def test_confirm_without_body(self, client, test_db):
        _case(test_db, "CL-CF")
        add = client.post(
            "/api/cases/CL-CF/checklist",
            json={"name_zh": "测试材料", "category": "property", "is_required": True},
        )
        assert add.status_code == 201
        item_id = add.json()["id"]
        r = client.post(f"/api/cases/CL-CF/checklist/{item_id}/confirm")
        assert r.status_code == 200
        assert r.json()["status"] == "received"

    def test_confirm_with_body_still_works(self, client, test_db):
        _case(test_db, "CL-CF2")
        add = client.post(
            "/api/cases/CL-CF2/checklist",
            json={"name_zh": "测试材料2", "category": "identity", "is_required": False},
        )
        item_id = add.json()["id"]
        r = client.post(
            f"/api/cases/CL-CF2/checklist/{item_id}/confirm",
            json={"received_file_id": "file-9"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "received"


class TestChatToolQuery:
    """chat 工具 checklist_query（验收 9/10/13）。"""

    def test_chat_tool_query(self, test_db):
        _case(test_db, "CL-3")
        test_db.add_all(
            [
                CaseChecklist(case_id="CL-3", item_name="护照", category="identity", status="pending"),
                CaseChecklist(case_id="CL-3", item_name="工资单", category="income_payg", status="received"),
            ]
        )
        test_db.commit()

        res = execute_tool("checklist_query", {}, "CL-3", "internal", test_db)
        assert res["ok"] is True
        assert res["done"] == 1
        assert res["total"] == 2
        assert "护照" in res["missing"]
        assert "清单进度" in res["summary"]

    def test_chat_tool_query_no_case(self, test_db):
        res = execute_tool("checklist_query", {}, "", "internal", test_db)
        assert res["ok"] is False
        assert "案件对话" in res["error"]

    def test_ai_pick_only_on_demand(self, test_db, monkeypatch):
        """use_ai 默认 false 不触发 AI 重选；VERA 询问优化时才执行（只推荐不落库）。"""
        _case(test_db, "CL-4")
        calls: list = []

        def _spy(case_info, db, use_ai=True):
            calls.append(use_ai)
            return [{"id": "c_ai", "name_zh": "AI推荐项", "required": True, "reason": "test"}]

        monkeypatch.setattr("core.checklist.master_picker.pick_checklist", _spy)

        res = execute_tool("checklist_query", {}, "CL-4", "internal", test_db)
        assert res["ok"] is True
        assert calls == [], "use_ai 默认 false 不应触发 AI 重选"

        res2 = execute_tool("checklist_query", {"use_ai": True}, "CL-4", "internal", test_db)
        assert res2["ok"] is True
        assert calls == [True], "显式 use_ai=true 才触发一次 AI 重选"
        assert "AI 推荐补充" in res2["summary"]


class TestFlowChecklistOps:
    """checklist_ops 流程包（验收 11/15/16）。"""

    def test_flow_checklist_ops(self, test_db):
        _case(test_db, "FLO-1")
        test_db.add_all(
            [
                CaseChecklist(case_id="FLO-1", item_name="护照", category="identity", status="pending"),
                CaseChecklist(case_id="FLO-1", item_name="工资单", category="income_payg", status="received"),
            ]
        )
        test_db.commit()

        flow = load_flows()["checklist_ops"]
        res = run_flow(flow, "FLO-1", {}, test_db)
        assert res["presentation"] == "result_card"
        card = res["tool_cards"][0]
        assert card["type"] == "flow_checklist_ops"
        payload = card["payload"]
        # 流程最后一步（checklist_preview）summary 呈现；两步均不覆盖已存清单
        assert "预选" in payload["summary"]
        assert payload["count"] > 0
        assert test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "FLO-1").count() == 2

    def test_preview_endpoint_flow(self, test_db):
        _case(test_db, "PVF-1")

        flow = load_flows()["checklist_ops"]
        res = run_flow(flow, "PVF-1", {"lender": "CBA"}, test_db)
        assert "预选" in res["reply"]
        payload = res["tool_cards"][0]["payload"]
        assert payload["count"] > 0
        assert test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "PVF-1").count() == 0

    def test_preview_no_case(self, test_db):
        flow = load_flows()["checklist_ops"]
        res = run_flow(flow, "", {}, test_db)
        payload = res["tool_cards"][0]["payload"]
        assert payload["status"] == "error"
        assert "清单预选必须在案件对话中进行" in payload["summary"]


class TestAgentRegistry:
    """能力中心注册（验收 12）。"""

    def test_agent_registry(self, client):
        resp = client.get("/api/agents/")
        assert resp.status_code == 200
        agents = resp.json()["agents"]
        assert any(a["key"] == "agent-checklist" for a in agents)


class TestMigration:
    """WO-43/WO-42/WO-71/WO-74 迁移对称可逆（验收 14 + 最新 head 配套）。"""

    def test_migration_reversible(self, tmp_path):
        db_path = tmp_path / "wo43_mig.db"
        cfg = Config(str(PROJECT_ROOT / "core" / "alembic.ini"))
        cfg.set_main_option("script_location", str(PROJECT_ROOT / "core" / "migrations"))
        cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

        command.upgrade(cfg, "head")
        engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
        assert "checklist_library_custom" in sqlalchemy.inspect(engine).get_table_names()
        fact_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("brain_facts")}
        assert {"locked_by_user", "disclosure"} <= fact_cols  # WO-42 列已建
        event_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("case_context_events")}
        assert "occurred_at" in event_cols  # WO-71 列已建
        checklist_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("case_checklist")}
        assert {"phase", "deadline", "source_ref", "item_kind"} <= checklist_cols  # WO-74 列已建
        engine.dispose()

        command.downgrade(cfg, "g7h8i9j0k1l2")
        engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
        event_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("case_context_events")}
        assert "occurred_at" in event_cols  # WO-71 仍在（现为 head-1）
        checklist_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("case_checklist")}
        assert "phase" not in checklist_cols  # WO-74 downgrade 成功
        engine.dispose()

        command.upgrade(cfg, "head")
        engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
        event_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("case_context_events")}
        assert "occurred_at" in event_cols
        checklist_cols = {c["name"] for c in sqlalchemy.inspect(engine).get_columns("case_checklist")}
        assert "item_kind" in checklist_cols  # WO-74 upgrade 复原
        engine.dispose()
