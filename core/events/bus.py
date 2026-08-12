"""
案件事件总线 — 数据一致性契约的执行引擎。
任何入口调用 emit() 后，总线按同步矩阵规则分发到对应 handler。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseTimelineEvent as CaseTimeline, CaseMilestone, CaseKnowledge, Action

logger = get_logger(__name__)


@dataclass
class CaseEvent:
    """案件事件。"""
    case_id: str
    event_type: str       # 见下方 EVENT_TYPES
    source: str           # "ai_chat" | "manual" | "system" | "inbox"
    operator: str         # "vera" | "ai" | "system"
    title: str            # 事件标题（写入时间线用）
    description: str = "" # 事件描述
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)


# ── 事件类型常量 ──────────────────────────────────────────────────────

EVENT_TYPES = {
    "info_received",       # Vera 在对话中告知了新信息
    "doc_uploaded",        # 新文件上传
    "doc_classified",      # 文件分类确认/修改
    "field_edited",        # OCR 字段手动编辑
    "checklist_changed",   # 材料状态变更
    "email_matched",       # 邮件匹配/分配到案件
    "stage_advanced",      # 阶段推进
    "os_status_changed",   # OS 条件状态变更
    "draft_generated",     # 邮件草稿生成
    "boss_decided",        # 老板拍板决策（Vera 录入老板答复）
    "note_added",          # 备忘/knowledge 添加
    "brain_updated",       # 案件大脑更新
    "settlement",          # 结算完成
}


# ── Handlers ──────────────────────────────────────────────────────────

def _write_timeline(event: CaseEvent, db: Session) -> str | None:
    """所有事件都写时间线（审计日志）。"""
    timeline = CaseTimeline(
        case_id=event.case_id,
        event_type=event.event_type,
        title=event.title,
        description=event.description,
        created_at=event.timestamp,
    )
    db.add(timeline)
    return f"timeline: {event.title}"


def _update_progress(event: CaseEvent, db: Session) -> str | None:
    """更新 gathering_progress（checklist 相关事件触发）。"""
    from core.utils import recalculate_progress
    recalculate_progress(event.case_id, db)
    return "progress_updated"


def _maybe_write_milestone(event: CaseEvent, db: Session) -> str | None:
    """满足里程碑条件时自动写入。"""
    milestone_map = {
        "stage_advanced": event.payload.get("milestone_title"),
        "settlement": "🔑 已完成结算",
        "os_status_changed": event.payload.get("milestone_title"),
    }
    title = milestone_map.get(event.event_type)
    if not title:
        return None
    existing = db.query(CaseMilestone).filter(
        CaseMilestone.case_id == event.case_id,
        CaseMilestone.milestone_name == title,
    ).first()
    if existing:
        return None  # 幂等
    milestone = CaseMilestone(
        case_id=event.case_id,
        milestone_name=title,
        status="completed",
        actual_date=event.timestamp,
    )
    db.add(milestone)
    return f"milestone: {title}"


def _create_action(event: CaseEvent, db: Session) -> str | None:
    """需要 Vera 处理的事件 → 生成 Action。"""
    action_title = event.payload.get("action_title")
    if not action_title:
        return None
    action = Action(
        case_id=event.case_id,
        type=event.payload.get("action_type", "TASK"),
        title=action_title,
        priority=event.payload.get("priority", "medium"),
        status="pending",
        ai_suggestion=event.payload.get("ai_suggestion"),
        created_at=event.timestamp,
    )
    db.add(action)
    return f"action: {action_title}"


# ── 同步矩阵路由表 ───────────────────────────────────────────────────

SYNC_MATRIX: dict[str, list] = {
    "info_received":     [_write_timeline],
    "doc_uploaded":      [_write_timeline, _update_progress],
    "doc_classified":    [_write_timeline, _update_progress],
    "field_edited":      [_write_timeline],
    "checklist_changed": [_write_timeline, _update_progress],
    "email_matched":     [_write_timeline, _create_action],
    "stage_advanced":    [_write_timeline, _maybe_write_milestone],
    "os_status_changed": [_write_timeline, _maybe_write_milestone],
    # 草稿生成只写时间线，不建待办——草稿的归处是草稿箱，
    # 避免每次生成草稿都往今日行动塞一条"确认草稿"（历史堆积 44 条的根因）
    "draft_generated":   [_write_timeline],
    "boss_decided":      [_write_timeline],
    "note_added":        [_write_timeline],
    "brain_updated":     [_write_timeline],
    "settlement":        [_write_timeline, _maybe_write_milestone],
}


# ── 主入口 ────────────────────────────────────────────────────────────

class CaseEventBus:
    """案件事件总线。"""

    @staticmethod
    def emit(event: CaseEvent, db: Session) -> list[str]:
        """分发事件到矩阵中注册的所有 handler。"""
        if event.event_type not in EVENT_TYPES:
            logger.warning(f"Unknown event type: {event.event_type}")
            return []

        handlers = SYNC_MATRIX.get(event.event_type, [])
        results: list[str] = []
        for handler in handlers:
            try:
                result = handler(event, db)
                if result:
                    results.append(result)
            except Exception as e:
                logger.error(f"EventBus handler error: {handler.__name__} — {e}")
        return results
