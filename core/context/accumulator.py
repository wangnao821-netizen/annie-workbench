"""Case Context Accumulator — 统一上下文追加 + LLM 蒸馏入口。

职责:
1. 接收来自各模块的上下文增量事件（双轨：internal 内线 / external 外线）
2. 写入 case_context_events 表（不可变记录，按 track 分轨）
3. 触发蒸馏（internal → Case.context_summary；external → Case.submission_summary）
4. 使 Brief 缓存失效

V5 迁移：旧 modules/context/accumulator.py → core/context/accumulator.py。
import 全部改 core.*；AI 调用经 core.pii.gateway.desensitize 脱敏后走
core.ai.gateway.ApiGateway。
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import Case, CaseBrief, CaseContextEvent
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize

logger = get_logger(__name__)

# 合法的 source_type 值
SourceType = Literal[
    "file_deep_scan",
    "email_classified",
    "manual_note",
    "checklist_updated",
    "stage_advanced",
    "strategy_generated",
]

# 双轨：内线真相 / 外线呈现
_TRACKS = ("internal", "external")

# context_summary 蒸馏的最大输入 char 数 (防止超长)
_MAX_CONTEXT_CHARS = 8000

# 蒸馏 prompt — 纯中文输出，结构化
_DISTILL_SYSTEM_PROMPT = (
    "你是一个贷款案件记忆管理专家。你的任务是将一系列上下文事件合并蒸馏为"
    "一份精炼的案件状态总结。输出必须是结构化的中文 Markdown，按主题分类。"
)

_DISTILL_USER_PROMPT = """请将以下案件上下文事件列表蒸馏为一份精炼的案件状态总结。

要求:
1. 按以下主题组织: 收入情况、负债情况、资产情况、客户偏好、风险点、待办事项
2. 只保留有价值的事实性信息，去除重复和冗余
3. 保留具体数字（金额、日期、百分比）
4. 如果某个主题没有信息，不要输出该主题
5. 控制在 500 字以内
6. 只输出 Markdown 总结，不要前言后记

【上下文事件列表】
"""


def append_context_event(
    case_id: str,
    source_type: SourceType,
    content: str,
    db: Session,
    *,
    trigger_distill: bool = True,
    track: str = "internal",
) -> CaseContextEvent:
    """追加一条上下文事件到案件，并可选触发蒸馏。

    Args:
        case_id: 案件 ID。
        source_type: 事件来源类型。
        content: 本次追加的内容文本。
        db: SQLAlchemy session。
        trigger_distill: 是否立即触发蒸馏 (默认 True)。
        track: 事件归属轨道，"internal" | "external" (默认 "internal")。
            - internal 事件 → 蒸馏写入 Case.context_summary（内线记忆）
            - external 事件 → 蒸馏写入 Case.submission_summary（外线呈现）
            默认 "internal"：不破坏既有调用。

    Returns:
        创建的 CaseContextEvent 对象。

    Raises:
        ValueError: 如果 case_id 为空、content 为空或 track 非法。
    """
    if not case_id:
        raise ValueError("case_id is required")
    if not content or not content.strip():
        raise ValueError("content cannot be empty")
    if track not in _TRACKS:
        raise ValueError(f"track must be one of {_TRACKS}, got {track!r}")

    # 1. 写入不可变事件记录
    event = CaseContextEvent(
        case_id=case_id,
        source_type=source_type,
        content=content.strip(),
        track=track,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    logger.info(
        "Context event appended: case=%s source=%s track=%s len=%d",
        case_id, source_type, track, len(content),
    )

    # 2. 触发蒸馏（分轨，互不污染）
    if trigger_distill:
        _distill_context_summary(case_id, db, track=track)

    # 3. 使 Brief 缓存失效
    _invalidate_brief_cache(case_id, db)

    return event


def get_context_events(
    case_id: str,
    db: Session,
    limit: int = 100,
    track: str | None = None,
) -> list[CaseContextEvent]:
    """获取案件的所有上下文事件（按时间正序）。

    Args:
        track: 仅返回该轨道的事件；None 返回全部（默认）。
    """
    query = db.query(CaseContextEvent).filter(CaseContextEvent.case_id == case_id)
    if track is not None:
        query = query.filter(CaseContextEvent.track == track)
    return (
        query.order_by(CaseContextEvent.created_at.asc())
        .limit(limit)
        .all()
    )


def get_distilled_summary(case_id: str, db: Session, track: str = "internal") -> str:
    """获取当前蒸馏后的摘要（内线 → context_summary，外线 → submission_summary）。"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        return ""
    if track == "external":
        return case.submission_summary or ""
    return case.context_summary or ""


def _distill_context_summary(case_id: str, db: Session, track: str = "internal") -> None:
    """合并指定轨道下的 context events 并调用 LLM 蒸馏为精炼总结。

    蒸馏结果写入:
        - track="internal" → Case.context_summary
        - track="external" → Case.submission_summary
    如果 LLM 调用失败，则 fallback 为简单拼接（最近 10 条）。
    """
    events = get_context_events(case_id, db, limit=100, track=track)
    if not events:
        return

    # 组装所有事件文本
    event_texts = []
    for evt in events:
        ts = evt.created_at.strftime('%m-%d %H:%M') if evt.created_at else ""
        event_texts.append(f"[{evt.source_type} | {ts}] {evt.content}")

    combined = "\n".join(event_texts)

    # 如果总文本太短，直接拼接作为 summary，不浪费 LLM 调用
    if len(combined) < 200:
        _save_summary(case_id, combined, db, track=track)
        return

    # 截断防止超长
    if len(combined) > _MAX_CONTEXT_CHARS:
        combined = combined[-_MAX_CONTEXT_CHARS:]

    # 调用 LLM 蒸馏（输入经 core.pii.gateway.desensitize 脱敏）
    try:
        safe_text = desensitize(combined, case_id, db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe_text),
            prompt_template=_DISTILL_USER_PROMPT,
            system_prompt=_DISTILL_SYSTEM_PROMPT,
        )
        distilled = result.response_text.strip()
        _save_summary(case_id, distilled, db, track=track)
        logger.info(
            "Context distilled for case %s track=%s (%d chars)",
            case_id, track, len(distilled),
        )

    except Exception as exc:  # noqa: BLE001
        # Fallback: 最近 10 条事件简单拼接
        logger.warning("LLM distill failed, using fallback: %s", exc)
        fallback_events = events[-10:]
        fallback_text = "\n".join(
            f"- [{e.source_type}] {e.content[:100]}" for e in fallback_events
        )
        _save_summary(case_id, f"## 案件上下文（最近记录）\n\n{fallback_text}", db, track=track)


def _save_summary(case_id: str, summary: str, db: Session, track: str = "internal") -> None:
    """写入对应轨道摘要列（internal → context_summary，external → submission_summary）。"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        return
    if track == "external":
        case.submission_summary = summary
    else:
        case.context_summary = summary
    db.commit()


def _invalidate_brief_cache(case_id: str, db: Session) -> None:
    """使该案件所有 Brief 缓存失效（强制下次重新生成）。"""
    try:
        db.query(CaseBrief).filter(CaseBrief.case_id == case_id).delete()
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("Failed to invalidate brief cache: %s", exc)
