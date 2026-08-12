"""案件路由 — CRUD + 生命周期（接通 core 业务层）。"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.ai.case_context import build_case_context
from core.ai.case_summary import mark_case_summary_dirty
from core.case_creation import create_case_from_source
from core.case_engine.progression import evaluate_stage_signal
from core.checklist.matcher import CaseNotFoundError, check_completeness
from core.constants import TERMINAL_STAGES
from core.context.accumulator import append_context_event
from core.events.timeline import get_timeline
from core.models.orm import (
    Case,
    CaseChecklist,
    CaseKnowledge,
    CaseTimelineEvent,
    OsCondition,
)
from server.api.schemas import (
    ArchivedCaseResponse,
    CaseContextResponse,
    CaseCreateRequest,
    CaseDetailResponse,
    CaseResponse,
    ContextEventRequest,
    ContextEventResponse,
    StageAdvanceRequest,
    SubmissionCheckResponse,
    TimelineEventResponse,
)
from server.deps import get_db, get_settings

router = APIRouter(prefix="/api/cases", tags=["cases"])
_COLLECTED = ("received", "collected", "waived", "deferred")


def _get_case_or_404(case_id: str, db: Session) -> Case:
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")
    return case


def _checklist_stats(case_id: str, db: Session) -> tuple[int, int]:
    items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    done = sum(1 for i in items if i.status in _COLLECTED)
    return done, len(items)


def _to_case_response(case: Case, db: Session) -> CaseResponse:
    done, total = _checklist_stats(case.id, db)
    last = (
        db.query(CaseTimelineEvent)
        .filter(CaseTimelineEvent.case_id == case.id)
        .order_by(CaseTimelineEvent.created_at.desc())
        .first()
    )
    days = 0
    if case.created_at:
        created = case.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)  # SQLite 存 naive，补 UTC 再比较
        days = (datetime.now(UTC) - created).days
    os_pending = (
        db.query(OsCondition)
        .filter(
            OsCondition.case_id == case.id,
            OsCondition.status == "pending",
        )
        .count()
    )
    return CaseResponse(
        case_id=case.id,
        client_name=case.client_name,
        lender=case.lender or "",
        loan_amount=case.loan_amount or 0.0,
        stage=case.stage or "",
        stage_days=max(days, 0),
        checklist_done=done,
        checklist_total=total,
        progress_pct=round(done / total * 100.0, 1) if total else 0.0,
        last_activity=last.created_at if last else None,
        finance_deadline=case.finance_deadline,
        os_pending_count=os_pending,
    )


def _to_case_detail(case: Case) -> CaseDetailResponse:
    return CaseDetailResponse(
        id=case.id,
        case_id=case.id,
        client_id=case.client_id,
        client_name=case.client_name,
        client_email=case.client_email,
        client_phone=case.client_phone,
        broker_name=case.broker_name,
        lender=case.lender,
        loan_amount=case.loan_amount,
        purpose=case.purpose,
        stage=case.stage or "",
        folder_path=case.folder_path,
        client_goal=case.client_goal,
        special_circumstances=case.special_circumstances,
        interest_rate=case.interest_rate,
        lender_ref=case.lender_ref,
        submission_platform=case.submission_platform,
        finance_deadline=case.finance_deadline,
        created_at=case.created_at,
    )


@router.get("/", response_model=list[CaseResponse])
def list_cases(
    stage: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
):
    """案件列表（支持 stage 筛选）。空库返回 []。"""
    query = db.query(Case)
    if stage:
        query = query.filter(Case.stage == stage)
    cases = query.order_by(Case.created_at.desc()).all()
    return [_to_case_response(c, db) for c in cases]


@router.get("/archived", response_model=list[ArchivedCaseResponse])
def list_archived_cases(
    limit: int = 100,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[ArchivedCaseResponse]:
    """已归档案件：stage ∈ TERMINAL_STAGES（core.constants），按 closed_at/created_at 倒序。"""
    cases = (
        db.query(Case)
        .filter(Case.stage.in_(list(TERMINAL_STAGES)))
        .order_by(Case.closed_at.desc(), Case.created_at.desc())
        .limit(limit)
        .all()
    )
    result: list[ArchivedCaseResponse] = []
    for c in cases:
        base = _to_case_response(c, db)
        result.append(
            ArchivedCaseResponse(
                **base.model_dump(),
                closed_at=c.closed_at,
                close_reason=c.close_reason,
            )
        )
    return result


@router.get("/{case_id}", response_model=CaseDetailResponse)
def get_case(case_id: str, db: Session = Depends(get_db)):  # noqa: B008
    """案件详情。"""
    return _to_case_detail(_get_case_or_404(case_id, db))


@router.get("/{case_id}/context", response_model=CaseContextResponse)
def get_case_context(
    case_id: str,
    track: str = "internal",
    db: Session = Depends(get_db),  # noqa: B008
):
    """统一案件上下文（AI 注入与客户全景共用）。

    ?track=internal|external（默认 internal）；非法值 → 422。案件不存在 → 404。
    """
    _get_case_or_404(case_id, db)
    if track not in ("internal", "external"):
        raise HTTPException(
            status_code=422,
            detail=f"track 必须为 internal 或 external，收到: {track!r}",
        )
    return CaseContextResponse(**build_case_context(case_id, db, track=track))


@router.post("/{case_id}/context-events", response_model=ContextEventResponse)
def create_context_event(
    case_id: str,
    req: ContextEventRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ContextEventResponse:
    """记一笔：手动向案件追加一条上下文事件（双轨蒸馏）。

    - internal → 蒸馏进 Case.context_summary（内线记忆）
    - external → 蒸馏进 Case.submission_summary（外线呈现）
    案件不存在 → 404；content 空 / track 非法 → 422。
    """
    _get_case_or_404(case_id, db)
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=422, detail="content 不能为空")
    try:
        event = append_context_event(
            case_id=case_id,
            source_type=req.source_type,
            content=req.content,
            db=db,
            trigger_distill=True,
            track=req.track,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # source_ref 作为去重键补写（append_context_event 当前不收取该参数）
    if req.source_ref:
        event.source_ref = req.source_ref
        db.commit()
        db.refresh(event)
    return ContextEventResponse(
        id=event.id,
        case_id=event.case_id,
        source_type=event.source_type,
        content=event.content,
        track=event.track,
        created_at=event.created_at,
    )


@router.post("/", response_model=CaseDetailResponse)
def create_case(req: CaseCreateRequest, db: Session = Depends(get_db)):  # noqa: B008
    """创建案件 — 走 core.case_creation.create_case_from_source。"""
    case = create_case_from_source(
        client_name=req.client_name,
        source=req.source,
        db=db,
        broker_name=req.broker_name,
        loan_amount=req.loan_amount,
        purpose=req.purpose,
        lender=req.lender,
        client_email=req.client_email,
        client_phone=req.client_phone,
        raw_text=req.raw_text,
        force_new_client=req.is_force_new_client,
        submission_platform=req.submission_platform,
        client_goal=req.client_goal,
        special_circumstances=req.special_circumstances,
    )
    # ── 其余字段落 Case 表对应列（core 只读不改） ──
    if req.property_value is not None:
        case.property_value = req.property_value
    if req.interest_rate is not None:
        case.interest_rate = str(req.interest_rate)
    if req.finance_clause_date:
        raw = req.finance_clause_date.replace("Z", "+00:00")
        case.finance_deadline = datetime.fromisoformat(raw)
    if req.linked_client_id:
        # 覆盖自动匹配结果，建立客户实体关联（勿写 broker_notes）
        case.client_id = req.linked_client_id
    if req.income_description:
        # income_description 无 Case 列 → 存 CaseKnowledge(source="case_profile")
        # context_assembler 后续自动读取注入上下文
        db.add(
            CaseKnowledge(
                case_id=case.id,
                content=req.income_description,
                source="case_profile",
            )
        )
    db.commit()
    db.refresh(case)
    return _to_case_detail(case)


@router.get("/{case_id}/submission-check", response_model=SubmissionCheckResponse)
def submission_check(case_id: str, db: Session = Depends(get_db)):  # noqa: B008
    """递交自查：必需材料 + OS 条件。"""
    _get_case_or_404(case_id, db)
    try:
        report = check_completeness(case_id, db, get_settings())
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    missing = [it.doc_type for it in report.items if it.status == "missing"]
    pending = [it.doc_type for it in report.items if it.status == "pending_confirm"]
    os_pending = (
        db.query(OsCondition)
        .filter(OsCondition.case_id == case_id, OsCondition.status == "pending")
        .count()
    )
    ok = not missing and os_pending == 0
    return SubmissionCheckResponse(
        case_id=case_id,
        ok=ok,
        pending_items=pending,
        missing_required=missing,
        os_pending=os_pending,
        message="自查通过" if ok else "尚有缺失材料或待处理 OS 条件",
    )


@router.post("/{case_id}/stage-advance")
def stage_advance(
    case_id: str,
    req: StageAdvanceRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """阶段推进：评估信号并生成待确认 Action（不直接改 stage）。"""
    _get_case_or_404(case_id, db)
    action = evaluate_stage_signal(
        case_id=case_id,
        stage_signal=req.signal,
        inbox_msg_id=req.inbox_msg_id or "",
        db=db,
    )
    if action is None:
        raise HTTPException(
            status_code=409,
            detail="无法推进：信号无效、倒退/越级推进、已存在待处理推进或案件处于终态",
        )
    mark_case_summary_dirty(case_id, db)
    return {"status": "pending_confirmation", "action_id": action.id, "title": action.title}


@router.get("/{case_id}/timeline", response_model=list[TimelineEventResponse])
def case_timeline(
    case_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),  # noqa: B008
):
    """案件时间线 — core.events.timeline。"""
    _get_case_or_404(case_id, db)
    events = get_timeline(case_id, db, limit=min(limit, 200))
    return [
        TimelineEventResponse(
            id=e.id,
            case_id=e.case_id,
            event_type=e.event_type,
            title=e.title,
            description=e.description,
            source_ref=e.source_ref,
            created_at=e.created_at,
        )
        for e in events
    ]
