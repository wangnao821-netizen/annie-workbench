"""卡片动作端点 — dialog 共创卡的操作重跑通道（F-15 对接补丁）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.agents.flows import load_flows
from core.agents.runner import run_flow
from server.api.schemas import CardActionRequest
from server.deps import get_db

router = APIRouter(prefix="/api/agent/cards", tags=["cards"])


@router.post("/action")
def card_action(req: CardActionRequest, db: Session = Depends(get_db)) -> dict:  # noqa: B008
    """执行共创卡动作（new/version/branch/confirm），走确定性轻量执行器。

    前端按钮 → 本端点 → run_flow(flow, case_id, {action, parent_message_id, ...}) → 新卡片。
    """
    flow = load_flows().get(req.flow_key)
    if flow is None:
        raise HTTPException(status_code=404, detail=f"flow '{req.flow_key}' not found")
    args: dict = {"action": req.action, "_force_lightweight": True}
    if req.parent_message_id is not None:
        args["parent_message_id"] = req.parent_message_id
    if req.branch_label:
        args["branch_label"] = req.branch_label
    if req.recipient_hint:
        args["recipient_hint"] = req.recipient_hint
    args.update(req.extra or {})
    return run_flow(flow, req.case_id, args, db)