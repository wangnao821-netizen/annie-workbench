"""统计分析模块（core/analytics）— 天/周/月维度聚合。"""

from core.analytics.bucketing import buckets_since, period_key
from core.analytics.service import (
    get_efficiency,
    get_lenders,
    get_overview,
    get_pipeline,
)

__all__ = [
    "buckets_since",
    "get_efficiency",
    "get_lenders",
    "get_overview",
    "get_pipeline",
    "period_key",
]