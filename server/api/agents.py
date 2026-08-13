"""能力中心 Agent / Tool 注册表 API 端点（WO-25）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.agents.registry import effective_agents, ensure_seeded, set_agent_enabled
from server.api.schemas import AgentItem, AgentsResponse, AgentUpdateRequest
from server.deps import get_db

router = APIRouter(prefix="/api", tags=["agents"])


@router.get("/agents/", response_model=AgentsResponse)
def list_agents(db: Session = Depends(get_db)) -> AgentsResponse:  # noqa: B008
    """获取所有 Agent & Tool 条目（合并运行时开关状态）。"""
    ensure_seeded(db)
    items = effective_agents(db)
    return AgentsResponse(agents=[AgentItem(**item) for item in items])


@router.patch("/agents/{key}", response_model=AgentItem)
def update_agent(
    key: str,
    req: AgentUpdateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> AgentItem:
    """更新指定 Agent / Tool 的启用开关。未知 key 返回 404。"""
    updated = set_agent_enabled(db, key, req.enabled)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Agent/Tool key '{key}' 不存在")
    return AgentItem(**updated)
