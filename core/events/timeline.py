"""Timeline service — structured event recording for loan case lifecycle.

Provides functions to record and retrieve timeline events for cases.
Events are immutable once written (append-only).

Red Line compliance:
- No writes to client file folders.
- No PII in event descriptions (uses ai_summary which is already desensitized).
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import CaseTimelineEvent

logger = get_logger(__name__)

# Valid event types
VALID_EVENT_TYPES = frozenset([
    "email_received",
    "stage_advanced",
    "document_received",
    "action_completed",
    "deadline_set",
    "note_added",
])


def record_event(
    case_id: str,
    event_type: str,
    title: str,
    db: Session,
    description: str | None = None,
    source_ref: str | None = None,
    metadata: dict | None = None,
) -> CaseTimelineEvent:
    """Write a timeline event for a case.

    Args:
        case_id: The case to record the event for.
        event_type: One of VALID_EVENT_TYPES.
        title: Short human-readable title (Chinese).
        db: SQLAlchemy session.
        description: Optional longer description.
        source_ref: Optional reference ID (email ID, action ID, etc.).
        metadata: Optional dict of extra data (serialized to JSON).

    Returns:
        The created CaseTimelineEvent.

    Raises:
        ValueError: If event_type is invalid or case_id is empty.
    """
    if not case_id:
        raise ValueError("case_id is required for timeline events")

    if event_type not in VALID_EVENT_TYPES:
        raise ValueError(
            f"Invalid event_type: {event_type}. "
            f"Must be one of: {sorted(VALID_EVENT_TYPES)}"
        )

    metadata_json = None
    if metadata:
        metadata_json = json.dumps(metadata, ensure_ascii=False)

    event = CaseTimelineEvent(
        case_id=case_id,
        event_type=event_type,
        title=title,
        description=description,
        source_ref=source_ref,
        metadata_json=metadata_json,
    )
    db.add(event)

    # 同步写入 CaseContextEvent，打通全景多源时序
    try:
        from core.models.orm import CaseContextEvent

        ctx_content = f"[{event_type}] {title}\n{description or ''}".strip()
        db.add(
            CaseContextEvent(
                case_id=case_id,
                source_type="stage_progression" if "stage" in event_type else "milestone",
                content=ctx_content,
                track="internal",
                source_ref=f"timeline:{event_type}:{source_ref or ''}",
                status="confirmed",
            )
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("同步 CaseContextEvent 失败: %s", exc)

    db.commit()

    logger.debug(
        "Timeline event recorded: case=%s type=%s title=%s",
        case_id, event_type, title[:30],
    )
    return event


def get_timeline(
    case_id: str,
    db: Session,
    limit: int = 50,
    event_type: str | None = None,
) -> list[CaseTimelineEvent]:
    """Retrieve timeline events for a case, ordered by time descending.

    Args:
        case_id: The case to query.
        db: SQLAlchemy session.
        limit: Maximum events to return (default 50).
        event_type: Optional filter by event type.

    Returns:
        List of CaseTimelineEvent ordered newest-first.
    """
    query = (
        db.query(CaseTimelineEvent)
        .filter(CaseTimelineEvent.case_id == case_id)
    )

    if event_type:
        if event_type not in VALID_EVENT_TYPES:
            logger.warning("Invalid event_type filter: %s", event_type)
            return []
        query = query.filter(CaseTimelineEvent.event_type == event_type)

    return (
        query
        .order_by(
            CaseTimelineEvent.created_at.desc(),
            CaseTimelineEvent.id.desc(),
        )
        .limit(limit)
        .all()
    )
