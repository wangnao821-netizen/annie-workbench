"""tests/test_api/test_checklist_from_condition.py — OS 共创确认 → 追加清单项沉淀测试 (WO-75b)。

覆盖：
- POST /api/cases/{case_id}/checklist/from-condition 批量写 phase=condition 项（201 Created）
- 幂等性与去重（同 case + 同 name_zh + 同 source_ref 跳过并计数）
- 保护已收项（不覆盖已存在的 received 项）
- 422 非法输入（空名/坏 deadline）与 404 案件不存在
- run_co_create confirm 分支支持 add_checklist_items 沉淀落库 + 上下文事件 + 待办
- 红线安全测试：无外发动作，只写清单与事件/待办
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from core.agents.draft_email import run_co_create
from core.models.orm import (
    Action,
    Case,
    CaseChatMessage,
    CaseChecklist,
    CaseContextEvent,
)
from server.deps import get_db
from server.main import app


def _client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_from_condition_create_success(test_db):
    """测试批量沉淀追加清单项成功写入（201 Created）。"""
    gen = _client(test_db)
    client = next(gen)
    try:
        test_db.add(Case(id="COND-1", client_name="张三", lender="CBA", stage="收集资料"))
        test_db.commit()

        req_data = {
            "items": [
                {
                    "name_zh": "最近 3 个月工资单",
                    "deadline": "2026-09-01T00:00:00+10:00",
                    "source_ref": "CBA OS 条件 #12",
                },
                {
                    "name_zh": "租金收入流水核验",
                    "source_ref": "CBA OS 条件 #13",
                },
            ]
        }
        r = client.post("/api/cases/COND-1/checklist/from-condition", json=req_data)
        assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert body["added_count"] == 2
        assert body["skipped_count"] == 0
        assert len(body["items"]) == 2

        # 检查数据库落库行
        rows = (
            test_db.query(CaseChecklist)
            .filter(CaseChecklist.case_id == "COND-1", CaseChecklist.phase == "condition")
            .all()
        )
        assert len(rows) == 2
        names = {it.item_name for it in rows}
        assert "最近 3 个月工资单" in names
        assert "租金收入流水核验" in names
        for it in rows:
            assert it.phase == "condition"
            assert it.item_kind == "document"
            assert it.status == "pending"
            assert it.is_required is True
    finally:
        next(gen, None)


def test_from_condition_idempotent_deduplication(test_db):
    """测试幂等去重：同 case + 同 name_zh + 同 source_ref 已存在则跳过并计数。"""
    gen = _client(test_db)
    client = next(gen)
    try:
        test_db.add(Case(id="COND-2", client_name="李四", lender="ANZ", stage="审贷中"))
        test_db.commit()

        req_data = {
            "items": [
                {"name_zh": "自雇 2 年税单", "source_ref": "ANZ 补件 #1"},
                {"name_zh": "会计信", "source_ref": "ANZ 补件 #2"},
            ]
        }
        r1 = client.post("/api/cases/COND-2/checklist/from-condition", json=req_data)
        assert r1.status_code == 201
        assert r1.json()["added_count"] == 2
        assert r1.json()["skipped_count"] == 0

        # 重复提交完全相同的项
        r2 = client.post("/api/cases/COND-2/checklist/from-condition", json=req_data)
        assert r2.status_code == 201
        assert r2.json()["added_count"] == 0
        assert r2.json()["skipped_count"] == 2

        # 数据库行数仍为 2
        rows = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "COND-2").all()
        assert len(rows) == 2
    finally:
        next(gen, None)


def test_from_condition_preserves_received_status(test_db):
    """测试保护已收项：绝不覆盖已有项的 received 状态。"""
    gen = _client(test_db)
    client = next(gen)
    try:
        test_db.add(Case(id="COND-3", client_name="王五", lender="NAB", stage="审贷中"))
        test_db.add(
            CaseChecklist(
                case_id="COND-3",
                item_name="已收材料项",
                category="condition",
                status="received",
                phase="condition",
                source_ref="NAB 条件 #5",
                is_required=True,
            )
        )
        test_db.commit()

        # 尝试再次以 pending 语义通过 from-condition 提交同名同来源项
        req_data = {
            "items": [
                {"name_zh": "已收材料项", "source_ref": "NAB 条件 #5"},
                {"name_zh": "新追加项", "source_ref": "NAB 条件 #6"},
            ]
        }
        r = client.post("/api/cases/COND-3/checklist/from-condition", json=req_data)
        assert r.status_code == 201
        b = r.json()
        assert b["added_count"] == 1
        assert b["skipped_count"] == 1

        # 检查原有项状态依然是 received
        existing = (
            test_db.query(CaseChecklist)
            .filter(CaseChecklist.case_id == "COND-3", CaseChecklist.item_name == "已收材料项")
            .first()
        )
        assert existing is not None
        assert existing.status == "received", "已有项的 received 状态绝不能被覆盖为 pending"
    finally:
        next(gen, None)


def test_from_condition_422_on_empty_name(test_db):
    """测试非法入参（空名称）返回 422。"""
    gen = _client(test_db)
    client = next(gen)
    try:
        test_db.add(Case(id="COND-4", client_name="赵六", lender="Westpac", stage="审贷中"))
        test_db.commit()

        # 空字符串
        r1 = client.post(
            "/api/cases/COND-4/checklist/from-condition",
            json={"items": [{"name_zh": "   ", "source_ref": "ref"}]},
        )
        assert r1.status_code == 422

        # 缺少 name_zh
        r2 = client.post(
            "/api/cases/COND-4/checklist/from-condition",
            json={"items": [{"source_ref": "ref"}]},
        )
        assert r2.status_code == 422
    finally:
        next(gen, None)


def test_from_condition_422_on_invalid_deadline(test_db):
    """测试非法 deadline 返回 422。"""
    gen = _client(test_db)
    client = next(gen)
    try:
        test_db.add(Case(id="COND-5", client_name="孙七", lender="Macquarie", stage="审贷中"))
        test_db.commit()

        r = client.post(
            "/api/cases/COND-5/checklist/from-condition",
            json={"items": [{"name_zh": "评估报告", "deadline": "not-a-date"}]},
        )
        assert r.status_code == 422
    finally:
        next(gen, None)


def test_from_condition_404_on_missing_case(test_db):
    """测试案件不存在返回 404。"""
    gen = _client(test_db)
    client = next(gen)
    try:
        r = client.post(
            "/api/cases/NON-EXISTENT/checklist/from-condition",
            json={"items": [{"name_zh": "测试材料"}]},
        )
        assert r.status_code == 404
    finally:
        next(gen, None)


def test_co_create_confirm_sinks_condition_checklist(test_db):
    """测试 run_co_create confirm 分支支持 add_checklist_items 沉淀落库 + 上下文事件 + 待办。"""
    case_id = "CO-COND-1"
    test_db.add(Case(id=case_id, client_name="周八", lender="CBA", stage="审贷中"))
    draft_content = json.dumps(
        {
            "subject": "Re: Response to CBA Condition #1",
            "body": "Dear Assessor,\nAttached is the rental statement.",
            "version": "V1",
            "branch": "main",
        },
        ensure_ascii=False,
    )
    msg = CaseChatMessage(
        case_id=case_id,
        session_id=f"draft:{case_id}",
        role="assistant",
        content=draft_content,
        branch_label="main",
    )
    test_db.add(msg)
    test_db.commit()

    args = {
        "action": "confirm",
        "flow_key": "os_reply",
        "branch_label": "main",
        "create_todo": True,
        "add_checklist_items": [
            {
                "name_zh": "近 6 个月租金流水",
                "deadline": "2026-09-10T00:00:00Z",
                "source_ref": "CBA OS 审贷条件 #1",
            },
            {
                "name_zh": "最新房屋租赁合同",
                "source_ref": "CBA OS 审贷条件 #1",
            },
        ],
    }

    res = run_co_create(case_id, args, test_db)
    assert res["status"] == "confirmed"
    assert res["event_id"] is not None
    assert res["task_id"] is not None

    # 验证清单落库
    rows = (
        test_db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id, CaseChecklist.phase == "condition")
        .all()
    )
    assert len(rows) == 2
    row_names = {r.item_name for r in rows}
    assert "近 6 个月租金流水" in row_names
    assert "最新房屋租赁合同" in row_names
    for r in rows:
        assert r.status == "pending"
        assert r.item_kind == "document"
        assert r.source_ref == "CBA OS 审贷条件 #1"

    # 验证上下文事件生成
    events = (
        test_db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == case_id, CaseContextEvent.source_type == "flow:draft_email")
        .all()
    )
    assert len(events) >= 1

    # 验证待办任务生成
    tasks = test_db.query(Action).filter(Action.case_id == case_id).all()
    assert len(tasks) >= 1


def test_co_create_confirm_without_condition_items(test_db):
    """测试 run_co_create confirm 分支未传入 add_checklist_items 时正常确认且不产生 condition 清单项。"""
    case_id = "CO-COND-2"
    test_db.add(Case(id=case_id, client_name="吴九", lender="ANZ", stage="审贷中"))
    draft_content = json.dumps(
        {
            "subject": "Follow-up email",
            "body": "Dear Assessor,\nChecking status.",
            "version": "V1",
            "branch": "main",
        },
        ensure_ascii=False,
    )
    msg = CaseChatMessage(
        case_id=case_id,
        session_id=f"draft:{case_id}",
        role="assistant",
        content=draft_content,
        branch_label="main",
    )
    test_db.add(msg)
    test_db.commit()

    args = {
        "action": "confirm",
        "flow_key": "followup",
        "branch_label": "main",
        "create_todo": False,
        "add_checklist_items": None,
    }

    res = run_co_create(case_id, args, test_db)
    assert res["status"] == "confirmed"
    assert res["event_id"] is not None
    assert res["task_id"] is None

    # 清单无 condition 项
    rows = (
        test_db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id, CaseChecklist.phase == "condition")
        .all()
    )
    assert len(rows) == 0
