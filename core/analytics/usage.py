"""AI 用量聚合（#8 测量工具：token/费用/延迟/缓存命中率 + 纠正次数）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.analytics.bucketing import buckets_since
from core.models.orm import AiUsageLog, CaseContextEvent


def get_usage(db: Session, granularity: str) -> dict:
    """当前 vs 上期两桶用量聚合（#21 质量信号：corrected_count = superseded 事件数）。"""
    a, b = buckets_since(granularity, 2)
    return {
        "current": _period(db, b),   # b = 当前桶（buckets_since 旧→新、末尾为当前）
        "previous": _period(db, a),  # a = 上期桶
    }


def _period(db: Session, bucket: tuple) -> dict:
    start, end, _ = bucket
    rows = db.query(AiUsageLog).filter(
        AiUsageLog.created_at >= start, AiUsageLog.created_at < end
    ).all()
    calls = len(rows)
    prompt_tokens = sum(r.prompt_tokens for r in rows)
    completion_tokens = sum(r.completion_tokens for r in rows)
    cache_hit = sum(r.prompt_cache_hit_tokens for r in rows)
    cache_miss = sum(r.prompt_cache_miss_tokens for r in rows)
    corrected = db.query(CaseContextEvent).filter(
        CaseContextEvent.status == "superseded",
        CaseContextEvent.created_at >= start,
        CaseContextEvent.created_at < end,
    ).count()
    return {
        "calls": calls,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "prompt_cache_hit_tokens": cache_hit,
        "prompt_cache_miss_tokens": cache_miss,
        "cache_hit_rate": round(cache_hit / (cache_hit + cache_miss), 4) if (cache_hit + cache_miss) else None,
        "cost_usd": round(sum(r.cost_usd for r in rows), 4),
        "avg_latency_ms": round(sum(r.latency_ms for r in rows) / calls, 1) if calls else None,
        "corrected_count": corrected,
    }