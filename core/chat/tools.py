"""对话工具白名单 — V1 两个工具：record_fact / suggest_submission。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.context.accumulator import append_context_event
from core.escalation.service import create_escalation
from core.logger import get_logger
from core.task_engine.dispatcher import create_task

logger = get_logger(__name__)

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "record_fact",
            "description": (
                "把用户确认的事实记录进案件账本。"
                "金额/日期/银行名/明确姓名等无歧义信息 confidence=high 直接记录；"
                "判断性、模糊或需要 VERA 确认的信息 confidence=low 进入待确认。"
                "只在案件对话中使用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "要记录的事实原文（中文）"},
                    "confidence": {"type": "string", "enum": ["high", "low"]},
                },
                "required": ["content", "confidence"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_submission",
            "description": "检测到用户要写银行邮件/递交材料/翻译外线内容时调用，提示进入递交模式。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_to_boss",
            "description": (
                "Vera 要把某个卡点/事项升级给老板拍板时调用：新建一条待老板拍板任务"
                "（assignee=brandon，进入老板队列）。可在对话里带截止时间。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "problem": {"type": "string", "description": "卡点问题描述（必填，中文）"},
                    "preference": {"type": "string", "description": "Vera 倾向的方案/建议（可选）"},
                    "deadline": {"type": "string", "description": "期望老板答复的截止时间（ISO 8601，可选）"},
                },
                "required": ["problem"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": (
                "Vera 在对话里要创建任意任务（含截止时间/优先级/负责人）时调用。"
                "任务与当前案件自动关联；升级给老板用 escalate_to_boss，不要用本工具。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务标题（必填，中文）"},
                    "deadline": {"type": "string", "description": "截止时间 ISO 8601（可选）"},
                    "priority": {"type": "string", "enum": ["urgent", "high", "normal", "low"], "description": "默认 normal"},
                    "assignee": {"type": "string", "description": "负责人，默认 vera"},
                    "context": {"type": "object", "description": "补充上下文（可选）"},
                },
                "required": ["title"],
            },
        },
    },
]


def execute_tool(
    name: str,
    arguments: dict,
    case_id: str,
    track: str,
    db: Session,
) -> dict:
    """白名单工具执行（V1 只允许 TOOL_SCHEMAS 内名称）。

    Args:
        name: 工具名（record_fact | suggest_submission）。
        arguments: 工具参数（LLM 生成，已处脱敏环境）。
        case_id: 案件 ID（全局对话为空串）。
        track: internal | external。
        db: SQLAlchemy session。

    Returns:
        结构化结果（回注给 LLM / 生成卡片）。
    """
    if name == "record_fact":
        return _record_fact(arguments, case_id, track, db)
    if name == "suggest_submission":
        return {"suggest": True}
    if name == "escalate_to_boss":
        return _escalate_to_boss(arguments, case_id, db)
    if name == "create_task":
        return _create_task(arguments, case_id, db)
    return {"ok": False, "error": f"unknown tool: {name}"}


def _escalate_to_boss(arguments: dict, case_id: str, db: Session) -> dict:
    """escalate_to_boss：升级卡点到老板队列（新建 ESCALATION Action）。"""
    if not case_id:
        return {"ok": False, "error": "升级老板必须在案件对话中进行"}
    problem = str(arguments.get("problem", "")).strip()
    if not problem:
        return {"ok": False, "error": "problem 不能为空"}
    preference = str(arguments.get("preference", "")).strip() or None
    deadline_raw = arguments.get("deadline")
    try:
        action = create_escalation(
            db=db,
            case_id=case_id,
            problem=problem,
            preference=preference,
            source="ai_chat",
            context=f"聊天升级：{problem[:80]}",
        )
        deadline = None
        if deadline_raw:
            deadline = datetime.fromisoformat(str(deadline_raw))
            action.scheduled_at = deadline
            db.commit()
            db.refresh(action)
        return {
            "ok": True,
            "action_id": action.id,
            "title": action.title,
            "escalated_at": action.escalated_at.isoformat() if action.escalated_at else None,
            "deadline": deadline.isoformat() if deadline else None,
            "assignee": "brandon",
        }
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("escalate_to_boss failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _create_task(arguments: dict, case_id: str, db: Session) -> dict:
    """create_task：对话里创建任意任务（WO-41）。"""
    if not case_id:
        return {"ok": False, "error": "创建任务必须在案件对话中进行"}
    title = str(arguments.get("title", "")).strip()
    if not title:
        return {"ok": False, "error": "title 不能为空"}
    deadline = None
    if arguments.get("deadline"):
        try:
            deadline = datetime.fromisoformat(str(arguments["deadline"]))
        except ValueError:
            return {"ok": False, "error": "deadline 不是合法 ISO 时间"}
    try:
        action = create_task(
            case_id=case_id,
            task_type="general",
            source_channel="manual",
            title=title,
            context=arguments.get("context") or {},
            deadline=deadline,
            priority=arguments.get("priority") or "normal",
            assignee=arguments.get("assignee"),
            db=db,
        )
        return {
            "ok": True,
            "task_id": action.id,
            "title": action.title,
            "priority": action.priority,
            "deadline": action.scheduled_at.isoformat() if action.scheduled_at else None,
            "assignee": action.assignee,
        }
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("create_task failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _record_fact(arguments: dict, case_id: str, track: str, db: Session) -> dict:
    """record_fact 实现：高置信直接 confirmed，低置信 pending（#6）。"""
    if not case_id:
        return {"ok": False, "error": "全局对话禁止写事实"}
    content = str(arguments.get("content", "")).strip()
    if not content:
        return {"ok": False, "error": "content 不能为空"}
    confidence = arguments.get("confidence", "low")
    status = "confirmed" if confidence == "high" else "pending"
    try:
        event = append_context_event(
            case_id=case_id,
            source_type="manual_note",
            content=content,
            db=db,
            trigger_distill=status == "confirmed",
            track=track,
            status=status,
        )
        return {
            "ok": True,
            "event_id": event.id,
            "status": event.status,
            "content": event.content,
            "source_type": event.source_type,
            "track": event.track,
        }
    except Exception as exc:  # noqa: BLE001 — 工具失败不阻断对话
        logger.warning("record_fact failed: %s", exc)
        return {"ok": False, "error": str(exc)}
