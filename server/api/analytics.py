"""统计端点 — 天 / 周 / 月维度，4 个只读聚合接口。

- overview / efficiency：current vs previous 周期对比
- pipeline：趋势序列（含 commission / amount）
- lenders：当前周期银行维度统计
- usage：AI 用量测量（token/费用/延迟/缓存命中率）
所有统计复用 core.analytics 纯查询逻辑，无副作用。
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.analytics import get_efficiency, get_lenders, get_overview, get_pipeline
from core.analytics.usage import get_usage
from server.api.schemas import (
    AnalyticsEfficiencyResponse,
    AnalyticsLendersResponse,
    AnalyticsOverviewResponse,
    AnalyticsPipelineResponse,
    AnalyticsUsageResponse,
)
from server.deps import get_db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_GRANULARITIES = ("day", "week", "month")
_DEFAULT_BUCKETS = {"day": 14, "week": 8, "month": 6}


def _check_granularity(granularity: str) -> str:
    """非法 granularity → 422。"""
    if granularity not in _GRANULARITIES:
        raise HTTPException(
            status_code=422,
            detail=f"granularity 仅支持 day/week/month，收到: {granularity!r}",
        )
    return granularity


def _check_buckets(buckets: int | None, granularity: str) -> int:
    if buckets is None:
        return _DEFAULT_BUCKETS[granularity]
    if buckets < 1:
        raise HTTPException(status_code=422, detail="buckets 必须 ≥ 1")
    return buckets


@router.get("/overview", response_model=AnalyticsOverviewResponse)
def analytics_overview(
    granularity: str = Query("month"),
    db: Session = Depends(get_db),  # noqa: B008
) -> AnalyticsOverviewResponse:
    """最近两个周期（current / previous）的案件总览对比。"""
    _check_granularity(granularity)
    return AnalyticsOverviewResponse(**get_overview(db, granularity))


@router.get("/pipeline", response_model=AnalyticsPipelineResponse)
def analytics_pipeline(
    granularity: str = Query("month"),
    buckets: int | None = Query(None),
    db: Session = Depends(get_db),  # noqa: B008
) -> AnalyticsPipelineResponse:
    """管道趋势：逐周期 新案/递交/获批/结算/金额/佣金。"""
    _check_granularity(granularity)
    n = _check_buckets(buckets, granularity)
    return AnalyticsPipelineResponse(**get_pipeline(db, granularity, n))


@router.get("/lenders", response_model=AnalyticsLendersResponse)
def analytics_lenders(
    granularity: str = Query("month"),
    db: Session = Depends(get_db),  # noqa: B008
) -> AnalyticsLendersResponse:
    """当前周期银行维度：案件数 / 平均审批天数 / OS 占比 / 获批占比。"""
    _check_granularity(granularity)
    return AnalyticsLendersResponse(**get_lenders(db, granularity))


@router.get("/efficiency", response_model=AnalyticsEfficiencyResponse)
def analytics_efficiency(
    granularity: str = Query("month"),
    db: Session = Depends(get_db),  # noqa: B008
) -> AnalyticsEfficiencyResponse:
    """最近两个周期（current / previous）的作业效率对比。"""
    _check_granularity(granularity)
    return AnalyticsEfficiencyResponse(**get_efficiency(db, granularity))


@router.get("/usage", response_model=AnalyticsUsageResponse)
def analytics_usage(
    granularity: Literal["day", "week", "month"] = "day",
    db: Session = Depends(get_db),  # noqa: B008
) -> AnalyticsUsageResponse:
    """AI 用量测量（当前 vs 上期；含缓存命中率与纠正次数）。"""
    data = get_usage(db, granularity)
    return AnalyticsUsageResponse(**data)