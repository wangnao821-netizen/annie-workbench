"""草稿管理路由 — 接通 core.drafts.generator。"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.drafts.generator import generate_from_advisor, rewrite_reply_draft
from core.models.orm import Case, EmailDraft
from server.api.schemas import (
    DraftCreateRequest,
    DraftListItemResponse,
    DraftRefineRequest,
    DraftResponse,
)
from server.deps import get_db

router = APIRouter(prefix="/api/drafts", tags=["drafts"])


class RollbackRequest(BaseModel):
    version_id: int | None = None  # 回退到哪个版本（默认上一版本）


def _draft_version(draft: EmailDraft, db: Session) -> int:
    """同一 source_action_id 下的版本序号（按 id 升序，从 1 起）。"""
    if draft.source_action_id is None:
        return 1
    count = (
        db.query(EmailDraft.id)
        .filter(
            EmailDraft.source_action_id == draft.source_action_id,
            EmailDraft.id <= draft.id,
        )
        .count()
    )
    return count


def _to_draft_item(draft: EmailDraft, db: Session) -> DraftListItemResponse:
    case = None
    if draft.case_id:
        case = db.query(Case).filter(Case.id == draft.case_id).first()
    return DraftListItemResponse(
        id=draft.id,
        action_id=draft.source_action_id,
        case_id=draft.case_id,
        client_name=case.client_name if case else None,
        subject=draft.subject or "",
        status=draft.status,
        version=_draft_version(draft, db),
        updated_at=draft.updated_at,
    )


def _to_draft(d: EmailDraft) -> DraftResponse:
    return DraftResponse(
        id=d.id,
        case_id=d.case_id,
        draft_type=d.draft_type,
        subject=d.subject,
        to_email=d.to_email,
        body=d.body,
        language=d.language,
        source_action_id=d.source_action_id,
        source_msg_id=d.source_msg_id,
        status=d.status,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


def _draft_by_action(action_id: int, db: Session) -> EmailDraft:
    draft = (
        db.query(EmailDraft)
        .filter(EmailDraft.source_action_id == action_id)
        .order_by(EmailDraft.id.desc())
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail=f"Action {action_id} 无草稿")
    return draft


def _all_versions(action_id: int, db: Session) -> list[EmailDraft]:
    return (
        db.query(EmailDraft)
        .filter(EmailDraft.source_action_id == action_id)
        .order_by(EmailDraft.id.asc())
        .all()
    )


@router.get("/", response_model=list[DraftListItemResponse])
def list_drafts(
    case_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[DraftListItemResponse]:
    """草稿列表：可筛 case_id / status，按 updated_at 倒序，上限 limit（默认 50）。"""
    query = db.query(EmailDraft)
    if case_id:
        query = query.filter(EmailDraft.case_id == case_id)
    if status:
        query = query.filter(EmailDraft.status == status)
    drafts = query.order_by(EmailDraft.updated_at.desc()).limit(limit).all()
    return [_to_draft_item(d, db) for d in drafts]


@router.post("/", response_model=DraftListItemResponse)
def create_manual_draft(
    req: DraftCreateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> DraftListItemResponse:
    """手动建草稿（WO-46）：draft_type=manual（source 判别），status=draft，绝不自动发送。

    case 不存在 404；subject/body 空白 422；track 仅 schema 校验，不落库。
    """
    case = db.query(Case).filter(Case.id == req.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {req.case_id} 不存在")
    subject = (req.subject or "").strip()
    body = (req.body or "").strip()
    if not subject or not body:
        raise HTTPException(status_code=422, detail="subject 与 body 不能为空白")
    draft = EmailDraft(
        case_id=req.case_id,
        draft_type="manual",
        subject=subject,
        body=body,
        status="draft",
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return _to_draft_item(draft, db)


@router.get("/{action_id}", response_model=DraftResponse)
def get_draft(
    action_id: int,
    db: Session = Depends(get_db),  # noqa: B008
):
    """获取草稿 — core.drafts.generator.generate_from_advisor（幂等）。"""
    draft = generate_from_advisor(action_id, db)
    if draft is None:
        raise HTTPException(status_code=404, detail=f"Action {action_id} 无法生成草稿")
    return _to_draft(draft)


@router.post("/{action_id}/refine", response_model=DraftResponse)
def refine_draft(
    action_id: int,
    req: DraftRefineRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """AI 修正草稿 — core.drafts.generator.rewrite_reply_draft。"""
    draft = _draft_by_action(action_id, db)
    updated = rewrite_reply_draft(draft.id, req.instruction, db)
    if updated is None:
        raise HTTPException(status_code=400, detail="草稿不可修正（非草稿状态或重写失败）")
    return _to_draft(updated)


@router.post("/{action_id}/confirm", response_model=DraftResponse)
def confirm_draft(
    action_id: int,
    db: Session = Depends(get_db),  # noqa: B008
):
    """确认发送（系统不自动发信，仅标记 approved）。"""
    draft = _draft_by_action(action_id, db)
    if draft.status != "draft":
        raise HTTPException(status_code=409, detail=f"草稿当前状态为 {draft.status}，无法确认")
    draft.status = "approved"
    draft.approved_at = datetime.now(UTC)
    db.commit()
    db.refresh(draft)
    return _to_draft(draft)


@router.get("/{action_id}/versions", response_model=list[DraftResponse])
def draft_versions(
    action_id: int,
    db: Session = Depends(get_db),  # noqa: B008
):
    """版本历史（含已废弃版本）。"""
    return [_to_draft(d) for d in _all_versions(action_id, db)]


@router.post("/{action_id}/rollback", response_model=DraftResponse)
def rollback_draft(
    action_id: int,
    req: RollbackRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """回退版本：目标版本恢复为 draft，更新的版本全部废弃。"""
    versions = _all_versions(action_id, db)
    if not versions:
        raise HTTPException(status_code=404, detail=f"Action {action_id} 无草稿版本")

    target: EmailDraft | None = None
    for v in versions:
        if req.version_id is not None and v.id == req.version_id:
            target = v
            break
    if req.version_id is None:
        target = versions[-2] if len(versions) > 1 else versions[0]

    if target is None:
        raise HTTPException(status_code=404, detail="指定版本不存在")

    for v in versions:
        if v.id > target.id:
            v.status = "discarded"
    target.status = "draft"
    target.approved_at = None
    db.commit()
    db.refresh(target)
    return _to_draft(target)


# ── 基于 draft_id 直接操作端点（支持手动草稿与独立操作） ──────────────────

@router.get("/by-id/{draft_id}", response_model=DraftResponse)
def get_draft_by_id(
    draft_id: int,
    db: Session = Depends(get_db),  # noqa: B008
) -> DraftResponse:
    """按 draft_id 直接获取草稿详情。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"草稿 {draft_id} 不存在")
    return _to_draft(draft)


@router.post("/by-id/{draft_id}/refine", response_model=DraftResponse)
def refine_draft_by_id(
    draft_id: int,
    req: DraftRefineRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> DraftResponse:
    """按 draft_id 对草稿进行 AI 指令润色。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"草稿 {draft_id} 不存在")
    updated = rewrite_reply_draft(draft.id, req.instruction, db)
    if updated is None:
        raise HTTPException(status_code=400, detail="草稿不可修正（非草稿状态或重写失败）")
    return _to_draft(updated)


@router.post("/by-id/{draft_id}/confirm", response_model=DraftResponse)
def confirm_draft_by_id(
    draft_id: int,
    db: Session = Depends(get_db),  # noqa: B008
) -> DraftResponse:
    """按 draft_id 确认批准草稿（标记 approved）。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"草稿 {draft_id} 不存在")
    if draft.status != "draft":
        raise HTTPException(status_code=409, detail=f"草稿当前状态为 {draft.status}，无法确认")
    draft.status = "approved"
    draft.approved_at = datetime.now(UTC)
    db.commit()
    db.refresh(draft)
    return _to_draft(draft)


@router.get("/by-id/{draft_id}/versions", response_model=list[DraftResponse])
def draft_versions_by_id(
    draft_id: int,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[DraftResponse]:
    """按 draft_id 查询版本历史。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"草稿 {draft_id} 不存在")
    if draft.source_action_id:
        versions = _all_versions(draft.source_action_id, db)
    else:
        versions = [draft]
    return [_to_draft(d) for d in versions]


@router.post("/by-id/{draft_id}/rollback", response_model=DraftResponse)
def rollback_draft_by_id(
    draft_id: int,
    req: RollbackRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> DraftResponse:
    """按 draft_id 回滚版本。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"草稿 {draft_id} 不存在")
    if not draft.source_action_id:
        return _to_draft(draft)
    return rollback_draft(draft.source_action_id, req, db)
