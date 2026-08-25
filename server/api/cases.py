"""案件路由 — CRUD + 生命周期（接通 core 业务层）。"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.agents.declaration_check import run_declaration_check
from core.ai.case_context import build_case_context
from core.ai.case_summary import mark_case_summary_dirty
from core.archive.knowledge_bridge import get_recommended_precedents_for_case
from core.bank_registry import (
    display_name,
    display_platform,
    resolve_lender_key,
    resolve_platform_key,
)
from core.case_creation import create_case_from_source
from core.case_engine.folder import (
    auto_create,
    link_existing,
    scaffold_case_directories,
)
from core.case_engine.milestones import (
    MILESTONE_SEQUENCE,
    MILESTONE_STAGE_MAP,
    get_stage_key,
    update_case_stage_and_milestones,
)
from core.case_engine.progression import evaluate_stage_signal
from core.case_engine.snapshot import build_case_snapshot
from core.case_folder.legacy_import import build_legacy_import_preview
from core.case_folder.topology import scan_customer_topology
from core.checklist.email_draft import (
    generate_preliminary_assessment_email,
    save_preliminary_draft,
)
from core.checklist.initial_generator import generate_initial_checklist
from core.checklist.matcher import (
    CaseNotFoundError,
    check_completeness,
    match_checklist_files_for_case,
)
from core.config import get_config
from core.constants import TERMINAL_STAGES
from core.context.accumulator import append_context_event, get_context_events
from core.facts.extract import sync_brain_facts
from core.models.orm import (
    Action,
    BrainFact,
    Case,
    CaseChecklist,
    CaseContextEvent,
    CaseFile,
    CaseKnowledge,
    CaseTimelineEvent,
    ImportRecord,
    OsCondition,
)
from core.pipeline.msg_timeline import get_timeline_for_case, sync_timeline_for_case
from core.policy.engine import check_policy
from core.policy.prompts import polish_policy_text
from server.api.files import _get_checklist_item_or_404, _to_checklist_item
from server.api.schemas import (
    ArchivedCaseResponse,
    BatchTopologyImportItem,
    BatchTopologyImportRequest,
    BatchTopologyImportResponse,
    BrainFactResponse,
    CaseBriefResponse,
    CaseBriefUpdateRequest,
    CaseCloseRequest,
    CaseContextResponse,
    CaseCreateRequest,
    CaseDetailResponse,
    CaseFolderRequest,
    CaseFolderResponse,
    CaseHoldRequest,
    CaseRecommendedPrecedentsResponse,
    CaseResponse,
    CaseResubmitRequest,
    CaseScaffoldRequest,
    CaseScaffoldResponse,
    CaseSnapshotResponse,
    CaseTimelineResponse,
    ChecklistItemResponse,
    ChecklistMatchFilesResponse,
    ChecklistMatchRequest,
    ChecklistUnmatchRequest,
    ContextEventRequest,
    ContextEventResponse,
    DeclarationCheckRequest,
    DeclarationCheckResponse,
    EmailDraftRequest,
    EmailDraftResponse,
    FactAmendRequest,
    FactDisclosureRequest,
    FileMatchRequest,
    FolderTopologyScanRequest,
    FolderTopologyScanResponse,
    LegacyImportPreviewRequest,
    LegacyImportPreviewResponse,
    MailPreviewResponse,
    ParseFileResponse,
    ParseTextRequest,
    PolicyCheckResponse,
    PreFillResponse,
    StageAdvanceRequest,
    StageUpdateRequest,
    SubmissionCheckResponse,
    SupersedeEventRequest,
    TimelineEventItem,
    TimelineExtractResponse,
)
from server.deps import get_db, get_settings

router = APIRouter(prefix="/api/cases", tags=["cases"])
logger = logging.getLogger(__name__)
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


def _refresh_gathering_progress(case_id: str, db: Session) -> int:
    """按全部必选项重算案件收集进度并写回 Case.gathering_progress。"""
    items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    total = sum(1 for it in items if it.is_required)
    received = sum(1 for it in items if it.is_required and it.status == "received")
    progress = int((received / total) * 100) if total else 0
    case = db.query(Case).filter(Case.id == case_id).first()
    if case:
        case.gathering_progress = progress
    return progress


def _get_case_file_or_404(file_id: str, case_id: str, db: Session) -> CaseFile:
    f = (
        db.query(CaseFile)
        .filter(CaseFile.id == file_id, CaseFile.case_id == case_id)
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail=f"文件 {file_id} 不存在")
    return f


def _apply_manual_match(item: CaseChecklist, file_id: str, replace: bool) -> None:
    """绑定文件到清单项：replace=True 清空旧绑定；否则追加（幂等）。"""
    if replace:
        item.received_file_ids = [file_id]
    else:
        ids = list(item.received_file_ids or [])
        if file_id not in ids:
            ids.append(file_id)
        item.received_file_ids = ids
    item.received_file_id = file_id
    item.status = "received"


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
    # ── WO-74：首次材料清单种子（模板驱动，失败不阻断建档） ──
    try:
        generate_initial_checklist(case.id, db, replace=True)
    except Exception as exc:  # noqa: BLE001 — 首次清单生成失败不阻断建档
        logger.warning("generate initial checklist failed for %s: %s", case.id, exc)
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


@router.patch("/{case_id}/stage")
def update_stage(
    case_id: str,
    req: StageUpdateRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """Vera 手动设置案件阶段（看板拖拽落库，WO-66）。

    Vera 拍板动作（人拖拽），与 AI 信号链路 stage-advance 分工：
    复用 MILESTONE 单一真源落库 + 里程碑联动 + 生命周期事件 + 摘要脏标记。
    终态案件禁止变更；阶段值必须为 MILESTONE_SEQUENCE 合法 key/中文。
    """
    case = _get_case_or_404(case_id, db)
    stage_key = get_stage_key(req.stage)
    if stage_key not in MILESTONE_SEQUENCE:
        raise HTTPException(status_code=422, detail=f"非法阶段: {req.stage}")

    current_key = get_stage_key(case.stage or "")
    if (case.stage or "") in TERMINAL_STAGES or (current_key or "") in TERMINAL_STAGES:
        raise HTTPException(status_code=409, detail="案件处于终态，不可变更阶段")

    if current_key == stage_key:
        # 幂等：同值直接返回，不重复写事件
        return {"case_id": case_id, "stage": MILESTONE_STAGE_MAP[stage_key], "stage_key": stage_key}

    old_label = MILESTONE_STAGE_MAP.get(current_key) or (case.stage or "未知")
    new_label = MILESTONE_STAGE_MAP[stage_key]
    update_case_stage_and_milestones(case_id, stage_key, db)
    append_context_event(
        case_id,
        "flow:stage_manual",
        f"阶段由『{old_label}』变更为『{new_label}』（Vera 手动调整）",
        db,
    )
    mark_case_summary_dirty(case_id, db)
    db.commit()
    return {"case_id": case_id, "stage": new_label, "stage_key": stage_key}


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


@router.post("/folder-topology/scan", response_model=FolderTopologyScanResponse)
def scan_folder_topology(
    req: FolderTopologyScanRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> FolderTopologyScanResponse:
    """扫描客户目录拓扑结构与多案卷元数据（只读）。"""
    res = scan_customer_topology(req.folder_path, db=db)
    return FolderTopologyScanResponse(**res)


def _seed_initial_brain_facts_for_import(
    case: Case,
    item: BatchTopologyImportItem,
    db: Session,
) -> None:
    """沉淀存量导入案件的初始 Brain Facts（交易/房产/身份/职业），非阻塞。

    幂等：同 (case_id, key, track, valid_to IS NULL) 已存在则跳过。
    来源事件固定为一条 confirmed internal 事件（trigger_distill=False，不触发蒸馏）。
    """
    logger = logging.getLogger("server.api.cases")
    facts: list[tuple[str, str, str]] = []
    if item.client_name:
        facts.append(("identity.full_name", item.client_name, "identity"))
    if item.residency:
        facts.append(("identity.residency", item.residency, "identity"))
    if item.employment_type:
        facts.append(("employment.type", item.employment_type, "employment"))
    if item.property_address:
        facts.append(("property.address", item.property_address, "property"))
    if item.property_value is not None:
        facts.append(("property.value", str(item.property_value), "property"))
    if item.loan_amount is not None:
        facts.append(("loan.amount", str(item.loan_amount), "loan"))
    if item.interest_rate is not None:
        facts.append(("loan.rate", str(item.interest_rate), "loan"))
    if item.loan_type:
        facts.append(("loan.type", item.loan_type, "loan"))
    goal = item.client_goal or item.loan_type
    if goal:
        facts.append(("loan.goal", goal, "loan"))
    if item.lender:
        facts.append(("bank.lender", item.lender, "bank"))
    if item.referrer_name:
        facts.append(("referral.source", item.referrer_name, "relationship"))
    if item.co_borrowers:
        facts.append(("identity.co_borrowers", ", ".join(item.co_borrowers), "identity"))
    if item.onhold_reason:
        facts.append(("special.circumstances", f"暂停原因：{item.onhold_reason}", "special"))
    if case.stage:
        facts.append(("stage.current", case.stage, "stage"))
    if not facts:
        return
    try:
        event = append_context_event(
            case_id=case.id,
            source_type="manual_note",
            content="存量拓扑导入：初始画像已沉淀（姓名/身份/雇佣/房产/贷款/银行/阶段/目标/推荐渠道）",
            db=db,
            trigger_distill=False,
        )
        for key, value, category in facts:
            existing = (
                db.query(BrainFact)
                .filter(
                    BrainFact.case_id == case.id,
                    BrainFact.key == key,
                    BrainFact.track == "internal",
                    BrainFact.valid_to.is_(None),
                )
                .first()
            )
            if existing is not None:
                continue
            db.add(
                BrainFact(
                    case_id=case.id,
                    key=key,
                    value=value,
                    category=category,
                    track="internal",
                    event_id=event.id,
                    valid_from=datetime.now(UTC),
                )
            )
        db.commit()
    except Exception as exc:  # noqa: BLE001 — 事实沉淀失败不阻断建档
        db.rollback()
        logger.warning(
            "seed initial brain facts on topology import failed for %s: %s", case.id, exc
        )


@router.post("/topology-import/batch", response_model=BatchTopologyImportResponse)
def batch_topology_import(
    req: BatchTopologyImportRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> BatchTopologyImportResponse:
    """批量从识别出的拓扑案卷中建档（贯通画像、即刻匹配清单、沉淀事实）。"""
    created: list[dict] = []
    for item in req.items:
        goal = item.client_goal or item.loan_type or ""
        
        # 智能阶段判定
        computed_stage = item.stage or "收集资料"
        if item.status == "settled":
            computed_stage = "已放款"
        elif item.status == "closed":
            computed_stage = "已终止"
        elif item.status == "lead":
            computed_stage = "初步咨询"
        elif item.status == "onhold":
            computed_stage = "递交准备"

        case = create_case_from_source(
            client_name=item.client_name,
            source="topology_import",
            db=db,
            lender=item.lender,
            loan_amount=item.loan_amount,
            client_phone=item.client_phone or "",
            client_email=item.client_email or "",
            employment_type=item.employment_type,
            residency=item.residency,
            property_value=item.property_value,
            interest_rate=item.interest_rate,
            purpose=item.loan_type,
            client_goal=goal,
            is_imported=item.is_imported,
            platform_submissions=item.platform_submissions,
            auto_folder=False,
        )
        case.folder_path = item.folder_path
        case.stage = computed_stage
        if goal:
            case.client_goal = goal
        if item.property_address:
            case.property_address = item.property_address
        if item.doc_type:
            case.case_type = item.doc_type
        if item.onhold_reason:
            case.special_circumstances = f"暂停原因：{item.onhold_reason}"
        db.flush()

        # WO-74：首次材料清单种子（模板驱动，失败不阻断建档）
        try:
            generate_initial_checklist(case.id, db, replace=True)
        except Exception as exc:  # noqa: BLE001 — 首次清单生成失败不阻断建档
            logger.warning(
                "generate initial checklist on import failed for %s: %s",
                case.id,
                exc,
            )

        # 核心修复 1：路径回填后立即触发清单文件快速匹配与自动勾选
        if item.folder_path and Path(item.folder_path).is_dir():
            try:
                match_checklist_files_for_case(case.id, db)
            except Exception as exc:  # noqa: BLE001 — 清单匹配失败不阻断建档
                logging.getLogger("server.api.cases").warning(
                    "match checklist files on topology import failed for %s: %s",
                    case.id,
                    exc,
                )

        # 核心修复 2：沉淀初始 Brain Facts（交易/房产/身份/职业）
        _seed_initial_brain_facts_for_import(case, item, db)

        created.append({
            "case_id": case.id,
            "client_name": item.client_name,
            "folder_path": item.folder_path,
        })

    db.add(
        ImportRecord(
            source="topology_import",
            status="done",
            file_count=len(req.items),
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
            note=f"批量拓扑导入 {len(req.items)} 案卷",
        )
    )
    db.commit()
    # ── WO-71: 建档完成后自动触发邮件时间线扫描 ──
    for info in created:
        try:
            sync_timeline_for_case(info["case_id"], db)
        except Exception as exc:  # noqa: BLE001 — 时间线同步失败不阻断建档
            logger.warning(
                "auto sync timeline on topology import failed for %s: %s",
                info["case_id"], exc,
            )
    return BatchTopologyImportResponse(ok=True, created_cases=created)


@router.post("/{case_id}/checklist/match-files", response_model=ChecklistMatchFilesResponse)
def match_case_checklist_files(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> ChecklistMatchFilesResponse:
    """重新扫描案件关联文件夹，按文件标题快速匹配并自动勾选材料清单。"""
    res = match_checklist_files_for_case(case_id, db)
    return ChecklistMatchFilesResponse(
        ok=True,
        case_id=case_id,
        matched_count=res["matched_count"],
        gathering_progress=res.get("gathering_progress", 0),
        matched_details=res.get("items", []),
    )


@router.post("/{case_id}/checklist/{item_id}/match", response_model=ChecklistItemResponse)
def match_checklist_item_endpoint(
    case_id: str,
    item_id: int,
    req: ChecklistMatchRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ChecklistItemResponse:
    """手动绑定文件到清单项（多文件追加 / replace 替换，幂等）。"""
    _get_case_or_404(case_id, db)
    item = _get_checklist_item_or_404(item_id, case_id, db)
    _get_case_file_or_404(req.file_id, case_id, db)
    _apply_manual_match(item, req.file_id, req.replace)
    db.commit()
    db.refresh(item)
    _refresh_gathering_progress(case_id, db)
    db.commit()
    mark_case_summary_dirty(case_id, db)
    return _to_checklist_item(item, db)


@router.post("/{case_id}/checklist/{item_id}/unmatch", response_model=ChecklistItemResponse)
def unmatch_checklist_item_endpoint(
    case_id: str,
    item_id: int,
    req: ChecklistUnmatchRequest | None = None,
    db: Session = Depends(get_db),  # noqa: B008
) -> ChecklistItemResponse:
    """解绑清单项文件；file_id 缺省 = 解绑全部；清空后回 pending。"""
    _get_case_or_404(case_id, db)
    item = _get_checklist_item_or_404(item_id, case_id, db)
    ids = list(item.received_file_ids or [])
    if req and req.file_id:
        ids = [fid for fid in ids if fid != req.file_id]
        if item.received_file_id == req.file_id:
            item.received_file_id = None
    else:
        ids = []
        item.received_file_id = None
    item.received_file_ids = ids
    if not ids:
        item.status = "pending"
    db.commit()
    db.refresh(item)
    _refresh_gathering_progress(case_id, db)
    db.commit()
    mark_case_summary_dirty(case_id, db)
    return _to_checklist_item(item, db)


@router.post("/{case_id}/files/{file_id}/match", response_model=ChecklistItemResponse)
def match_file_to_item_endpoint(
    case_id: str,
    file_id: str,
    req: FileMatchRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ChecklistItemResponse:
    """文件侧绑定清单项（等价于清单侧 match）。"""
    _get_case_or_404(case_id, db)
    _get_case_file_or_404(file_id, case_id, db)
    item = _get_checklist_item_or_404(req.item_id, case_id, db)
    _apply_manual_match(item, file_id, req.replace)
    db.commit()
    db.refresh(item)
    _refresh_gathering_progress(case_id, db)
    db.commit()
    mark_case_summary_dirty(case_id, db)
    return _to_checklist_item(item, db)


@router.post("/{case_id}/checklist/regenerate", response_model=list[ChecklistItemResponse])
def regenerate_case_checklist(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[ChecklistItemResponse]:
    """重新生成清单：只重建 initial（按首次材料模板），condition 项一律不动。"""
    _get_case_or_404(case_id, db)
    try:
        rows = generate_initial_checklist(case_id, db, replace=True)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _refresh_gathering_progress(case_id, db)
    db.commit()
    return [_to_checklist_item(r, db) for r in rows]


@router.get("/{case_id}/timeline", response_model=CaseTimelineResponse)
def get_case_timeline(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseTimelineResponse:
    """获取案件的沟通邮件时序脉络、审批官与关键卡点。"""
    events = get_timeline_for_case(case_id, db)
    case = db.query(Case).filter(Case.id == case_id).first()  # noqa: F841 — 契约保留存在性校验
    assessor = None
    lender_ref = None
    active_blocker = None
    for ev in reversed(events):
        if not assessor and ev.get("assessor"):
            assessor = ev["assessor"]
        if not lender_ref and ev.get("lender_ref"):
            lender_ref = ev["lender_ref"]
        if not active_blocker and ev.get("is_blocker"):
            active_blocker = ev.get("blocker_reason") or ev.get("title")

    return CaseTimelineResponse(
        ok=True,
        case_id=case_id,
        assessor_name=assessor,
        lender_ref=lender_ref,
        active_blocker=active_blocker,
        events=[TimelineEventItem(**e) for e in events],
    )


@router.post("/{case_id}/timeline/extract-emails", response_model=TimelineExtractResponse)
def extract_case_emails_timeline(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> TimelineExtractResponse:
    """重新扫描案件关联目录中的 .msg 邮件，提取时序图谱并落库。"""
    res = sync_timeline_for_case(case_id, db)
    return TimelineExtractResponse(
        ok=True,
        case_id=case_id,
        extracted_count=res.get("extracted_count", 0),
        assessor_name=res.get("assessor_name"),
        lender_ref=res.get("lender_ref"),
        active_blocker=res.get("active_blocker"),
    )


@router.get("/{case_id}/mail-preview", response_model=MailPreviewResponse)
def get_case_mail_preview(
    case_id: str,
    filename: str = Query(..., description="邮件文件名或相对路径"),
    db: Session = Depends(get_db),  # noqa: B008
) -> MailPreviewResponse:
    """就地解析并直接预览 .msg 邮件（发件人、收件人、时间、正文与附件），杜绝外部下载。"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case or not case.folder_path:
        raise HTTPException(status_code=404, detail="案件或目录不存在")

    folder = Path(case.folder_path)
    target_file = None

    # 1. 直接按相对路径
    candidate = folder / filename
    if candidate.is_file():
        target_file = candidate
    else:
        # 2. 递归查找同名文件
        for f in folder.rglob(filename):
            if f.is_file():
                target_file = f
                break

    if not target_file:
        raise HTTPException(status_code=404, detail=f"邮件文件 {filename} 未找到")

    try:
        from extract_msg import Message

        with Message(target_file) as msg:
            date_str = ""
            if msg.date:
                date_str = msg.date.isoformat() if hasattr(msg.date, "isoformat") else str(msg.date)

            att_names = [att.longFilename or att.shortFilename or "附件" for att in (msg.attachments or [])]

            return MailPreviewResponse(
                ok=True,
                filename=target_file.name,
                subject=msg.subject or target_file.stem,
                sender=msg.sender or "未知发件人",
                to=msg.to or "",
                date=date_str,
                body_text=(msg.body or "").strip(),
                body_html=getattr(msg, "htmlBody", None) if isinstance(getattr(msg, "htmlBody", None), str) else None,
                attachments=att_names,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"邮件解析失败: {exc}") from exc



@router.get("/{case_id}/recommended-precedents", response_model=CaseRecommendedPrecedentsResponse)
def get_case_precedents_endpoint(
    case_id: str,
    limit: int = 3,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseRecommendedPrecedentsResponse:
    """获取与当前在办案件最匹配的历史实战先例与破局策略。"""
    items = get_recommended_precedents_for_case(case_id, db=db, limit=limit)
    return CaseRecommendedPrecedentsResponse(
        ok=True,
        case_id=case_id,
        total_recommended=len(items),
        precedents=items,
    )


@router.post("/scaffold", response_model=CaseScaffoldResponse)
def scaffold_case_folder(
    req: CaseScaffoldRequest,
) -> CaseScaffoldResponse:
    """在选定父目录下预创建标准客户/案卷目录骨架（含 11 个标准子文件夹）。"""
    try:
        res = scaffold_case_directories(
            parent_path=req.parent_path,
            client_name=req.client_name,
            case_name=req.case_name,
            create_subdirs=req.create_subdirs,
        )
        return CaseScaffoldResponse(**res)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"创建目录骨架失败: {exc}")


@router.get("/{case_id}/brief", response_model=CaseBriefResponse)
def get_case_brief_endpoint(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseBriefResponse:
    """获取该案卷的权威 Markdown 全景备忘录及脱敏对外版本。"""
    from core.cases.brief import (
        generate_case_brief_markdown,
        strip_secret_sections_for_external,
    )

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")

    facts = db.query(BrainFact).filter(BrainFact.case_id == case_id, BrainFact.valid_to.is_(None)).all()

    # If case already has a user-edited/persisted markdown brief, use it; otherwise generate fresh
    brief_md = case.context_summary if (case.context_summary and case.context_summary.strip().startswith("#")) else generate_case_brief_markdown(case, facts)
    clean_md = strip_secret_sections_for_external(brief_md)

    return CaseBriefResponse(
        ok=True,
        case_id=case_id,
        client_name=case.client_name or "",
        brief_markdown=brief_md,
        external_clean_markdown=clean_md,
    )


@router.put("/{case_id}/brief", response_model=CaseBriefResponse)
def update_case_brief_endpoint(
    case_id: str,
    req: CaseBriefUpdateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseBriefResponse:
    """接收用户在前端编辑后的 Markdown 全景备忘录，反向同步案件事实与上下文。"""
    from core.cases.brief import (
        parse_and_sync_case_brief,
        strip_secret_sections_for_external,
    )

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")

    parse_and_sync_case_brief(case_id, req.brief_markdown, db)
    clean_md = strip_secret_sections_for_external(req.brief_markdown)

    return CaseBriefResponse(
        ok=True,
        case_id=case_id,
        client_name=case.client_name or "",
        brief_markdown=req.brief_markdown,
        external_clean_markdown=clean_md,
    )


@router.post(
    "/{case_id}/email-draft/preliminary",
    response_model=EmailDraftResponse,
)
def create_preliminary_email_draft(
    case_id: str,
    req: EmailDraftRequest | None = None,
    db: Session = Depends(get_db),  # noqa: B008
) -> EmailDraftResponse:
    """生成 Preliminary Assessment 邮件草稿并落草稿箱（status=draft，绝不自动发送）。

    案件不存在 → 404；模板加载/校验失败（ref 未命中 master）→ 422；写入失败 → 500（事务回滚）。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")

    try:
        email = generate_preliminary_assessment_email(case_id, db)
        draft = save_preliminary_draft(case_id, db, email)
    except ValueError as exc:
        # 模板 ref 未命中 master / 案件画像缺失等一致性错误 → 422
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to save preliminary email draft")
        raise HTTPException(status_code=500, detail="生成或落库 Preliminary 草稿失败") from exc

    return EmailDraftResponse(
        ok=True,
        case_id=case_id,
        subject=draft.subject or "",
        body_text=draft.body or "",
        body_html=email["body_html"],
        recipient_email=draft.to_email or "",
        cc_email=email["cc_email"],
        draft_id=f"draft_{draft.id}",
    )

