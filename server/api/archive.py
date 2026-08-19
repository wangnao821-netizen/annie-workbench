"""档案中心专属路由 — 历史案卷归档扫描与批量入库（WO-60）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.archive.ingestion import batch_import_archive_cases, scan_archive_folder
from server.api.schemas import (
    ArchiveBatchImportRequest,
    ArchiveBatchImportResponse,
    ArchiveScanResponse,
    FolderTopologyScanRequest,
)
from server.deps import get_db

router = APIRouter(prefix="/api/archive", tags=["archive"])


@router.post("/scan", response_model=ArchiveScanResponse)
def scan_archive(
    req: FolderTopologyScanRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchiveScanResponse:
    """扫描历史案卷目录，执行准入审查与放款事实提取。"""
    res = scan_archive_folder(req.folder_path, db=db)
    return ArchiveScanResponse(**res)


@router.post("/batch-import", response_model=ArchiveBatchImportResponse)
def import_archive_batch(
    req: ArchiveBatchImportRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchiveBatchImportResponse:
    """批量将历史完结案卷归档入库。"""
    items_data = [item.model_dump() for item in req.items]
    res = batch_import_archive_cases(items_data, db=db)
    return ArchiveBatchImportResponse(**res)