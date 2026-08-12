"""V5 任务引擎路由（队列/派单/委派/老板决策）。"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.models.orm import Action, Case
from core.task_engine.boss_decision import record_boss_reply
from core.task_engine.delegation import delegate_to
from core.task_engine.dispatcher import create_task, dispatch_task, list_tasks, to_task_response
from server.api.schemas import (
    BossReplyRequest,
    CreateTaskRequest,
    DelegateRequest,
    DispatchRequest,
    TaskResponse,
)
from server.deps import get_db

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _as_task_response(action: Action, db: Session) -> TaskResponse:
    """把 Action 组装成 TaskResponse（含 source_msg_id）。"""
    case = db.get(Case, action.case_id) if action.case_id else None
    return TaskResponse(**to_task_response(action, case))


@router.get("/", response_model=list[TaskResponse])
def list_tasks_endpoint(
    filter: str = "today",
    db: Session = Depends(get_db),  # noqa: B008
) -> list[TaskResponse]:
    """获取任务列表。filter: today|urgent|all|delegated"""
    data = list_tasks(filter=filter, db=db)
    return [TaskResponse(**item) for item in data]


@router.post("/", response_model=TaskResponse)
def create_task_endpoint(
    req: CreateTaskRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> TaskResponse:
    """创建一个任务（服务进程内触发 SSE task_created 推送，在线页面实时收到）。"""
    if not req.case_id or not req.case_id.strip():
        raise HTTPException(status_code=422, detail="请先关联案件或新建案件")
    if req.source_channel not in ("manual", "calendar"):
        raise HTTPException(
            status_code=422,
            detail=f"source_channel 仅支持 manual/calendar，收到: {req.source_channel!r}",
        )
    case = db.get(Case, req.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    try:
        action = create_task(
            case_id=req.case_id,
            task_type=req.task_type,
            source_channel=req.source_channel,
            title=req.title,
            context=req.context,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _as_task_response(action, db)


@router.post("/{task_id}/dispatch", response_model=TaskResponse)
def dispatch_task_endpoint(
    task_id: int,
    req: DispatchRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> TaskResponse:
    """派单三键：approve / reject / defer / delegate"""
    try:
        action = dispatch_task(task_id, action=req.action, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _as_task_response(action, db)


@router.post("/{task_id}/delegate", response_model=TaskResponse)
def delegate_task_endpoint(
    task_id: int,
    req: DelegateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> TaskResponse:
    """委派给同事。"""
    deadline: datetime | None = None
    if req.deadline:
        try:
            deadline = datetime.fromisoformat(req.deadline)
        except ValueError as e:
            raise HTTPException(status_code=422, detail="deadline 不是合法 ISO 时间") from e
    try:
        action = delegate_to(
            task_id,
            delegate_name=req.delegate_to,
            deadline=deadline,
            message=req.message,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _as_task_response(action, db)


@router.post("/{task_id}/boss-reply", response_model=TaskResponse)
def boss_reply_endpoint(
    task_id: int,
    req: BossReplyRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> TaskResponse:
    """老板决策回复。"""
    try:
        action = record_boss_reply(task_id, decision=req.decision, note=req.note, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _as_task_response(action, db)
