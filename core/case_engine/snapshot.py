"""案件时间点回溯 — 指定时点的全景快照（WO-38，借鉴 Semantica point-in-time）。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import BrainFact, Case, CaseContextEvent, CaseTimelineEvent

logger = get_logger(__name__)

_TRACKS = ("internal", "external")


def build_case_snapshot(
    case_id: str,
    db: Session,
    at: datetime | None = None,
    track: str = "internal",
) -> dict:
    """案件在 at（默认 now）时点的全景快照。

    Args:
        case_id: 案件 ID
        db: SQLAlchemy session
        at: 回溯时间点（naive 视为 UTC）；None = 当前时间
        track: 事实/事件轨道（internal | external）

    Returns:
        {"snapshot_at": str, "stage": str, "facts": list[dict],
         "events": list[dict], "timeline": list[dict]}

    Raises:
        ValueError: track 非法；case 不存在
    """
    if track not in _TRACKS:
        raise ValueError(f"非法 track: {track}（仅支持 {'/'.join(_TRACKS)}）")

    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        raise ValueError(f"案件 {case_id} 不存在")

    if at is None:
        at = datetime.utcnow()  # noqa: DTZ003 — 与 ORM 列默认一致（naive UTC）

    facts = [
        {
            "key": f.key,
            "value": f.value,
            "category": f.category,
            "conflict": f.conflict,
            "valid_from": f.valid_from,
            "valid_to": f.valid_to,
        }
        for f in db.query(BrainFact)
        .filter(
            BrainFact.case_id == case_id,
            BrainFact.track == track,
            BrainFact.valid_from <= at,
            (BrainFact.valid_to.is_(None) | (BrainFact.valid_to > at)),
        )
        .order_by(BrainFact.category, BrainFact.key)
        .all()
    ]

    events = [
        {
            "source_type": e.source_type,
            "content": e.content,
            "status": e.status,
            "created_at": e.created_at,
        }
        for e in db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == case_id,
            CaseContextEvent.track == track,
            CaseContextEvent.created_at <= at,
        )
        .order_by(CaseContextEvent.created_at.desc(), CaseContextEvent.id.desc())
        .limit(20)
        .all()
    ]

    timeline = [
        {
            "event_type": t.event_type,
            "title": t.title,
            "description": t.description,
            "created_at": t.created_at,
        }
        for t in db.query(CaseTimelineEvent)
        .filter(
            CaseTimelineEvent.case_id == case_id,
            CaseTimelineEvent.created_at <= at,
        )
        .order_by(CaseTimelineEvent.created_at.desc(), CaseTimelineEvent.id.desc())
        .limit(20)
        .all()
    ]

    stage = _resolve_stage(case_id, db, at, case.stage)

    return {
        "snapshot_at": at.isoformat(),
        "stage": stage,
        "facts": facts,
        "events": events,
        "timeline": timeline,
    }


def _resolve_stage(case_id: str, db: Session, at: datetime, fallback: str | None) -> str:
    """从 stage_advanced 时间线事件推导 at 时点阶段（容错跳过坏 metadata）。"""
    import json

    events = (
        db.query(CaseTimelineEvent)
        .filter(
            CaseTimelineEvent.case_id == case_id,
            CaseTimelineEvent.event_type == "stage_advanced",
            CaseTimelineEvent.created_at <= at,
        )
        .order_by(CaseTimelineEvent.created_at.desc(), CaseTimelineEvent.id.desc())
        .all()
    )
    for ev in events:
        if not ev.metadata_json:
            continue
        try:
            meta = json.loads(ev.metadata_json)
        except ValueError:
            logger.debug("stage_advanced metadata 解析失败，跳过 (id=%s)", ev.id)
            continue
        to_stage = meta.get("to_stage")
        if to_stage:
            return to_stage
    return fallback or "gathering"