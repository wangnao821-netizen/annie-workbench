"""任务引擎核心测试 — WO-08。

覆盖 dispatcher / delegation / boss_decision / sse 的核心契约：
1. create_task 创建 Action 且 source_channel 有默认值
2. dispatch_task 派单三键 + delegate
3. delegate_to / record_feedback / recall_delegation / check_overdue
4. record_boss_reply
5. SSE publish 后 subscribe 能收到事件
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytest

from core.events.sse import sse_manager
from core.models.orm import Action, Case
from core.task_engine.boss_decision import record_boss_reply
from core.task_engine.delegation import (
    check_overdue,
    delegate_to,
    recall_delegation,
    record_feedback,
)
from core.task_engine.dispatcher import (
    create_task,
    dispatch_task,
    list_tasks,
    to_task_response,
)


def _make_task(db, **overrides) -> Action:
    """创建一个测试任务，返回未提交的 Action。"""
    kwargs = {
        "case_id": "CASE-TEST-001",
        "task_type": "email_draft",
        "source_channel": "email",
        "title": "测试任务",
        "context": {"suggestion": "准备草稿", "source_msg_id": "INBOX-0001"},
    }
    kwargs.update(overrides)
    return create_task(db=db, **kwargs)


class TestCreateTask:
    """create_task 契约测试。"""

    def test_to_task_response_case_none_fields(self, test_db):
        """case 存在但 loan_amount/lender 为 None 时响应不崩（前端链路验证发现）。"""
        case = Case(id="CASE-NOAMT-001", client_name="测试", broker_name="Brandon",
                    stage="收集资料", folder_path="x")
        test_db.add(case)
        test_db.commit()
        action = _make_task(test_db, case_id="CASE-NOAMT-001")
        test_db.add(action)
        test_db.commit()
        data = to_task_response(action, case)
        assert data["loan_amount"] == 0.0
        assert data["case_bank"] == ""

    def test_default_source_channel(self, test_db):
        """source_channel 缺省必须是 email。"""
        task = _make_task(test_db, source_channel="")
        assert task.source_channel == "email"

    def test_explicit_source_channel(self, test_db):
        """显式传 wechat 必须保留。"""
        task = _make_task(test_db, source_channel="wechat")
        assert task.source_channel == "wechat"

    def test_routing_options_stored(self, test_db):
        """routing_options 必须落库。"""
        opts = [{"action": "approve", "label": "批准"}]
        task = _make_task(test_db, routing_options=opts)
        assert task.routing_options == opts

    def test_source_msg_id_from_context(self, test_db):
        """context 里的 source_msg_id 必须回填到 Action.source_msg_id。"""
        task = _make_task(test_db)
        assert task.source_msg_id == "INBOX-0001"

    def test_status_pending_on_create(self, test_db):
        """新建任务默认 pending。"""
        task = _make_task(test_db)
        assert task.status == "pending"


class TestDispatchTask:
    """dispatch_task 三键 + 委派。"""

    def test_approve_completes(self, test_db):
        task = _make_task(test_db)
        result = dispatch_task(task.id, action="approve", db=test_db)
        assert result.status == "completed"

    def test_reject_completes(self, test_db):
        task = _make_task(test_db)
        result = dispatch_task(task.id, action="reject", db=test_db)
        assert result.status == "rejected"

    def test_defer(self, test_db):
        task = _make_task(test_db)
        result = dispatch_task(task.id, action="defer", db=test_db)
        assert result.status == "deferred"

    def test_claim_keeps_in_progress(self, test_db):
        """Vera 认领跟进：任务保持 in_progress 并归属 vera，绝不提前完结。"""
        task = _make_task(test_db)
        result = dispatch_task(task.id, action="claim", operator="vera", db=test_db)
        assert result.status == "in_progress"
        assert result.assignee == "vera"

    def test_claimed_task_stays_in_today_list(self, test_db):
        """认领后任务仍出现在今日待办（today 过滤含 in_progress）。"""
        task = _make_task(test_db)
        dispatch_task(task.id, action="claim", db=test_db)
        today = list_tasks(filter="today", db=test_db)
        assert any(item["id"] == task.id for item in today)

    def test_invalid_action_raises(self, test_db):
        task = _make_task(test_db)
        with pytest.raises(ValueError):
            dispatch_task(task.id, action="nuke", db=test_db)


class TestDelegation:
    """委派闭环：委派 → 反馈/收回 → 完成。"""

    def test_delegate_to_sets_fields(self, test_db):
        """delegate_to 必须写 delegated_to 和 delegated_at。"""
        task = _make_task(test_db)
        deadline = datetime.utcnow() + timedelta(days=2)  # noqa: DTZ003 — naive 与 DB 一致
        result = delegate_to(task.id, "Brandon", deadline=deadline, db=test_db)
        assert result.delegated_to == "Brandon"
        assert result.delegated_at is not None
        assert result.delegation_deadline == deadline

    def test_record_feedback_closes_loop(self, test_db):
        """反馈后委派闭环。"""
        task = _make_task(test_db)
        delegate_to(task.id, "Brandon", db=test_db)
        result = record_feedback(task.id, "已处理完", db=test_db)
        assert result.delegation_feedback == "已处理完"
        assert result.status == "completed"

    def test_recall_delegation_clears(self, test_db):
        """收回后 delegated_to 必须为 None。"""
        task = _make_task(test_db)
        delegate_to(task.id, "Brandon", db=test_db)
        result = recall_delegation(task.id, db=test_db)
        assert result.delegated_to is None
        assert result.delegated_at is None
        assert result.status == "pending"

    def test_check_overdue_returns_overdue_only(self, test_db):
        """超期未反馈的委派返回，未过期的不返回。"""
        overdue = _make_task(test_db, case_id="CASE-OVERDUE")
        delegate_to(
            overdue.id,
            "Brandon",
            deadline=datetime.utcnow() - timedelta(days=1),  # noqa: DTZ003
            db=test_db,
        )
        not_overdue = _make_task(test_db, case_id="CASE-NOT-OVERDUE")
        delegate_to(
            not_overdue.id,
            "Brandon",
            deadline=datetime.utcnow() + timedelta(days=1),  # noqa: DTZ003
            db=test_db,
        )

        result = check_overdue(db=test_db)
        ids = {a.id for a in result}
        assert overdue.id in ids
        assert not_overdue.id not in ids

    def test_check_overdue_ignores_feedback(self, test_db):
        """已反馈的委派即使超期也不催办。"""
        task = _make_task(test_db)
        delegate_to(
            task.id,
            "Brandon",
            deadline=datetime.utcnow() - timedelta(days=1),  # noqa: DTZ003
            db=test_db,
        )
        record_feedback(task.id, "已完成", db=test_db)
        assert check_overdue(db=test_db) == []


class TestBossDecision:
    """record_boss_reply 契约。"""

    def test_approve_recorded(self, test_db):
        task = _make_task(test_db)
        result = record_boss_reply(task.id, "approve", note="同意", db=test_db)
        assert result.boss_decision is not None
        assert "approve" in result.boss_decision
        assert result.status == "completed"

    def test_invalid_decision_raises(self, test_db):
        task = _make_task(test_db)
        with pytest.raises(ValueError):
            record_boss_reply(task.id, "maybe", db=test_db)


class TestSseManager:
    """SSE publish → subscribe 必须收到事件。"""

    def test_publish_reaches_subscriber(self):
        """publish 后 subscribe 必须收到事件字符串。"""
        async def scenario():
            gen = sse_manager.subscribe()
            # 启动订阅器，先消费掉可能的历史（此处无历史）
            await gen.__anext__()
            sse_manager.publish("task_updated", {"task_id": 1})
            msg = await gen.__anext__()
            await gen.aclose()
            return msg

        msg = asyncio.run(scenario())
        assert "task_updated" in msg
        assert "task_id" in msg
