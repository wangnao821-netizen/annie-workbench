"""时间分桶助手 — 天 / 周 / 月分组（UTC）。

day → YYYY-MM-DD；week → YYYY-Www（ISO 周，周一起）；month → YYYY-MM。
``buckets_since`` 返回最近 n 个完整周期（旧 → 新，末尾为当前周期）。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

GRANULARITIES: tuple[str, ...] = ("day", "week", "month")
DEFAULT_BUCKETS: dict[str, int] = {"day": 14, "week": 8, "month": 6}


def _set_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def period_key(dt: datetime, granularity: str) -> str:
    """生成分组 key（naive 时间按 UTC 处理）。"""
    dt = _set_utc(dt)
    if granularity == "day":
        return dt.strftime("%Y-%m-%d")
    if granularity == "week":
        iso = dt.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if granularity == "month":
        return dt.strftime("%Y-%m")
    raise ValueError(f"unsupported granularity: {granularity}")


def _bucket_start(dt: datetime, granularity: str) -> datetime:
    """该时刻所属周期的开始（UTC，日级午夜对齐）。"""
    dt = _set_utc(dt)
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
    first = _bucket_start(_set_utc(now or datetime.now(UTC)), granularity)
    starts = [first]
    for i in range(1, n):
        starts.append(_shift(first, granularity, -i))
    starts.reverse()
    return [(s, _shift(s, granularity, 1), period_key(s, granularity)) for s in starts]