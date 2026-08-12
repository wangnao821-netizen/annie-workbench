"""时间分桶助手 — 天 / 周 / 月分组（默认 Australia/Sydney，ANALYTICS_TZ 可覆盖）。

day → YYYY-MM-DD；week → YYYY-Www（ISO 周，周一起）；month → YYYY-MM。
``buckets_since`` 返回最近 n 个完整周期（旧 → 新，末尾为当前周期）。
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

GRANULARITIES: tuple[str, ...] = ("day", "week", "month")
DEFAULT_BUCKETS: dict[str, int] = {"day": 14, "week": 8, "month": 6}

# 配置项：环境变量 ANALYTICS_TZ 可覆盖；settings.yaml analytics.timezone 为声明值
DEFAULT_ANALYTICS_TZ = os.environ.get("ANALYTICS_TZ", "Australia/Sydney")


def _to_local(dt: datetime, tz: str | None = None) -> datetime:
    """把 naive（按 UTC 解释）/aware 时间转换为目标时区的本地 naive 时间。

    Args:
        dt: 待转换时间；naive 视为 UTC（DB 存储约定 datetime.utcnow）。
        tz: IANA 时区名，默认取 DEFAULT_ANALYTICS_TZ。

    Returns:
        目标时区的本地 naive datetime（不带 tzinfo，供分桶/strftime 使用）。
    """
    tz_name = tz or DEFAULT_ANALYTICS_TZ
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(ZoneInfo(tz_name)).replace(tzinfo=None)


def period_key(dt: datetime, granularity: str) -> str:
    """生成分组 key（naive 时间按 UTC 解释后转换到 ANALYTICS_TZ（默认 Australia/Sydney））。"""
    dt = _to_local(dt)
    if granularity == "day":
        return dt.strftime("%Y-%m-%d")
    if granularity == "week":
        iso = dt.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if granularity == "month":
        return dt.strftime("%Y-%m")
    raise ValueError(f"unsupported granularity: {granularity}")


def _bucket_start(dt: datetime, granularity: str) -> datetime:
    """该时刻所属周期的开始（本地时区，日级午夜对齐）。"""
    dt = _to_local(dt)
    day_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if granularity == "day":
        return day_start
    if granularity == "week":
        return day_start - timedelta(days=day_start.weekday())
    if granularity == "month":
        return day_start.replace(day=1)
    raise ValueError(f"unsupported granularity: {granularity}")


def _shift(start: datetime, granularity: str, step: int) -> datetime:
    """按 step（+1 下一周期 / -1 上一周期）移动周期起点。"""
    if granularity == "day":
        return start + timedelta(days=step)
    if granularity == "week":
        return start + timedelta(days=7 * step)
    if granularity == "month":
        year, month = start.year, start.month + step
        while month < 1:
            year, month = year - 1, month + 12
        while month > 12:
            year, month = year + 1, month - 12
        return start.replace(year=year, month=month)
    raise ValueError(f"unsupported granularity: {granularity}")


def buckets_since(
    granularity: str,
    n: int,
    now: datetime | None = None,
) -> list[tuple[datetime, datetime, str]]:
    """最近 n 个完整周期，旧 → 新；每个 ``(start, end, key)``，末尾为当前周期。"""
    if granularity not in GRANULARITIES:
        raise ValueError(f"unsupported granularity: {granularity}")
    if n < 1:
        raise ValueError(f"bucket count must be >= 1, got {n}")
    first = _bucket_start(now or datetime.now(UTC), granularity)
    starts = [first]
    for i in range(1, n):
        starts.append(_shift(first, granularity, -i))
    starts.reverse()
    return [(s, _shift(s, granularity, 1), period_key(s, granularity)) for s in starts]