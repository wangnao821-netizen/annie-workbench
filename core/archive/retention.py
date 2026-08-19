"""core/archive/retention.py — WO-58 二次经营时钟引擎与主动商机雷达。

基于已归结案（stage == 'closed' 或 close_reason == 'settled'），按四大时钟
（🔴固定利率到期 / 🟡满年降息体检 / 🟢增值套现 / 🔵放款关怀）计算主动商机，
并汇总全局商机雷达。所有时间计算统一基于 UTC。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)

# 各时钟判定窗口（天数，UTC）
_RED_WINDOWS = ((300, 365), (665, 730))    # 固定利率到期（无显式日期兜底）
_YELLOW_WINDOWS = ((330, 400), (690, 760))  # 满年降息体检（1 周年 / 2 周年）
_GREEN_THRESHOLD = 700                       # 增值套现与再置业（放款超 700 天）
_BLUE_WINDOWS = ((20, 45), (170, 195))       # 放款关怀（30 天 / 180 天）


def _ensure_utc(dt: datetime) -> datetime:
    """把可能 naive 的 datetime 归一化为带 UTC 时区的值。"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _is_settled(case: Case) -> bool:
    """已归结案隔离：仅 stage == 'closed' 或 close_reason == 'settled' 生效。"""
    return bool(case.stage == "closed" or case.close_reason == "settled")


def _case_base_opp(case: Case, closed_at: datetime) -> dict[str, Any]:
    """构造商机共有的案件基础字段。"""
    return {
        "case_id": case.id,
        "client_name": case.client_name,
        "property_address": getattr(case, "property_address", None),
        "lender": case.lender,
        "loan_amount": case.loan_amount,
        "interest_rate": case.interest_rate,
        "settlement_date": closed_at.date().isoformat(),
    }


def compute_case_retention_opportunities(
    case: Case,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """针对单个已归档案件，计算当前触发的所有二次经营商机。

    规则：
    1. 仅对 stage == 'closed' 或 close_reason == 'settled' 的案件生效；
    2. 计算放款已过天数 days_since_settlement = (now - case.closed_at).days；
    3. 🔴 fixed_rate_expiry (Red):
       - 若设置了 fixed_expiry_date，且 0 <= (fixed_expiry_date - now).days <= 90；
       - 或无显式日期但 days_since_settlement 处于 300~365 / 665~730 天且 rate_type 标记为 fixed；
       - title: "固定利率即将在 {N} 天内到期", action: "联系客户锁定新转贷方案"；
    4. 🟡 annual_repricing (Yellow):
       - 放款满 330~400 天 (1年) 或 690~760 天 (2年)；
       - title: "放款已满 {N} 周年降息体检", action: "向原银行发起降息申请(Repricing)或比价转贷"；
    5. 🟢 equity_cashout (Green):
       - 放款超过 700 天；
       - title: "资产增值套现与再置业机会", action: "咨询增值套现与第二套投资房置业意向"；
    6. 🔵 settlement_care (Blue):
       - 放款后 20~45 天 或 170~195 天；
       - title: "放款后账单核对与关怀", action: "确认首次扣款正常与对账单服务"。
    """
    now = _ensure_utc(now if now is not None else datetime.now(UTC))
    if not _is_settled(case) or case.closed_at is None:
        return []
    closed_at = _ensure_utc(case.closed_at)
    days_since_settlement = (now - closed_at).days
    base = _case_base_opp(case, closed_at)
    opportunities: list[dict[str, Any]] = []

    # 🔴 固定利率到期时钟（Red）
    fixed_expiry = getattr(case, "fixed_expiry_date", None)
    if fixed_expiry is not None:
        days_to_expiry = (_ensure_utc(fixed_expiry) - now).days
        if 0 <= days_to_expiry <= 90:
            opportunities.append({
                **base,
                "level": "red",
                "opp_type": "fixed_rate_expiry",
                "title": f"固定利率即将在 {days_to_expiry} 天内到期",
                "action_suggest": "联系客户锁定新转贷方案",
                "days_relevant": days_to_expiry,
            })
    elif getattr(case, "rate_type", None) == "fixed":
        for lo, hi, base_days in ((300, 365, 365), (665, 730, 730)):
            if lo <= days_since_settlement <= hi:
                days_to_expiry = base_days - days_since_settlement
                opportunities.append({
                    **base,
                    "level": "red",
                    "opp_type": "fixed_rate_expiry",
                    "title": f"固定利率即将在 {days_to_expiry} 天内到期",
                    "action_suggest": "联系客户锁定新转贷方案",
                    "days_relevant": days_to_expiry,
                })
                break

    # 🟡 满年降息体检时钟（Yellow）
    for lo, hi, year in ((330, 400, 1), (690, 760, 2)):
        if lo <= days_since_settlement <= hi:
            opportunities.append({
                **base,
                "level": "yellow",
                "opp_type": "annual_repricing",
                "title": f"放款已满 {year} 周年降息体检",
                "action_suggest": "向原银行发起降息申请(Repricing)或比价转贷",
                "days_relevant": year,
            })
            break

    # 🟢 增值套现与再置业时钟（Green）
    if days_since_settlement > _GREEN_THRESHOLD:
        opportunities.append({
            **base,
            "level": "green",
            "opp_type": "equity_cashout",
            "title": "资产增值套现与再置业机会",
            "action_suggest": "咨询增值套现与第二套投资房置业意向",
            "days_relevant": days_since_settlement,
        })

    # 🔵 放款周期关怀时钟（Blue）
    if any(lo <= days_since_settlement <= hi for lo, hi in _BLUE_WINDOWS):
        opportunities.append({
            **base,
            "level": "blue",
            "opp_type": "settlement_care",
            "title": "放款后账单核对与关怀",
            "action_suggest": "确认首次扣款正常与对账单服务",
            "days_relevant": days_since_settlement,
        })

    return opportunities


def get_all_retention_radar(db: Session, now: datetime | None = None) -> dict[str, Any]:
    """遍历所有归档案件，汇总全局商机雷达指标。

    返回：
    {
        "ok": True,
        "summary": {
            "total_opportunities": int,
            "red_count": int,     # 固定利率到期
            "yellow_count": int,  # 满年降息体检
            "green_count": int,   # 增值套现
            "blue_count": int     # 关怀问候
        },
        "opportunities": list[dict]
    }
    """
    now = _ensure_utc(now if now is not None else datetime.now(UTC))
    settled_cases = (
        db.query(Case)
        .filter(or_(Case.stage == "closed", Case.close_reason == "settled"))
        .all()
    )
    opportunities: list[dict[str, Any]] = []
    for case in settled_cases:
        opportunities.extend(compute_case_retention_opportunities(case, now=now))

    summary = {
        "total_opportunities": len(opportunities),
        "red_count": sum(1 for o in opportunities if o["level"] == "red"),
        "yellow_count": sum(1 for o in opportunities if o["level"] == "yellow"),
        "green_count": sum(1 for o in opportunities if o["level"] == "green"),
        "blue_count": sum(1 for o in opportunities if o["level"] == "blue"),
    }
    logger.info(
        "Retention radar: %d opportunities (%d red / %d yellow / %d green / %d blue)",
        summary["total_opportunities"],
        summary["red_count"],
        summary["yellow_count"],
        summary["green_count"],
        summary["blue_count"],
    )
    return {"ok": True, "summary": summary, "opportunities": opportunities}