"""口语相对时间解析器 (WO-65)：纯正则 + datetime，Sydney 时区。"""

from __future__ import annotations

import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

_WEEKDAY_MAP = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
_CN_NUM_MAP = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _get_sydney_tz() -> ZoneInfo:
    try:
        from core.config import get_config
        return ZoneInfo(getattr(get_config().settings, "analytics_tz", "Australia/Sydney") or "Australia/Sydney")
    except Exception:  # noqa: BLE001
        return ZoneInfo("Australia/Sydney")


def resolve_relative_time(expr: str, ref_time: datetime | None = None) -> str | None:
    """口语相对时间折算为 Sydney 时区 ISO 字符串；未识别返回 None。"""
    raw = (expr or "").strip()
    if not raw:
        return None
    tz = _get_sydney_tz()
    now = ref_time.astimezone(tz) if (ref_time and ref_time.tzinfo) else (ref_time.replace(tzinfo=tz) if ref_time else datetime.now(tz))
    target_dt: datetime | None = None

    # 1. 今天 / 今晚
    if "今晚" in raw:
        target_dt = datetime.combine(now.date(), time(21, 0, 0), tzinfo=tz)
    elif "今天" in raw or "今日" in raw:
        target_dt = datetime.combine(now.date(), time(18, 0, 0), tzinfo=tz)

    # 2. 明天（下午 15:00、晚 21:00、默认 09:00）
    elif "明天下午" in raw:
        target_dt = datetime.combine(now.date() + timedelta(days=1), time(15, 0, 0), tzinfo=tz)
    elif "明晚" in raw or "明天晚上" in raw:
        target_dt = datetime.combine(now.date() + timedelta(days=1), time(21, 0, 0), tzinfo=tz)
    elif "明天" in raw or "明日" in raw or "明早" in raw or "明天早" in raw:
        target_dt = datetime.combine(now.date() + timedelta(days=1), time(9, 0, 0), tzinfo=tz)

    # 3. 后天（下午 15:00 / 晚上 21:00 / 默认 09:00）
    elif "后天下午" in raw:
        target_dt = datetime.combine(now.date() + timedelta(days=2), time(15, 0, 0), tzinfo=tz)
    elif "后天晚上" in raw:
        target_dt = datetime.combine(now.date() + timedelta(days=2), time(21, 0, 0), tzinfo=tz)
    elif "后天" in raw:
        target_dt = datetime.combine(now.date() + timedelta(days=2), time(9, 0, 0), tzinfo=tz)

    # 4. 下周X（周日说"下周一" = 明天）
    elif m := re.search(r"下周([一二三四五六日天])", raw):
        target_w = _WEEKDAY_MAP[m.group(1)]
        days_ahead = 1 if (now.weekday() == 6 and target_w == 0) else (7 - now.weekday()) + target_w
        target_dt = datetime.combine(now.date() + timedelta(days=days_ahead), time(17, 0, 0), tzinfo=tz)

    # 5. 本周X / 周X前（已过则下周；当天未到 17:00 视为今天）
    elif m := re.search(r"(?:本周|周|星期)([一二三四五六日天])(?:前|之前)?", raw):
        target_w = _WEEKDAY_MAP[m.group(1)]
        days_ahead = (target_w - now.weekday() - 1) % 7 + 1
        if days_ahead == 7 and now.time() < time(17, 0, 0):
            days_ahead = 0
        target_dt = datetime.combine(now.date() + timedelta(days=days_ahead), time(17, 0, 0), tzinfo=tz)
    # 6. N天后 / N小时后
    elif m := re.search(r"(\d+|[一二两三四五六七八九十]+)\s*天后", raw):
        n_val = int(m.group(1)) if m.group(1).isdigit() else _CN_NUM_MAP.get(m.group(1), 1)
        target_dt = datetime.combine(now.date() + timedelta(days=n_val), time(17, 0, 0), tzinfo=tz)
    elif m := re.search(r"(\d+|[一二两三四五六七八九十]+)\s*小时后", raw):
        n_val = int(m.group(1)) if m.group(1).isdigit() else _CN_NUM_MAP.get(m.group(1), 1)
        target_dt = now + timedelta(hours=n_val)
    # 7. 月底 / 下个月X号
    elif "月底" in raw:
        next_month = now.replace(day=28) + timedelta(days=4)
        last_day = next_month - timedelta(days=next_month.day)
        target_dt = datetime.combine(last_day.date(), time(17, 0, 0), tzinfo=tz)
    elif m := re.search(r"(?:下个?月)\s*(\d+)\s*号", raw):
        try:
            target_dt = datetime.combine(
                (now.replace(day=28) + timedelta(days=4)).replace(day=int(m.group(1))).date(),
                time(17, 0, 0), tzinfo=tz,
            )
        except ValueError:
            target_dt = None
    return target_dt.isoformat() if target_dt else None
