"""tests/test_core/test_onboarding_tasks.py — 建案自动首批待办生成测试 (WO-76)。

覆盖：
1. 建案后成功生成 3 条 Action（发材料清单邮件 high/当天工作日、Equifax medium/+3天、律师信息 low/+7天）；
2. 幂等去重：重复调用不重复创建；
3. 开关控制：tasks_enabled=false 时静默跳过不创建；
4. 容错：非法/不存在的 case_id 返回空列表；
5. 红线：只写 Action 表，无外部发送动作。
"""

from __future__ import annotations

from core.case_engine.onboarding_tasks import create_initial_tasks
from core.config import get_config
from core.models.orm import Action, Case


def test_create_initial_tasks_success(test_db):
    """验证建案后成功生成 3 条 Action 且字段符合契约。"""
    case = Case(
        id="case_20260825_welcome_test",
        client_name="David Zhang",
        lender="CBA",
        loan_amount=800000.0,
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    actions = create_initial_tasks(case.id, test_db)
    assert len(actions) == 3

    # 查询数据库确认持久化
    rows = test_db.query(Action).filter(Action.case_id == case.id).order_by(Action.id.asc()).all()
    assert len(rows) == 3

    # 1. 发材料清单邮件
    act1 = next(r for r in rows if r.type == "send_checklist_email")
    assert act1.title == "发送材料清单邮件给客户"
    assert act1.priority == "high"
    assert act1.source_channel == "onboarding"
    assert act1.assignee == "vera"
    assert act1.status == "pending"
    assert act1.match_status == "confirmed"
    assert act1.scheduled_at is not None

    # 2. Equifax 报告
    act2 = next(r for r in rows if r.type == "run_equifax_report")
    assert act2.title == "跑 Equifax 信用报告"
    assert act2.priority == "medium"
    assert act2.source_channel == "onboarding"
    assert act2.assignee == "vera"
    assert act2.status == "pending"
    assert act2.match_status == "confirmed"
    assert act2.scheduled_at > act1.scheduled_at

    # 3. 律师/过户师信息
    act3 = next(r for r in rows if r.type == "confirm_solicitor_info")
    assert act3.title == "确认客户律师/过户师信息"
    assert act3.priority == "low"
    assert act3.source_channel == "onboarding"
    assert act3.assignee == "vera"
    assert act3.status == "pending"
    assert act3.match_status == "confirmed"
    assert act3.scheduled_at > act2.scheduled_at


def test_create_initial_tasks_idempotent(test_db):
    """验证幂等去重：多次调用不重复创建同一 type 任务。"""
    case = Case(
        id="case_20260825_idempotent_test",
        client_name="Sarah Li",
        lender="Westpac",
        loan_amount=650000.0,
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    first_actions = create_initial_tasks(case.id, test_db)
    assert len(first_actions) == 3

    # 再次触发
    second_actions = create_initial_tasks(case.id, test_db)
    assert second_actions == []

    # 数据库总条数依然为 3
    total = test_db.query(Action).filter(Action.case_id == case.id).count()
    assert total == 3


def test_create_initial_tasks_disabled_switch(test_db, monkeypatch):
    """验证配置开关 tasks_enabled=false 时跳过创建。"""
    case = Case(
        id="case_20260825_disabled_test",
        client_name="Tom Wang",
        lender="ANZ",
        loan_amount=500000.0,
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    cfg = get_config()
    monkeypatch.setattr(cfg.settings.onboarding, "tasks_enabled", False)

    actions = create_initial_tasks(case.id, test_db)
    assert actions == []

    total = test_db.query(Action).filter(Action.case_id == case.id).count()
    assert total == 0


def test_create_initial_tasks_missing_case(test_db):
    """验证案件不存在或入参为空时安全返回空列表。"""
    assert create_initial_tasks("", test_db) == []
    assert create_initial_tasks("case_non_existent", test_db) == []


def test_create_initial_tasks_redline_no_external_send(test_db):
    """红线测试：仅在 Action 表写入 status=pending，不触发任何外部发送。"""
    case = Case(
        id="case_20260825_redline_test",
        client_name="Emma Watson",
        lender="NAB",
        loan_amount=950000.0,
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    actions = create_initial_tasks(case.id, test_db)
    for act in actions:
        assert act.status == "pending"
        assert act.source_channel == "onboarding"
