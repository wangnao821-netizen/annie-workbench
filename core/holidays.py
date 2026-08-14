"""澳洲时区 / 公共假期 / 银行工作日（WO-39）。"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from core.logger import get_logger

logger = get_logger(__name__)

STATES = ("act", "nsw", "qld")
_SYDNEY_TZ = "Australia/Sydney"   # zoneinfo 标准库，自动处理夏令时
_BRISBANE_TZ = "Australia/Brisbane"  # QLD 无夏令时
_BEIJING_TZ = "Asia/Shanghai"     # 中国与澳洲协同

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "holidays_au.yaml"
_CACHE: dict | None = None


def _sydney_today() -> dt.date:
    """悉尼时区下的"今日"（顶栏澳洲面板以悉尼时区为准）。"""
    return dt.datetime.now(ZoneInfo(_SYDNEY_TZ)).date()


def _validate(data: dict) -> None:
    """校验 yaml：version==1、default_state/state 合法、display 存在、日期合法且唯一。"""
    if data.get("version") != 1:
        raise ValueError("holidays_au.yaml: version 必须为 1")
    default = data.get("default_state")
    if default not in STATES:
        raise ValueError(f"holidays_au.yaml: default_state 必须为 {STATES} 之一，实际 {default!r}")
    states = data.get("states") or {}
    if not isinstance(states, dict) or not set(states) == set(STATES):
        raise ValueError(f"holidays_au.yaml: states 必须且只能覆盖 {STATES}，实际 {sorted(states)}")
    for state, cfg in states.items():
        if not isinstance(cfg, dict) or not isinstance(cfg.get("display"), str):
            raise ValueError(f"holidays_au.yaml: {state} 缺少 display 字符串")  # noqa: TRY004
        holidays = cfg.get("holidays") or {}
        if not isinstance(holidays, dict):
            raise ValueError(f"holidays_au.yaml: {state} 的 holidays 必须是映射")  # noqa: TRY004
        for date_str, name in holidays.items():
            try:
                dt.date.fromisoformat(date_str)
            except (TypeError, ValueError):
                raise ValueError(f"holidays_au.yaml: {state} 非法日期 {date_str!r}") from None
            if not isinstance(name, str) or not name.strip():
                raise ValueError(f"holidays_au.yaml: {state} 的日期 {date_str} 缺假期名")
    for state, cfg in states.items():
        seen: set[str] = set()
        for date_str in cfg["holidays"]:
            if date_str in seen:
                raise ValueError(f"holidays_au.yaml: {state} 日期重复 {date_str}")
            seen.add(date_str)
    china = data.get("china")
    if china is not None:
        if not isinstance(china, dict) or not isinstance(china.get("display"), str):
            raise ValueError("holidays_au.yaml: china 缺少 display 字符串")
        for date_str, name in (china.get("holidays") or {}).items():
            try:
                dt.date.fromisoformat(date_str)
            except (TypeError, ValueError):
                raise ValueError(f"holidays_au.yaml: china 非法日期 {date_str!r}") from None
            if not isinstance(name, str) or not name.strip():
                raise ValueError(f"holidays_au.yaml: china 的日期 {date_str} 缺假期名")


def load_holidays() -> dict:
    """读取并校验 config/holidays_au.yaml（version==1、state 合法、日期唯一）。
    失败抛 ValueError；返回 {"default_state": str, "states": {state: {"display": str,
    "holidays": {"YYYY-MM-DD": name}}}}。"""
    global _CACHE
    if _CACHE is None:
        data = yaml.safe_load(_CONFIG_PATH.read_text(encoding="utf-8")) or {}
        _validate(data)
        _CACHE = data
    return _CACHE


def _require_state(state: str) -> None:
    if state not in STATES:
        raise ValueError(f"state 必须为 {STATES} 之一，实际 {state!r}")


def is_working_day(date: dt.date, state: str = "nsw") -> tuple[bool, str | None]:
    """银行工作日判定：周一至周五且非公共假期。
    Returns: (is_working_day, holiday_name_or_None)。"""
    _require_state(state)
    if date.weekday() >= 5:
        return False, None
    name = load_holidays()["states"][state]["holidays"].get(date.isoformat())
    if name:
        return False, name
    return True, None


def state_today_status(state: str) -> dict:
    """今日状态：{"date": "YYYY-MM-DD", "state": state, "is_working_day": bool,
    "holiday_name": str | None, "weekday": 0-6}。"""
    _require_state(state)
    today = _sydney_today()
    is_wd, holiday = is_working_day(today, state)
    return {
        "date": today.isoformat(),
        "state": state,
        "is_working_day": is_wd,
        "holiday_name": holiday,
        "weekday": today.weekday(),
    }


def upcoming_holidays(state: str | None = None, limit: int = 10) -> list[dict]:
    """未来假期（含今天之后），按日期升序；state=None 返回三州合并（带 state 字段）。
    [{"date": "YYYY-MM-DD", "name": str, "state": str, "display": str}]"""
    if state is not None:
        _require_state(state)
    data = load_holidays()
    today = _sydney_today()
    targets = (state,) if state else STATES
    rows: list[dict] = []
    for st in targets:
        cfg = data["states"][st]
        for date_str, name in cfg["holidays"].items():
            if dt.date.fromisoformat(date_str) > today:
                rows.append({"date": date_str, "name": name, "state": st, "display": cfg["display"]})
    rows.sort(key=lambda r: r["date"])
    return rows[:limit]


def next_holiday(state: str = "nsw", from_date: dt.date | None = None) -> dict | None:
    """下一个假期（从 from_date 起，默认今天），None 表示配置内无未来假期。"""
    _require_state(state)
    start = from_date or _sydney_today()
    cfg = load_holidays()["states"][state]
    for date_str, name in sorted(cfg["holidays"].items()):
        if dt.date.fromisoformat(date_str) >= start:
            return {"date": date_str, "name": name, "state": state, "display": cfg["display"]}
    return None


def dls_status() -> dict:
    """夏令时/时差信息：{"sydney": {"utc_offset_hours": 10|11, "dls_active": bool},
    "brisbane": {"utc_offset_hours": 10, "dls_active": False},
    "beijing": {"utc_offset_hours": 8, "dls_active": False}}（基于 Sydney zoneinfo now）"""
    sydney_now = dt.datetime.now(ZoneInfo(_SYDNEY_TZ))
    dst = sydney_now.dst()
    offset_hours = int(sydney_now.utcoffset().total_seconds() // 3600)
    return {
        "sydney": {"utc_offset_hours": offset_hours, "dls_active": bool(dst and dst.total_seconds() > 0)},
        "brisbane": {
            "utc_offset_hours": int(sydney_now.astimezone(ZoneInfo(_BRISBANE_TZ)).utcoffset().total_seconds() // 3600),
            "dls_active": False,
        },
        "beijing": {
            "utc_offset_hours": int(sydney_now.astimezone(ZoneInfo(_BEIJING_TZ)).utcoffset().total_seconds() // 3600),
            "dls_active": False,
        },
    }


def china_holidays(limit: int = 4) -> list[dict]:
    """中国主要长假首日（春节/国庆），未来按日期升序。
    [{"date": "YYYY-MM-DD", "name": str, "display": str}]"""
    data = load_holidays()
    china = data.get("china") or {}
    today = _sydney_today()
    rows: list[dict] = []
    for date_str, name in (china.get("holidays") or {}).items():
        if dt.date.fromisoformat(date_str) > today:
            rows.append({"date": date_str, "name": name, "display": china.get("display", "中国假期")})
    rows.sort(key=lambda r: r["date"])
    return rows[:limit]


def next_china_holiday() -> dict | None:
    """下一个中国主要长假首日；无则 None。"""
    rows = china_holidays(limit=1)
    return rows[0] if rows else None
