"""任务分发器 — 创建任务 + 派单三键（V5 任务引擎核心）。

替代旧的 proactive_suggestions.py + action_factory.py：
    - create_task:  把一条任务写进 Vera 的 Action Inbox
    - dispatch_task: 派单 approve / reject / defer / delegate
    - list_tasks:   查询 Action 并组装 TaskResponse 数据（供 API 层使用）
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from core.events.sse import sse_manager
from core.models.orm import Action, Case

# 有效派单动作
VALID_DISPATCH_ACTIONS = frozenset({"approve", "reject", "defer", "delegate", "claim"})

# 有效优先级（WO-41 create_task 校验枚举）
VALID_PRIORITIES = frozenset({"urgent", "high", "normal", "low"})

# Action.priority (low/medium/high) → TaskResponse.priority (urgent/high/normal/low)
_PRIORITY_MAP = {"urgent": "urgent", "high": "high", "medium": "normal", "low": "low"}


def _boss_problem(action) -> str | None:
    """升级事项的卡点问题摘要（vera_note JSON 的 problem；非升级返回 None）。"""
    if not getattr(action, "escalated_at", None):
        return None
    note = getattr(action, "vera_note", "") or ""
    try:
        data = json.loads(note)
        problem = str(data.get("problem") or "")
        return problem or None
    except (TypeError, ValueError):
        return action.title


def _serialize_context(context: dict[str, Any]) -> str:
    """把结构化上下文序列化成 JSON 存入 ai_suggestion（TEXT 列）。"""
    if not context:
        return ""
    return json.dumps(context, ensure_ascii=False)


def _suggested_action(action: Action) -> str:
    """从上下文 / routing_options 推导展示用的建议动作文案。"""
    raw = action.ai_suggestion or ""
    try:
        parsed = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {}
    if isinstance(parsed, dict):
        suggestion = parsed.get("suggestion") or parsed.get("action")
        if suggestion:
            return str(suggestion)
    if action.routing_options:
        labels = [str(opt.get("label", "")) for opt in action.routing_options if opt.get("label")]
        if labels:
            return " / ".join(labels)
    return raw or action.title


def create_task(
    case_id: str,
    task_type: str,
    source_channel: str,
    title: str,
    context: dict,
    routing_options: list[dict] | None = None,
    deadline: datetime | None = None,
    priority: str | None = None,
    assignee: str | None = None,
    db: Session = ...,
) -> Action:
    """创建一个任务到 Vera 的 Action Inbox。

    Args:
        case_id: 关联案件 ID。
        task_type: 任务类型，如 "email_draft" / "file_confirm" / "os_review"。
        source_channel: 来源渠道，email / file / wechat / manual。
        title: 任务标题（前端卡片展示）。
        context: 结构化上下文（JSON 序列化后存 ai_suggestion；source_msg_id 单独回填）。
        routing_options: 可执行建议元数据，如 [{action: "approve", label: "批准"}]。
        deadline: 截止时间（ISO 8601 解析后的 datetime），非空写 scheduled_at。
        priority: urgent | high | normal | low；None 时回退 context.get("priority", "low")。
        assignee: 负责人；空值默认 "vera"。
        db: SQLAlchemy session。

    Returns:
        已持久化的 Action 实例。

    Raises:
        ValueError: case_id / task_type / title 为空，或 priority 非法时。
    """
    if not case_id or not task_type or not title:
        raise ValueError("case_id, task_type, title 均不能为空")

    if priority is None:
        priority = str(context.get("priority", "low"))
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"非法优先级: {priority}，仅支持 {sorted(VALID_PRIORITIES)}")
    assignee = assignee or "vera"

    action = Action(
        case_id=case_id,
        type=task_type,
        title=title,
        source_channel=source_channel or "email",
        status="pending",
        assignee=assignee,
        ai_suggestion=_serialize_context(context),
        routing_options=routing_options,
        source_msg_id=context.get("source_msg_id"),
        priority=priority,
    )
    if deadline is not None:
        action.scheduled_at = deadline
    db.add(action)
    db.commit()
    db.refresh(action)

    case = db.get(Case, case_id)
    sse_manager.publish("task_created", to_task_response(action, case))
    return action


def dispatch_task(
    task_id: int,
    action: str,
    operator: str = "vera",
    note: str = "",
    db: Session = ...,
) -> Action:
    """派单三键 + 委派。

    Args:
        task_id: Action ID。
        action: "approve" | "reject" | "defer" | "delegate"。
        operator: 操作人（默认 vera）。
        note: 操作备注（写入 vera_note）。
        db: SQLAlchemy session。

    Returns:
        更新后的 Action 实例。

    Raises:
        ValueError: 任务不存在或 action 非法时。
    """
    if action not in VALID_DISPATCH_ACTIONS:
        raise ValueError(f"非法派单动作: {action}，仅支持 {sorted(VALID_DISPATCH_ACTIONS)}")

    task = db.get(Action, task_id)
    if task is None:
        raise ValueError(f"任务不存在: task_id={task_id}")

    if task.type == "stage_advance" and action == "approve":
        from core.case_engine.progression import confirm_stage_advance
        confirm_stage_advance(task_id, db)
        task = db.get(Action, task_id)
        if task is None:
            raise ValueError(f"任务不存在: task_id={task_id}")
    elif action == "claim":
        # Vera 认领跟进：任务保持进行中并归属 Vera，绝不提前完结
        task.status = "in_progress"
    else:
        status_map = {
            "approve": "completed",
            "reject": "rejected",
            "defer": "deferred",
            "delegate": "delegated",
        }
        task.status = status_map[action]

    task.assignee = operator
    if note:
        entry = f"[{operator}] {note}"
        task.vera_note = (task.vera_note + "\n" + entry) if task.vera_note else entry
    db.commit()
    db.refresh(task)

    case = db.get(Case, task.case_id) if task.case_id else None
    sse_manager.publish("task_updated", to_task_response(task, case))
    return task


def to_task_response(action: Action, case: Case | None) -> dict[str, Any]:
    """把 Action + Case 组装成 TaskResponse 兼容字典。"""
    return {
        "id": action.id,
        "type": action.type,
        "title": action.title,
        "case_name": case.client_name if case else "",
        "case_id": action.case_id,
        "case_bank": (case.lender or "") if case else "",
        "loan_amount": (case.loan_amount or 0.0) if case else 0.0,
        "priority": _PRIORITY_MAP.get(action.priority, "normal"),
        "suggested_action": _suggested_action(action),
        "source_channel": action.source_channel or "email",
        "match_status": action.match_status or "confirmed",
        "created_at": action.created_at.isoformat() if action.created_at else None,
          "deadline": action.delegation_deadline.isoformat() if action.delegation_deadline else None,
          "delegated_to": action.delegated_to,
          "source_msg_id": action.source_msg_id,
          "escalated_to_boss": getattr(action, "escalated_at", None) is not None,
          "boss_decision": _boss_problem(action),
      }


def list_tasks(filter: str = "today", db: Session = ...) -> list[dict[str, Any]]:
    """查询 Action 并组装 TaskResponse 数据列表。

    Args:
        filter: today / urgent / all / delegated。
        db: SQLAlchemy session。

    Returns:
        TaskResponse 兼容字典列表（按 created_at 倒序）。
    """
    query = db.query(Action)
    if filter == "delegated":
        query = query.filter(Action.delegated_to.isnot(None))
    elif filter == "urgent":
        query = query.filter(Action.priority.in_(["urgent", "high"]))
    elif filter == "today":
        query = query.filter(Action.status == "pending")
    actions = query.order_by(Action.created_at.desc()).all()

    result: list[dict[str, Any]] = []
    for action in actions:
        case = db.get(Case, action.case_id) if action.case_id else None
        result.append(to_task_response(action, case))
    return result
