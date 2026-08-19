"""档案中心专属路由 — 历史案卷归档扫描与批量入库（WO-60）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.archive.ingestion import batch_import_archive_cases, scan_archive_folder
from core.archive.knowledge_bridge import sync_archive_to_knowledge_base
from core.archive.knowledge_mining import (
    generate_case_knowledge_card,
    get_all_assessor_insights,
    search_case_precedents,
)
from core.archive.portfolio import get_archive_hub_stats, get_client_portfolios
from core.archive.retention import get_all_retention_radar
from server.api.schemas import (
    ArchiveBatchImportRequest,
    ArchiveBatchImportResponse,
    ArchiveHubStats,
    ArchivePortfolioResponse,
    ArchiveScanResponse,
    AssessorListResponse,
    CasePrecedentSearchResponse,
    FolderTopologyScanRequest,
    KnowledgeCardResponse,
    KnowledgeSyncResponse,
    RetentionRadarResponse,
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


@router.post("/sync-knowledge", response_model=KnowledgeSyncResponse)
def sync_archive_knowledge_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeSyncResponse:
    """一键将档案库历史结案先例同步蒸馏入知识中心（KnowledgeEntry）。"""
    res = sync_archive_to_knowledge_base(db)
    return KnowledgeSyncResponse(**res)


@router.get("/retention-radar", response_model=RetentionRadarResponse)
def get_retention_radar_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> RetentionRadarResponse:
    """获取档案中心二次经营商机雷达（红黄绿四大时钟统计与客户列表）。"""
    res = get_all_retention_radar(db)
    return RetentionRadarResponse(**res)


@router.get("/assessors", response_model=AssessorListResponse)
def get_assessors_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> AssessorListResponse:
    """获取所有已知审批官画像与统计数据。"""
    items = get_all_assessor_insights(db)
    return AssessorListResponse(ok=True, total_assessors=len(items), assessors=items)


@router.get("/precedents", response_model=CasePrecedentSearchResponse)
def search_precedents_endpoint(
    lender: str | None = None,
    doc_type: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),  # noqa: B008
) -> CasePrecedentSearchResponse:
    """多维检索历史结案实战先例。"""
    items = search_case_precedents(
        db, lender=lender, doc_type=doc_type, keyword=keyword, limit=limit
    )
    return CasePrecedentSearchResponse(
        ok=True, total_found=len(items), precedents=items
    )


@router.get("/cases/{case_id}/knowledge-card", response_model=KnowledgeCardResponse)
def get_case_knowledge_card_endpoint(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> KnowledgeCardResponse:
    """获取单个已结案案卷的经验复盘卡片。"""
    card = generate_case_knowledge_card(case_id, db)
    if not card:
        return KnowledgeCardResponse(ok=False, message="案卷不存在或尚未结案")
    return KnowledgeCardResponse(ok=True, card=card)


@router.get("/stats", response_model=ArchiveHubStats)
def get_archive_stats_endpoint(
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchiveHubStats:
    """获取档案中心全局大盘统计指标。"""
    res = get_archive_hub_stats(db)
    return ArchiveHubStats(**res)


@router.get("/portfolio", response_model=ArchivePortfolioResponse)
def get_portfolio_endpoint(
    query: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),  # noqa: B008
) -> ArchivePortfolioResponse:
    """获取按客户主体聚合的终生资产全景列表。"""
    stats = get_archive_hub_stats(db)
    clients = get_client_portfolios(db, query=query, limit=limit)
    return ArchivePortfolioResponse(
        ok=True,
        stats=ArchiveHubStats(**stats),
        clients=clients,
    )