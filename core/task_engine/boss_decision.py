"""老板决策处理（V5 任务引擎）。

Vera 录入老板（Brandon）的答复后，推进案件待办：
    approve → 标记 completed
    reject  → 标记 rejected
    defer   → 标记 deferred（暂缓，仍留在待办）
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.events.sse import sse_manager
from core.models.orm import Action, Case
from core.task_engine.dispatcher import to_task_response

VALID_DECISIONS = frozenset({"approve", "reject", "defer"})

_STATUS_MAP = {
    "approve": "completed",
    "reject": "rejected",
    "defer": "deferred",
}


def record_boss_reply(
    task_id: int,
    decision: str,  # "approve" | "reject" | "defer"
    note: str = "",
    db: Session = ...,
) -> Action:
    """记录老板决策并推进案件。

    Args:
        task_id: Action ID。
        decision: 老板决策，approve / reject / defer。
        note: 老板备注（与决策一并写入 boss_decision）。
        db: SQLAlchemy session。

    Returns:
        更新后的 Action 实例。

    Raises:
        ValueError: 任务不存在或 decision 非法时。
    """
    if decision not in VALID_DECISIONS:
        raise ValueError(f"非法决策: {decision}，仅支持 {sorted(VALID_DECISIONS)}")

    task = db.get(Action, task_id)
    if task is None:
        raise ValueError(f"任务不存在: task_id={task_id}")

    task.boss_decision = f"{decision}: {note}" if note else decision
    task.status = _STATUS_MAP[decision]
    db.commit()
    db.refresh(task)

    case = db.get(Case, task.case_id) if task.case_id else None
    sse_manager.publish("task_updated", to_task_response(task, case))
    return task
