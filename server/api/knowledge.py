"""知识中心 CRUD 端点 — 三层知识体系（B 收尾：清 mock）。

- GET    /api/knowledge           按 layer/case_id/lender 筛选列表
- POST   /api/knowledge           Vera 手动新增条目（source=vera_manual）
- PATCH  /api/knowledge/{id}      更新 content/lender/vera_confirmed
- POST   /api/knowledge/{id}/confirm  标记 vera_confirmed=true（Vera 校对）
- DELETE /api/knowledge/{id}      删除条目（Vera 手动维护，本地元数据）

PII 红线：本地 CRUD 不出外网；content 明文仅存本地 SQLite。
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.models.orm import Case, KnowledgeEntry
from server.api.schemas import (
    KnowledgeCreateRequest,
    KnowledgeEntryResponse,
    KnowledgeUpdateRequest,
)
from server.deps import get_db

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

_LAYERS = ("case", "global", "industry")


def _get_entry_or_404(entry_id: str, db: Session) -> KnowledgeEntry:
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail=f"知识条目 {entry_id} 不存在")
    return entry


def _check_case(case_id: str | None, db: Session) -> None:
    """case 层必须关联存在的案件。"""
    if case_id is None:
        return
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"案件 {case_id} 不存在")


@router.get("/", response_model=list[KnowledgeEntryResponse])
def list_knowledge(
    layer: str | None = None,
    case_id: str | None = None,
    lender: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[KnowledgeEntryResponse]:
    """知识条目列表（created_at 倒序）；空库返回 []。"""
    query = db.query(KnowledgeEntry)
    if layer:
        if layer not in _LAYERS:
            raise HTTPException(status_code=422, detail=f"layer 必须为 {list(_LAYERS)} 之一，实际 {layer!r}")
        query = query.filter(KnowledgeEntry.layer == layer)
    if case_id:
        query = query.filter(KnowledgeEntry.case_id == case_id)
    if lender:
        query = query.filter(KnowledgeEntry.lender == lender)
    rows = query.order_by(KnowledgeEntry.created_at.desc()).limit(min(limit, 500)).all()
    return [KnowledgeEntryResponse.model_validate(r) for r in rows]


@router.post("/", response_model=KnowledgeEntryResponse, status_code=201)
def create_knowledge(
    req: KnowledgeCreateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeEntryResponse:
    """Vera 手动新增知识条目。case 层强制关联案件。"""
    if req.layer == "case" and not req.case_id:
        raise HTTPException(status_code=422, detail="case 层必须提供 case_id")
    _check_case(req.case_id, db)
    entry = KnowledgeEntry(
        id=f"ke_{uuid.uuid4().hex[:12]}",
        layer=req.layer,
        case_id=req.case_id,
        content=req.content.strip(),
        source=req.source or "vera_manual",
        lender=req.lender,
        vera_confirmed=False,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return KnowledgeEntryResponse.model_validate(entry)


@router.patch("/{entry_id}", response_model=KnowledgeEntryResponse)
def update_knowledge(
    entry_id: str,
    req: KnowledgeUpdateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeEntryResponse:
    """更新 content/lender/vera_confirmed（仅传非空字段）。"""
    entry = _get_entry_or_404(entry_id, db)
    if req.content is not None:
        entry.content = req.content.strip()
    if req.lender is not None:
        entry.lender = req.lender
    if req.vera_confirmed is not None:
        entry.vera_confirmed = req.vera_confirmed
    db.commit()
    db.refresh(entry)
    return KnowledgeEntryResponse.model_validate(entry)


@router.post("/{entry_id}/confirm", response_model=KnowledgeEntryResponse)
def confirm_knowledge(
    entry_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeEntryResponse:
    """Vera 校对确认（vera_confirmed=true，进入 AI 上下文检索）。"""
    entry = _get_entry_or_404(entry_id, db)
    entry.vera_confirmed = True
    db.commit()
    db.refresh(entry)
    return KnowledgeEntryResponse.model_validate(entry)


@router.delete("/{entry_id}", status_code=204)
def delete_knowledge(
    entry_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> None:
    """删除知识条目（Vera 手动维护的本地元数据，物理删除）。"""
    entry = _get_entry_or_404(entry_id, db)
    db.delete(entry)
    db.commit()
