"""佣金估算服务（年估算 · 不含 GST）。

读取 config/lender_policies.yaml 中每家银行的 commission_upfront /
commission_trail，配合案件贷款金额与阶段，输出首期佣金与年度尾随佣金估算。
纯查询无副作用，不写任何数据、不调用外部 API。

状态口径：
- settled（实得）：已结算
- approved（预计）：已批准 / 结算中
- potential（潜在）：其余活跃案件
- excluded（排除）：已终止 / 已撤回 / 已拒绝 / on_hold 等，不计入汇总

金额口径：
- upfront = loan_amount × commission_upfront / 100
- trail_annual = loan_amount × commission_trail / 100（年度估算，不精确到月）

费率或金额缺失时金额输出 None，由前端显示 "—"，不参与金额合计。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from core.constants import TERMINAL_STAGES
from core.knowledge.service import _load_lender_policies
from core.logger import get_logger
from core.models.orm import Case, CaseMilestone

logger = get_logger(__name__)

# 状态口径
_SETTLED_STAGES = {"已结算", "settled"}
_APPROVED_STAGES = {"已批准", "approved", "结算中", "settling"}
# Commission-specific exclusion: base TERMINAL_STAGES + hold/resubmit states
_TERMINAL_STAGES = TERMINAL_STAGES | frozenset({
    "已暂停", "resubmitted",
    "on_hold", "on hold", "onhold",
})

# 时段过滤（针对已结算案件，按结算里程碑实际日期）
_PERIOD_DAYS = {"week": 7, "month": 30}


def get_commission_rates() -> dict[str, dict[str, float]]:
    """从 lender_policies.yaml 提取佣金率表。

    Returns:
        {lender_key: {"upfront": float, "trail": float}}，仅含两项费率齐全的银行。
    """
    policies = _load_lender_policies()
    lenders = policies.get("lenders", {}) or {}
    rates: dict[str, dict[str, float]] = {}
    for key, cfg in lenders.items():
        upfront = cfg.get("commission_upfront")
        trail = cfg.get("commission_trail")
        if isinstance(upfront, (int, float)) and isinstance(trail, (int, float)):
            rates[str(key)] = {"upfront": float(upfront), "trail": float(trail)}
    return rates


def resolve_lender_key(lender: str | None) -> str | None:
    """把案件里的银行名映射到 lender_policies.yaml 的标准键。

    依次尝试：精确匹配 → 大小写不敏感匹配 → full_name 包含匹配。

    Args:
        lender: 案件里的银行名（可为空）。

    Returns:
        标准键；无法匹配时返回 None。
    """
    from core.bank_registry import resolve_policy_key
    return resolve_policy_key(lender)


def commission_status(stage: str | None) -> str:
    """按案件阶段归类佣金状态。

    Args:
        stage: 案件阶段（中文标签或英文 key）。

    Returns:
        "settled" / "approved" / "potential" / "excluded"。
    """
    value = (stage or "").strip()
    if value in _SETTLED_STAGES:
        return "settled"
    if value in _APPROVED_STAGES:
        return "approved"
    if value in _TERMINAL_STAGES:
        return "excluded"
    return "potential"


def _fetch_milestone_dates(db: Session, milestone_name: str) -> dict[str, datetime]:
    """批量取指定里程碑的 actual_date，键为 case_id。"""
    rows = (
        db.query(CaseMilestone)
        .filter(
            CaseMilestone.milestone_name == milestone_name,
            CaseMilestone.actual_date.isnot(None),
        )
        .all()
    )
    return {r.case_id: r.actual_date for r in rows if r.actual_date}


def calculate_case_commission(
    case: Case,
    rates: dict[str, dict[str, float]] | None = None,
    settled_dates: dict[str, datetime] | None = None,
    approved_dates: dict[str, datetime] | None = None,
) -> dict[str, Any] | None:
    """计算单个案件的佣金估算。

    Args:
        case: 案件 ORM 对象。
        rates: 佣金率表（可复用 get_commission_rates 的结果）。
        settled_dates: case_id → 结算实际日期（可复用批量查询结果）。
        approved_dates: case_id → 批准实际日期（可复用批量查询结果）。

    Returns:
        案件佣金明细 dict；终止类案件返回 None。
    """
    status = commission_status(case.stage)
    if status == "excluded":
        return None

    rates = rates or get_commission_rates()
    lender_key = resolve_lender_key(case.lender)
    rate = rates.get(lender_key) if lender_key else None
    loan_amount = case.loan_amount if case.loan_amount is not None else None

    upfront: float | None = None
    trail_annual: float | None = None
    if loan_amount and rate:
        upfront = round(loan_amount * rate["upfront"] / 100, 2)
        trail_annual = round(loan_amount * rate["trail"] / 100, 2)

    # 关键日期：已结算用结算里程碑，已批准用批准里程碑，其余用创建时间
    settled_dates = settled_dates or {}
    approved_dates = approved_dates or {}
    if status == "settled":
        date = settled_dates.get(case.id) or case.closed_at or case.created_at
    elif status == "approved":
        date = approved_dates.get(case.id) or case.created_at
    else:
        date = case.created_at

    return {
        "case_id": case.id,
        "client_name": case.client_name or "",
        "lender": case.lender or "未指定银行",
        "lender_key": lender_key,
        "has_rate": rate is not None,
        "stage": case.stage or "",
        "status": status,
        "loan_amount": loan_amount,
        "upfront": upfront,
        "trail_annual": trail_annual,
        "date": date.isoformat() if date else None,
    }


def _sum_amounts(rows: list[dict[str, Any]]) -> tuple[float, float]:
    """累计首期与年尾随金额（缺失值按 0 计，仅统计有费率的案件）。"""
    upfront = round(sum(r["upfront"] or 0 for r in rows), 2)
    trail = round(sum(r["trail_annual"] or 0 for r in rows), 2)
    return upfront, trail


def get_commission_summary(db: Session, period: str = "all") -> dict[str, Any]:
    """生成佣金汇总（按银行 × 时段，含案件穿透明细）。

    Args:
        db: SQLAlchemy session。
        period: "all" / "week" / "month"。时段过滤仅作用于已结算案件，
            预计与潜在案件始终展示（管道视图）。

    Returns:
        汇总 dict：totals（总览+状态切分）、by_lender（银行聚合）、
        cases（案件明细，供前端按银行/时段穿透）。
    """
    cutoff: datetime | None = None
    if period in _PERIOD_DAYS:
        cutoff = datetime.utcnow() - timedelta(days=_PERIOD_DAYS[period])  # noqa: DTZ003 — 保持 naive UTC 与 DB 列对齐

    rates = get_commission_rates()
    settled_dates = _fetch_milestone_dates(db, "settled")
    approved_dates = _fetch_milestone_dates(db, "approved")

    rows: list[dict[str, Any]] = []
    for case in db.query(Case).all():
        row = calculate_case_commission(
            case,
            rates=rates,
            settled_dates=settled_dates,
            approved_dates=approved_dates,
        )
        if row is None:
            continue
        # 时段过滤：已结算案件按结算日期过滤，其余状态不受影响
        if cutoff is not None and row["status"] == "settled":
            if not row["date"]:
                continue
            try:
                row_date = datetime.fromisoformat(str(row["date"]))
            except ValueError:
                continue
            if row_date < cutoff:
                continue
        rows.append(row)

    rows.sort(key=lambda r: (r["upfront"] or 0), reverse=True)

    settled_rows = [r for r in rows if r["status"] == "settled"]
    approved_rows = [r for r in rows if r["status"] == "approved"]
    potential_rows = [r for r in rows if r["status"] == "potential"]

    def _status_totals(sub: list[dict[str, Any]]) -> dict[str, Any]:
        upfront, trail = _sum_amounts(sub)
        return {"upfront": upfront, "trail_annual": trail, "case_count": len(sub)}

    total_upfront, total_trail = _sum_amounts(rows)

    # 按银行聚合（未匹配到费率键的按原始银行名分组）
    lender_groups: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = r["lender_key"] or r["lender"]
        group = lender_groups.setdefault(
            key,
            {
                "lender": key,
                "lender_key": r["lender_key"],
                "has_rate": r["has_rate"],
                "upfront": 0.0,
                "trail_annual": 0.0,
                "case_count": 0,
                "settled_count": 0,
                "approved_count": 0,
                "potential_count": 0,
            },
        )
        group["upfront"] = round(group["upfront"] + (r["upfront"] or 0), 2)
        group["trail_annual"] = round(group["trail_annual"] + (r["trail_annual"] or 0), 2)
        group["case_count"] += 1
        if r["status"] == "settled":
            group["settled_count"] += 1
        elif r["status"] == "approved":
            group["approved_count"] += 1
        else:
            group["potential_count"] += 1
        group["has_rate"] = group["has_rate"] and r["has_rate"]

    by_lender = sorted(
        lender_groups.values(),
        key=lambda g: g["upfront"],
        reverse=True,
    )

    return {
        "period": period,
        "generated_at": datetime.now(UTC).isoformat(),
        "note": "费率为行业方向性默认值，按实际协议调整；未配置费率的案件不参与金额合计。",
        "totals": {
            "upfront": total_upfront,
            "trail_annual": total_trail,
            "case_count": len(rows),
            "settled": _status_totals(settled_rows),
            "approved": _status_totals(approved_rows),
            "potential": _status_totals(potential_rows),
        },
        "by_lender": by_lender,
        "cases": rows,
    }
