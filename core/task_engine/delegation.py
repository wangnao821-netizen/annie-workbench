"""委派 + 催办机制（V5 任务引擎）。

委派流程闭环：委派 → 反馈/收回 → 完成。
- delegate_to:       委派任务给同事，可选 deadline
- record_feedback:   同事提交反馈，闭环委派流程
- recall_delegation: 收回委派（Vera 反悔时调用）
- check_overdue:     检查超期未反馈的委派任务，返回需催办列表
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.events.sse import sse_manager
from core.models.orm import Action, Case
from core.task_engine.dispatcher import to_task_response


def _get_task(task_id: int, db: Session) -> Action:
    """按 ID 取任务，不存在时抛 ValueError。"""
    task = db.get(Action, task_id)
    if task is None:
        raise ValueError(f"任务不存在: task_id={task_id}")
    return task


def delegate_to(
    task_id: int,
    delegate_name: str,
    deadline: datetime | None = None,
    message: str = "",
    db: Session = ...,
) -> Action:
    """委派任务给同事，可选 deadline。

    Args:
        task_id: Action ID。
        delegate_name: 委派对象（同事名）。
        deadline: 委派截止时间（UTC）；None 表示不设截止。
        message: 委派附带消息（写入 vera_note）。
        db: SQLAlchemy session。

    Returns:
        更新后的 Action 实例。
    """
    if not delegate_name:
        raise ValueError("delegate_name 不能为空")

    task = _get_task(task_id, db)
    task.delegated_to = delegate_name
    task.delegated_at = datetime.utcnow()
    task.delegation_deadline = deadline
    task.delegation_feedback = None
    task.status = "delegated"
    if message:
        task.vera_note = (task.vera_note + "\n" + message) if task.vera_note else message
    db.commit()
    db.refresh(task)

    case = db.get(Case, task.case_id) if task.case_id else None
    sse_manager.publish("task_updated", to_task_response(task, case))
    return task


def record_feedback(task_id: int, feedback: str, db: Session = ...) -> Action:
    """同事提交反馈，闭环委派流程。

    Args:
        task_id: Action ID。
        feedback: 同事反馈内容。
        db: SQLAlchemy session。

    Returns:
        更新后的 Action 实例（status 置为 completed）。
    """
    if not feedback:
        raise ValueError("feedback 不能为空")

    task = _get_task(task_id, db)
    task.delegation_feedback = feedback
    task.status = "completed"
    db.commit()
    db.refresh(task)

    case = db.get(Case, task.case_id) if task.case_id else None
    sse_manager.publish("task_updated", to_task_response(task, case))
    return task


def recall_delegation(task_id: int, db: Session = ...) -> Action:
    """收回委派（Vera 反悔时调用），清空所有委派痕迹。

    Args:
        task_id: Action ID。
        db: SQLAlchemy session。

    Returns:
        更新后的 Action 实例（恢复 pending）。
    """
    task = _get_task(task_id, db)
    task.delegated_to = None
    task.delegated_at = None
    task.delegation_deadline = None
    task.delegation_feedback = None
    task.status = "pending"
    db.commit()
    db.refresh(task)

    case = db.get(Case, task.case_id) if task.case_id else None
    sse_manager.publish("task_updated", to_task_response(task, case))
    return task


def check_overdue(db: Session = ...) -> list[Action]:
    """检查超期未反馈的委派任务，返回需催办列表。

    判定条件：已委派（delegated_to 非空）且未反馈（feedback 为空）、
    有 deadline 且 deadline 已过当前 UTC 时间。

    Args:
        db: SQLAlchemy session。

    Returns:
        需催办的 Action 列表。
    """
    now = datetime.utcnow()
    return (
        db.query(Action)
        .filter(
            Action.delegated_to.isnot(None),
            Action.delegation_deadline.isnot(None),
            Action.delegation_deadline < now,
            Action.delegation_feedback.is_(None),
            Action.status == "delegated",
        )
        .order_by(Action.delegation_deadline.asc())
        .all()
    )
