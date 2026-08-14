"""澳洲时区 / 公共假期 / 银行工作日端点（WO-39）。

GET /api/holidays — 三州今日状态 + 未来假期 + 默认州下一假期 + 夏令时信息。
数据源 core.holidays（本地 YAML，离线可用）；state 非法返回 422。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from core.holidays import (
    STATES,
    dls_status,
    load_holidays,
    next_holiday,
    state_today_status,
    upcoming_holidays,
)
from server.api.schemas import (
    DlsStatus,
    HolidayItem,
    HolidaysResponse,
    HolidayStateToday,
)

router = APIRouter(prefix="/api", tags=["holidays"])


@router.get("/holidays", response_model=HolidaysResponse)
def get_holidays(
    state: str | None = Query(None),
    limit: int = Query(10, ge=1, le=60),
) -> HolidaysResponse:
    """today：三州各自今日状态；upcoming：未来假期；next：默认州下一个假期；dls：夏令时。"""
    if state is not None and state not in STATES:
        raise HTTPException(status_code=422, detail=f"state 必须为 {list(STATES)} 之一，实际 {state!r}")

    data = load_holidays()
    default_state = data["default_state"]

    today = {
        st: HolidayStateToday(**state_today_status(st))
        for st in STATES
    }
    upcoming = [
        HolidayItem(**item)
        for item in upcoming_holidays(state=state, limit=limit)
    ]
    nxt = next_holiday(default_state)
    dls = {
        key: DlsStatus(**value)
        for key, value in dls_status().items()
    }
    return HolidaysResponse(
        today=today,
        upcoming=upcoming,
        next=HolidayItem(**nxt) if nxt else None,
        dls=dls,
    )