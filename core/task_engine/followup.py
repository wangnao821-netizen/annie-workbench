"""普通任务跟进提醒（WO-47）— 截止/承诺到期提醒待办闭环。

Vera 的 Action Inbox 任务（status=pending、scheduled_at 即 deadline）在截止前
remind_before_days 天或已到期时，生成 FOLLOWUP_REMINDER 提醒待办；
只生成提醒 Action，不自动发送通知；同源 pending 提醒去重幂等，不改原任务状态。
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from core.models.orm import Action, Case

FOLLOWUP_REMINDER = "FOLLOWUP_REMINDER"


def check_followups(db: Session, remind_before_days: int = 1) -> list[Action]:
    """扫描 pending 且 deadline 非空的任务：
    - deadline <= now + remind_before_days → 生成/复用 FOLLOWUP_REMINDER Action
      （title=f"跟进提醒：{task.title}"，type="FOLLOWUP_REMINDER"，priority 按剩余天数红/黄，
       status=pending，assignee="vera"，source_channel="manual"，source_msg_id=str(task.id)）；
    - 去重：同 task + type + status=pending 已存在则跳过（复用 _overdue_job 的 dup 写法）；
    - 仅扫描未完成（status=pending）且未关闭案件（Case.closed_at IS NULL）。

    Args:
        db: SQLAlchemy session。
        remind_before_days: 提前提醒天数（默认 1：截止当天及已到期都触发）。

    Returns:
        本次新建的 FOLLOWUP_REMINDER Action 列表（幂等重复调用返回空）。
    """
    now = datetime.utcnow()  # noqa: DTZ003 — 与 ORM 列默认一致（naive UTC）
    cutoff = now + timedelta(days=remind_before_days)

    tasks = (
        db.query(Action)
        .join(Case, Action.case_id == Case.id)
        .filter(
            Action.status == "pending",
            Action.scheduled_at.isnot(None),
            Action.scheduled_at <= cutoff,
            Case.closed_at.is_(None),
        )
        .order_by(Action.scheduled_at.asc())
        .all()
    )

    created: list[Action] = []
    for task in tasks:
        dup = (
            db.query(Action)
            .filter(
                Action.type == FOLLOWUP_REMINDER,
                Action.source_msg_id == str(task.id),
                Action.status == "pending",
            )
            .first()
        )
        if dup is not None:
            continue
        deadline = task.scheduled_at
        priority = "high" if deadline <= now else "medium"
        reminder = Action(
            case_id=task.case_id,
            type=FOLLOWUP_REMINDER,
            title=f"跟进提醒：{task.title}",
            priority=priority,
            status="pending",
            assignee="vera",
            source_channel="manual",
            source_msg_id=str(task.id),
        )
        db.add(reminder)
        created.append(reminder)
    db.commit()
    return created