"""案件路由 — CRUD + 生命周期（接通 core 业务层）。"""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.agents.declaration_check import run_declaration_check
from core.ai.case_context import build_case_context
from core.ai.case_summary import mark_case_summary_dirty
from core.bank_registry import (
    display_name,
    display_platform,
    resolve_lender_key,
    resolve_platform_key,
)
from core.case_creation import create_case_from_source
from core.case_engine.folder import auto_create, link_existing
from core.case_engine.progression import evaluate_stage_signal
from core.case_engine.snapshot import build_case_snapshot
from core.case_folder.legacy_import import build_legacy_import_preview
from core.checklist.matcher import CaseNotFoundError, check_completeness
from core.config import get_config
from core.constants import TERMINAL_STAGES
from core.context.accumulator import append_context_event, get_context_events
from core.events.timeline import get_timeline
from core.facts.extract import sync_brain_facts
from core.models.orm import (
    Action,
    BrainFact,
    Case,
    CaseChecklist,
    CaseContextEvent,
    CaseKnowledge,
    CaseTimelineEvent,
    OsCondition,
)
from core.policy.engine import check_policy
from core.policy.prompts import polish_policy_text
from server.api.schemas import (
    ArchivedCaseResponse,
    BrainFactResponse,
    CaseCloseRequest,
    CaseContextResponse,
    CaseCreateRequest,
    CaseDetailResponse,
    CaseFolderRequest,
    CaseFolderResponse,
    CaseHoldRequest,
    CaseResponse,
    CaseResubmitRequest,
    CaseSnapshotResponse,
    ContextEventRequest,
    ContextEventResponse,
    DeclarationCheckRequest,
    DeclarationCheckResponse,
    FactAmendRequest,
    FactDisclosureRequest,
    LegacyImportPreviewRequest,
    LegacyImportPreviewResponse,
    ParseFileResponse,
    ParseTextRequest,
    PolicyCheckResponse,
    PreFillResponse,
    StageAdvanceRequest,
    SubmissionCheckResponse,
    SupersedeEventRequest,
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


# 删除案件时级联清理：含 case_id 列的业务表白名单（不含 cases 本身，最后删）
_CASE_CASCADE_TABLES = (
    "actions",
    "case_briefs",
    "case_chat_messages",
    "case_checklist",
    "case_context_events",
    "case_knowledge",
    "case_milestones",
    "case_timeline_events",
    "email_drafts",
    "file_events",
    "import_jobs",
    "knowledge_entries",
    "os_conditions",
    "pending_actions",
    "pii_map",
    "processed_files",
    "system_events",
    "brain_facts",
    "ai_usage_log",
)


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
    has_boss = (
        db.query(Action)
        .filter(
            Action.case_id == case.id,
            Action.assignee == "brandon",
            Action.status == "pending",
            Action.escalated_at.isnot(None),
        )
        .first()
        is not None
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
        has_boss_pending=has_boss,
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
        submission_platform_ref=case.submission_platform_ref,
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


@router.post("/{case_id}/folder", response_model=CaseFolderResponse)
def link_or_create_case_folder(
    case_id: str,
    req: CaseFolderRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseFolderResponse:
    """案件文件夹关联（Vera 手动选择：选已有 / 选父目录新建）。

    - 案件不存在 → 404
    - mode 非法 → 422
    - 路径越界/穿越/不存在 → 422
    """
    _get_case_or_404(case_id, db)

    try:
        if req.mode == "existing":
            updated_case = link_existing(db, case_id=case_id, path=req.path)
        elif req.mode == "create":
            updated_case = auto_create(
                db, case_id=case_id, parent_dir=req.path, folder_name=req.folder_name,
            )
        else:
            raise HTTPException(status_code=422, detail=f"不支持的 mode: {req.mode}")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CaseFolderResponse(
        case_id=updated_case.id,
        folder_path=updated_case.folder_path or "",
        mode=req.mode,
    )



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
    return ContextEventResponse.model_validate(event)


@router.get("/{case_id}/context-events", response_model=list[ContextEventResponse])
def list_context_events(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
    status: str | None = Query(default=None, pattern="^(pending|confirmed|superseded)$"),
    track: str | None = Query(default=None, pattern="^(internal|external)$"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ContextEventResponse]:
    """案件上下文事件列表（按状态/轨道过滤），供确认卡与"已记录 N 条"使用。"""
    _get_case_or_404(case_id, db)
    events = get_context_events(case_id, db, limit=limit, track=track, status=status)
    return [ContextEventResponse.model_validate(e) for e in events]


@router.post("/{case_id}/context-events/{event_id}/confirm", response_model=ContextEventResponse)
def confirm_context_event(case_id: str, event_id: int, db: Session = Depends(get_db)) -> ContextEventResponse:  # noqa: B008
    """低置信确认：pending → confirmed。已 confirmed 幂等 200；superseded → 409。"""
    _get_case_or_404(case_id, db)
    event = db.query(CaseContextEvent).filter(
        CaseContextEvent.id == event_id, CaseContextEvent.case_id == case_id
    ).first()
    if event is None:
        raise HTTPException(status_code=404, detail="事件不存在")
    if event.status == "superseded":
        raise HTTPException(status_code=409, detail="已撤销事件不可确认")
    event.status = "confirmed"
    db.commit()
    db.refresh(event)
    return ContextEventResponse.model_validate(event)


@router.post("/{case_id}/context-events/{event_id}/supersede", response_model=ContextEventResponse)
def supersede_context_event(
    case_id: str,
    event_id: int,
    req: SupersedeEventRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ContextEventResponse:
    """撤销/纠正：confirmed|pending → superseded（不物理删除，审计保留）。superseded → 409。"""
    _get_case_or_404(case_id, db)
    event = db.query(CaseContextEvent).filter(
        CaseContextEvent.id == event_id, CaseContextEvent.case_id == case_id
    ).first()
    if event is None:
        raise HTTPException(status_code=404, detail="事件不存在")
    if event.status == "superseded":
        raise HTTPException(status_code=409, detail="事件已撤销")
    event.status = "superseded"
    event.supersede_reason = req.reason
    event.superseded_by = req.replacement_event_id
    db.commit()
    db.refresh(event)
    return ContextEventResponse.model_validate(event)


@router.get("/{case_id}/facts", response_model=list[BrainFactResponse])
def list_brain_facts(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
    track: str | None = Query(default=None, pattern="^(internal|external)$"),
) -> list[BrainFactResponse]:
    """当前有效 BrainFact 列表（valid_to IS NULL；含 conflict 标记），供全景事实卡。"""
    _get_case_or_404(case_id, db)
    query = db.query(BrainFact).filter(
        BrainFact.case_id == case_id, BrainFact.valid_to.is_(None)
    )
    if track is not None:
        query = query.filter(BrainFact.track == track)
    return [BrainFactResponse.model_validate(f) for f in query.order_by(BrainFact.category, BrainFact.key).all()]


@router.post("/{case_id}/facts/sync", response_model=dict)
def sync_case_brain_facts(case_id: str, db: Session = Depends(get_db)) -> dict:  # noqa: B008
    """全量重建该案件 BrainFact（幂等；pending 不参与；返回写入行数）。"""
    _get_case_or_404(case_id, db)
    written = sync_brain_facts(case_id, db)
    return {"case_id": case_id, "written": written}


def _get_fact_or_404(fact_id: int, case_id: str, db: Session) -> BrainFact:
    """有效事实（valid_to IS NULL）且属于该案件，否则 404。"""
    fact = (
        db.query(BrainFact)
        .filter(
            BrainFact.id == fact_id,
            BrainFact.case_id == case_id,
            BrainFact.valid_to.is_(None),
        )
        .first()
    )
    if fact is None:
        raise HTTPException(status_code=404, detail="事实不存在或已失效")
    return fact


@router.post("/{case_id}/facts/{fact_id}/lock", response_model=BrainFactResponse)
def lock_brain_fact(case_id: str, fact_id: int, db: Session = Depends(get_db)) -> BrainFactResponse:  # noqa: B008
    """人工锁定事实：locked_by_user=True，幂等。"""
    fact = _get_fact_or_404(fact_id, case_id, db)
    fact.locked_by_user = True
    db.commit()
    db.refresh(fact)
    return BrainFactResponse.model_validate(fact)


@router.post("/{case_id}/facts/{fact_id}/unlock", response_model=BrainFactResponse)
def unlock_brain_fact(case_id: str, fact_id: int, db: Session = Depends(get_db)) -> BrainFactResponse:  # noqa: B008
    """解锁事实：locked_by_user=False，幂等。"""
    fact = _get_fact_or_404(fact_id, case_id, db)
    fact.locked_by_user = False
    db.commit()
    db.refresh(fact)
    return BrainFactResponse.model_validate(fact)


@router.patch("/{case_id}/facts/{fact_id}/disclosure", response_model=BrainFactResponse)
def set_fact_disclosure(
    case_id: str,
    fact_id: int,
    req: FactDisclosureRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> BrainFactResponse:
    """设置披露标记：'disclosed' | 'internal_only' | None；非法值 422。"""
    if req.disclosure not in (None, "disclosed", "internal_only"):
        raise HTTPException(status_code=422, detail="disclosure 必须为 'disclosed' / 'internal_only' / null")
    fact = _get_fact_or_404(fact_id, case_id, db)
    fact.disclosure = req.disclosure
    db.commit()
    db.refresh(fact)
    return BrainFactResponse.model_validate(fact)


@router.post("/{case_id}/facts/{fact_id}/amend", response_model=BrainFactResponse)
def amend_brain_fact(
    case_id: str,
    fact_id: int,
    req: FactAmendRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> BrainFactResponse:
    """人工修正事实：新行替换旧行（supersede 审计链）+ 新行自动锁定。"""
    value = req.value.strip()
    if not value:
        raise HTTPException(status_code=422, detail="修正值不能为空")
    old = _get_fact_or_404(fact_id, case_id, db)
    event = append_context_event(
        case_id,
        "manual_fact_amend",
        f"人工修正 [{old.key}]：{value}（原值：{old.value}）"
        + (f"；原因：{req.reason}" if req.reason else ""),
        db,
        trigger_distill=False,
        track=old.track,
        status="confirmed",
    )
    new_row = BrainFact(
        case_id=case_id,
        key=old.key,
        value=value,
        category=old.category,
        track=old.track,
        event_id=event.id,
        locked_by_user=True,
    )
    db.add(new_row)
    db.flush()
    old.superseded_by = new_row.id
    old.conflict = True
    old.valid_to = datetime.now(UTC)
    db.commit()
    db.refresh(new_row)
    return BrainFactResponse.model_validate(new_row)


@router.post("/", response_model=CaseDetailResponse)
def create_case(req: CaseCreateRequest, db: Session = Depends(get_db)):  # noqa: B008
    """创建案件 — 走 core.case_creation.create_case_from_source。"""
    lender_key = resolve_lender_key(req.lender)
    platform_key = resolve_platform_key(req.submission_platform)
    case = create_case_from_source(
        client_name=req.client_name,
        source=req.source,
        db=db,
        broker_name=req.broker_name,
        loan_amount=req.loan_amount,
        purpose=req.purpose,
        lender=display_name(lender_key) or req.lender,
        lender_ref=lender_key,
        client_email=req.client_email,
        client_phone=req.client_phone,
        raw_text=req.raw_text,
        force_new_client=req.is_force_new_client,
        submission_platform=display_platform(platform_key) or req.submission_platform,
        client_goal=req.client_goal,
        special_circumstances=req.special_circumstances,
        property_value=req.property_value,
        employment_type=req.employment_type,
        residency=req.residency,
        interest_rate=req.interest_rate,
        is_imported=req.is_imported,
    )
    # ── 其余字段落 Case 表对应列（core 只读不改） ──
    if req.property_value is not None:
        case.property_value = req.property_value
    if req.interest_rate is not None:
        case.interest_rate = str(req.interest_rate)
    if req.finance_clause_date:
        raw = req.finance_clause_date.replace("Z", "+00:00")
        case.finance_deadline = datetime.fromisoformat(raw)
    if platform_key:
        case.submission_platform_ref = platform_key
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


@router.post("/parse-text", response_model=PreFillResponse)
def parse_case_text(req: ParseTextRequest, db: Session = Depends(get_db)) -> PreFillResponse:  # noqa: B008
    """一段话识别预填：返回建档字段 + 规则事实（不建案）。"""
    from core.facts.prefill import build_prefill_from_text
    data = build_prefill_from_text(req.raw_text, db)
    return PreFillResponse(**data)


@router.post("/parse-file", response_model=ParseFileResponse)
async def parse_case_file(
    file: UploadFile = File(...),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> ParseFileResponse:
    """按需文件提取：Vera 上传单个文件 → 本地解析 → 脱敏提取 → 预填字段。

    红线：文件临时保存到系统临时目录，处理后立即删除；不建索引、不留全量文件数据（#16）。
    """
    from core.facts.prefill import build_prefill_from_text

    tmp_path = None
    try:
        import tempfile
        from pathlib import Path

        from core.pipeline.parser import parse_file
        suffix = Path(file.filename or "upload").suffix or ".pdf"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)
        result = parse_file(tmp_path)
        text = result.text or ""
        data = build_prefill_from_text(text[:8000], db)
        return ParseFileResponse(
            filename=file.filename or "upload",
            text_preview=text[:200],
            prefilled=data["prefilled"],
            facts=data["facts"],
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"文件解析失败：{exc}") from exc
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@router.get("/{case_id}/policy-check", response_model=PolicyCheckResponse)
def policy_check(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> PolicyCheckResponse:
    """建档/变更后政策检查：读案件画像 → 规则引擎 → 话术润色（失败回退模板）。"""
    case = _get_case_or_404(case_id, db)
    result = check_policy(
        lender=case.lender or "",
        employment_type=case.employment_type,
        residency=case.residency,
        lvr=case.lvr,
        loan_amount=case.loan_amount,
        property_value=case.property_value,
        config_dir=get_config().project_root / "config",
    )
    summary = polish_policy_text(result, case_id, db)  # 失败自动回退模板
    return PolicyCheckResponse(**asdict(result), summary=summary)


@router.post("/{case_id}/declaration-check", response_model=DeclarationCheckResponse)
def declaration_check(
    case_id: str,
    req: DeclarationCheckRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> DeclarationCheckResponse:
    """申报一致性检查（#16 按需：只检查 Vera 指定的文件/路径）。"""
    _get_case_or_404(case_id, db)
    if not req.files and not req.folder:
        raise HTTPException(status_code=422, detail="请指定至少一个文件或文件夹路径")
    data = run_declaration_check(case_id, req.files, req.folder, db)
    return DeclarationCheckResponse(**data)


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


@router.delete("/{case_id}")
def delete_case(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """物理删除案件（闭环管理）：级联清理全部关联业务数据后删除案件行。

    红线说明：删除是 Vera 明确操作（前端 confirm 弹窗确认后调用）；
    客户文件夹/文件本身不做任何物理操作（红线#2/#6 不变）。
    """
    _get_case_or_404(case_id, db)
    affected: dict[str, int] = {"cases": 1}

    # 1. brain_facts 关联的向量嵌入（vec0 虚拟表；不可用时静默降级）
    fact_ids = [
        row[0]
        for row in db.execute(
            text("SELECT id FROM brain_facts WHERE case_id = :cid"),
            {"cid": case_id},
        )
    ]
    for fid in fact_ids:
        try:
            db.execute(text("DELETE FROM fact_embeddings WHERE fact_id = :fid"), {"fid": fid})
        except Exception:  # noqa: BLE001, S110 — vec0 不可用时降级，不阻断删除
            pass

    # 2. email_drafts 关联的回复行（email_draft_replies 无 case_id 列，按 draft_id 清）
    draft_ids = [
        row[0]
        for row in db.execute(
            text("SELECT id FROM email_drafts WHERE case_id = :cid"),
            {"cid": case_id},
        )
    ]
    for did in draft_ids:
        db.execute(text("DELETE FROM email_draft_replies WHERE draft_id = :did"), {"did": did})

    # 3. 含 case_id 列的业务表白名单级联清理
    for table in _CASE_CASCADE_TABLES:
        rows = db.execute(
            text(f"DELETE FROM {table} WHERE case_id = :cid"),
            {"cid": case_id},
        ).rowcount
        if rows:
            affected[table] = rows

    # 4. 删除案件主行
    db.execute(text("DELETE FROM cases WHERE case_id = :cid"), {"cid": case_id})
    db.commit()
    return {"deleted": True, "case_id": case_id, "affected": affected}


def _write_lifecycle_event(case_id: str, content: str, db: Session) -> None:
    """闭环操作落一条已确认上下文事件（时间线/全景可见）。"""
    append_context_event(
        case_id=case_id,
        content=content,
        db=db,
        source_type="stage_advanced",
    )


def _apply_terminal(
    case_id: str,
    zh_stage: str,
    en_stage: str,
    reason: str,
    note: str | None,
    db: Session,
) -> dict:
    """终态流转通用（撤回/终止/重递）：改阶段 + 关闭原因 + 事件。"""
    case = _get_case_or_404(case_id, db)
    case.stage = zh_stage
    case.close_reason = reason
    case.close_note = note
    case.closed_at = datetime.now(UTC)
    case.previous_stage = case.previous_stage or "收集资料"
    _write_lifecycle_event(
        case_id,
        f"案件流转为「{zh_stage}」（{en_stage}）：{reason}{'；' + note if note else ''}",
        db,
    )
    mark_case_summary_dirty(case_id, db)
    db.commit()
    return {"status": en_stage, "stage": zh_stage, "message": f"案件已{zh_stage}"}


@router.post("/{case_id}/withdraw", response_model=dict)
def withdraw_case(
    case_id: str,
    req: CaseCloseRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """客户撤回：案件进入终态「已撤回」（档案库只读）。"""
    return _apply_terminal(case_id, "已撤回", "withdrawn", req.reason, req.note, db)


@router.post("/{case_id}/decline", response_model=dict)
def decline_case(
    case_id: str,
    req: CaseCloseRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """终止案件：案件进入终态「已拒绝」（档案库只读）。"""
    return _apply_terminal(case_id, "已拒绝", "declined", req.reason, req.note, db)


@router.post("/{case_id}/hold", response_model=dict)
def hold_case(
    case_id: str,
    req: CaseHoldRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """暂停案件：保留原阶段到 previous_stage，可恢复。"""
    case = _get_case_or_404(case_id, db)
    if case.stage == "暂停中":
        raise HTTPException(status_code=409, detail="案件已在暂停状态")
    case.previous_stage = case.stage
    case.stage = "暂停中"
    case.hold_reminder_date = (
        datetime.fromisoformat(req.reminder_date) if req.reminder_date else None
    )
    _write_lifecycle_event(
        case_id,
        f"案件暂停：{req.reason}{'；' + req.note if req.note else ''}"
        f"{'；提醒日期 ' + req.reminder_date if req.reminder_date else ''}",
        db,
    )
    mark_case_summary_dirty(case_id, db)
    db.commit()
    return {
        "status": "on_hold",
        "stage": "暂停中",
        "reminder_date": req.reminder_date,
        "message": "案件已暂停",
    }


@router.post("/{case_id}/resume", response_model=dict)
def resume_case(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """恢复暂停案件：回到暂停前阶段。"""
    case = _get_case_or_404(case_id, db)
    if case.stage != "暂停中":
        raise HTTPException(status_code=409, detail="案件不在暂停状态")
    restored = case.previous_stage or "收集资料"
    case.stage = restored
    case.hold_reminder_date = None
    _write_lifecycle_event(case_id, f"案件恢复推进（回到 {restored}）", db)
    mark_case_summary_dirty(case_id, db)
    db.commit()
    return {"status": "active", "stage": restored, "message": "案件已恢复"}


@router.post("/{case_id}/resubmit", response_model=dict)
def resubmit_case(
    case_id: str,
    req: CaseResubmitRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """换行重递：原案件终态「已重递」+ 创建新案件（继承知识/文件夹引用）。"""
    case = _get_case_or_404(case_id, db)
    new_case = create_case_from_source(
        client_name=case.client_name,
        source="resubmit",
        db=db,
        loan_amount=req.new_loan_amount if req.new_loan_amount is not None else case.loan_amount,
        purpose=case.purpose,
        lender=req.new_lender,
        client_email=case.client_email or "",
        client_phone=case.client_phone or "",
        property_value=case.property_value,
        employment_type=case.employment_type,
        residency=case.residency,
        interest_rate=case.interest_rate,
        is_imported=case.is_imported,
        auto_folder=False,
    )
    if req.new_case_type:
        new_case.case_type = req.new_case_type
    if req.inherit_knowledge:
        for row in db.query(CaseKnowledge).filter(CaseKnowledge.case_id == case_id).all():
            db.add(
                CaseKnowledge(
                    case_id=new_case.id,
                    content=row.content,
                    source=row.source,
                )
            )
    if req.inherit_files and case.folder_path:
        new_case.folder_path = case.folder_path  # 引用同一物理文件夹，不做任何物理操作
    db.flush()
    case.resub_to = new_case.id
    result = _apply_terminal(
        case_id,
        "已重递",
        "resubmitted",
        req.reason,
        req.note,
        db,
    )
    result["new_case_id"] = new_case.id
    return result


@router.post("/{case_id}/reopen", response_model=dict)
def reopen_case(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict:
    """解封终态案件：回到暂停前阶段/收集资料，清除关闭标记。"""
    case = _get_case_or_404(case_id, db)
    if case.stage not in TERMINAL_STAGES:
        raise HTTPException(status_code=409, detail="案件不在终态，无需解封")
    restored_stage = case.previous_stage or "收集资料"
    case.stage = restored_stage
    case.closed_at = None
    case.close_reason = None
    case.close_note = None
    _write_lifecycle_event(case_id, f"案件解封，回到 {case.stage}", db)
    mark_case_summary_dirty(case_id, db)
    db.commit()
    return {"status": "active", "stage": restored_stage, "message": "案件已解封"}


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


@router.get("/{case_id}/snapshot", response_model=CaseSnapshotResponse)
def case_snapshot(
    case_id: str,
    at: str | None = Query(None),
    track: str = Query("internal"),
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseSnapshotResponse:
    """案件在指定时点的全景快照（at 缺省 = now；ISO 格式；非法 422；无案件 404）。"""
    point: datetime | None = None
    if at is not None:
        try:
            point = datetime.fromisoformat(at)
        except ValueError:
            raise HTTPException(status_code=422, detail="at 必须是 ISO 8601 时间") from None
    if track not in ("internal", "external"):
        raise HTTPException(
            status_code=422,
            detail=f"track 必须是 internal/external，收到 {track}",
        )
    try:
        data = build_case_snapshot(case_id, db, at=point, track=track)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return CaseSnapshotResponse(**data)


@router.post("/legacy-import/preview", response_model=LegacyImportPreviewResponse)
def legacy_import_preview(
    req: LegacyImportPreviewRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> LegacyImportPreviewResponse:
    """存量导入预览：Broker Notes 画像 + 平台递交状态（只读）。"""
    data = build_legacy_import_preview(req.folder_path, db)
    return LegacyImportPreviewResponse(**data)
