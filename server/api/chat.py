"""AI 对话路由 — 服务端工具循环（#12 非流式对话协议）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.ai.case_summary import mark_case_summary_dirty
from core.chat.loop import run_chat_with_tools
from core.logger import get_logger
from core.models.orm import Case, CaseChatMessage, GlobalChatMessage
from server.api.schemas import ChatMessageResponse, ChatRequest, ChatResponse, ToolCard
from server.deps import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])

logger = get_logger(__name__)


@router.post("/", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """发送消息给 AI — 服务端工具循环（#12）。"""
    case_id = req.case_id or ""
    try:
        result = run_chat_with_tools(
            case_id=req.case_id,
            message=req.message,
            track=req.track,
            db=db,
        )
    except Exception:
        logger.exception("AI chat failed for scope=%s", case_id or "system")
        raise HTTPException(status_code=502, detail="AI 服务暂时不可用，请稍后重试")

    reply = result["reply"]
    if case_id:
        db.add_all([
            CaseChatMessage(case_id=case_id, session_id=case_id, role="user", content=req.message),
            CaseChatMessage(case_id=case_id, session_id=case_id, role="assistant", content=reply),
        ])
        mark_case_summary_dirty(case_id, db)
    else:
        db.add_all([
            GlobalChatMessage(session_id="global", role="user", content=req.message),
            GlobalChatMessage(session_id="global", role="assistant", content=reply),
        ])
    db.commit()
    return ChatResponse(
        reply=reply,
        tool_cards=[ToolCard(**c) for c in result["tool_cards"]],
        recorded_facts=result["recorded_facts"],
        suggested_actions=[],
    )


@router.get("/{case_id}/history", response_model=list[ChatMessageResponse])
def chat_history(
    case_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),  # noqa: B008
):
    """对话历史。"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")
    messages = (
        db.query(CaseChatMessage)
        .filter(CaseChatMessage.case_id == case_id)
        .order_by(CaseChatMessage.created_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [
        ChatMessageResponse(
            id=m.id,
            case_id=m.case_id,
            role=m.role,
            content=m.content,
            created_at=m.created_at,
        )
        for m in reversed(messages)
    ]