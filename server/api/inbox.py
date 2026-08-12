"""收件箱路由（列表 / AI 分析 / 静音发件人）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.inbox.ai_analyzer import analyze_email
from core.inbox.mute import create_mute_rule
from core.models.orm import InboxMessage
from server.api.schemas import InboxMessageResponse
from server.deps import get_db

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


def _to_message(m: InboxMessage) -> InboxMessageResponse:
    return InboxMessageResponse(
        id=m.id,
        subject=m.subject,
        sender_email=m.sender_email,
        sender_name=m.sender_name,
        received_at=m.received_at,
        body_preview=m.body_preview,
        has_attachments=m.has_attachments,
        attachment_count=m.attachment_count,
        status=m.status or "pending",
        level=m.level,
        matched_case_id=m.matched_case_id,
        ai_category=m.ai_category,
        ai_summary=m.ai_summary,
    )


def _get_msg_or_404(msg_id: str, db: Session) -> InboxMessage:
    msg = db.query(InboxMessage).filter(InboxMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail=f"邮件 {msg_id} 不存在")
    return msg


@router.get("/", response_model=list[InboxMessageResponse])
def list_inbox(
    status: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),  # noqa: B008
):
    """收件箱列表。空库返回 []。"""
    query = db.query(InboxMessage)
    if status:
        query = query.filter(InboxMessage.status == status)
    messages = (
        query.order_by(InboxMessage.received_at.desc()).limit(min(limit, 500)).all()
    )
    return [_to_message(m) for m in messages]


@router.post("/{msg_id}/analyze")
def analyze_inbox_message(
    msg_id: str,
    db: Session = Depends(get_db),  # noqa: B008
):
    """AI 分析邮件 — 走 core.inbox.ai_analyzer（脱敏链路，永不抛错）。"""
    msg = _get_msg_or_404(msg_id, db)
    result = analyze_email(
        subject=msg.subject,
        sender=msg.sender_email,
        body_preview=msg.body_preview or "",
        case_id=msg.matched_case_id,
        db=db,
    )
    return {
        "id": msg_id,
        "is_fallback": result.is_fallback,
        "summary": result.summary,
        "action_type": result.action_type,
        "stage_signal": result.stage_signal,
        "deadline": result.deadline.isoformat() if result.deadline else None,
        "conditions": result.conditions,
        "urgency_score": result.urgency_score,
        "suggested_level": result.suggested_level,
        "lender_name": result.lender_name,
        "application_ref": result.application_ref,
        "category": result.category,
    }


@router.post("/{msg_id}/mute")
def mute_sender(
    msg_id: str,
    db: Session = Depends(get_db),  # noqa: B008
):
    """静音该邮件发件人 — core.inbox.mute。"""
    msg = _get_msg_or_404(msg_id, db)
    rule = create_mute_rule(
        filter_type="sender",
        filter_value=msg.sender_email,
        db=db,
    )
    msg.level = "muted"
    db.commit()
    return {
        "status": "muted",
        "sender_email": msg.sender_email,
        "rule_id": rule.id,
    }
