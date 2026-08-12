"""AI 对话路由 — 接通 core.ai 脱敏链路。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.ai.case_summary import mark_case_summary_dirty
from core.ai.context_builder import assemble_context
from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import Case, CaseChatMessage, GlobalChatMessage
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate
from server.api.schemas import ChatMessageResponse, ChatRequest, ChatResponse
from server.deps import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])

logger = get_logger(__name__)

_SYSTEM_PROMPT = "你是澳洲贷款经纪团队的 AI 助手。回答要具体到这个客户，不要给通用建议。"


@router.post("/", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """发送消息给 AI — 组装上下文 → 脱敏 → 网关 → 还原。"""
    case_id = req.case_id or ""
    scope = case_id if case_id else "system"

    safe_message = desensitize(req.message, scope, db)
    if case_id:
        ctx = assemble_context(case_id, "case_chat", db, extra_data=safe_message)
        prompt = (
            f"{ctx.role_prompt}\n\n【团队经验】\n{ctx.team_experience}\n\n"
            f"【案件大脑】\n{ctx.case_brain}\n\n【实时数据】\n{ctx.live_data}"
        )
    else:
        prompt = f"{_SYSTEM_PROMPT}\n\n用户问题：{safe_message}"

    try:
        config = get_config()
        gw = ApiGateway(config)
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template=prompt,
            system_prompt=_SYSTEM_PROMPT,
        )
        reply = rehydrate(result.response_text, scope, db)
    except Exception:
        logger.exception("AI chat failed for scope=%s", scope)
        raise HTTPException(status_code=502, detail="AI 服务暂时不可用，请稍后重试")

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
    return ChatResponse(reply=reply, suggested_actions=[])


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
