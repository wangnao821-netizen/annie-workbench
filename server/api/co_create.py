"""共创弹窗深谈端点（WO-46b）— POST /api/agent/co-create/chat。

独立子会话（session_id 默认 draft:{case_id}，前端过滤不显示于主对话流）。
只出草稿绝不发送；confirm 建待办必须 create_todo=true 显式传入。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.agents.draft_email import run_co_create
from core.models.orm import Case
from server.api.schemas import CoCreateRequest, CoCreateResponse
from server.deps import get_db

router = APIRouter(prefix="/api/agent/co-create", tags=["co-create"])


@router.post("/chat", response_model=CoCreateResponse)
def co_create_chat(req: CoCreateRequest, db: Session = Depends(get_db)) -> dict:  # noqa: B008
    """共创弹窗深谈：clarify/generate/version/branch/confirm。

    无案件 → 404；flow_key/action 非法由 Pydantic 校验 → 422；
    其余 blocked（如 confirm 无父版本）返回 status=blocked + reason。
    """
    case = db.query(Case).filter(Case.id == req.case_id).first()
    if case is None:
        raise HTTPException(status_code=404, detail="case not found")
    return run_co_create(
        req.case_id,
        {
            "flow_key": req.flow_key,
            "action": req.action,
            "message": req.message,
            "session_id": req.session_id,
            "parent_message_id": req.parent_message_id,
            "branch_label": req.branch_label,
            "create_todo": req.create_todo,
            "recipient_hint": "",
        },
        db,
    )
