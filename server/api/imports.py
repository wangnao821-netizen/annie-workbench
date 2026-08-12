"""导入历史端点 — GET /api/imports（VBA / libratom / 手动 / onboarding）。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.models.orm import ImportRecord
from server.api.schemas import ImportRecordResponse
from server.deps import get_db

router = APIRouter(prefix="/api/imports", tags=["imports"])


@router.get("/", response_model=list[ImportRecordResponse])
def list_imports(
    source: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),  # noqa: B008
) -> list[ImportRecordResponse]:
    """导入历史列表：可筛 source，按 started_at 倒序。"""
    query = db.query(ImportRecord)
    if source:
        query = query.filter(ImportRecord.source == source)
    rows = query.order_by(ImportRecord.started_at.desc()).limit(limit).all()
    return [
        ImportRecordResponse(**{c.name: getattr(r, c.name) for c in ImportRecord.__table__.columns})
        for r in rows
    ]
