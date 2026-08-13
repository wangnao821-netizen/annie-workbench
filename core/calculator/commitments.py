"""WO-21 存量负债评估：信用卡/透支 %limit、个人/租赁/HP 固定 floor、房贷加压。

latrobe 特例：从 declared_monthly 反推隐含利率，再按 max(floor, r+buffer) 加压
（契约 §三：存量贷款反推隐含利率加压）。
"""

from __future__ import annotations

_MORTGAGE_TYPES = {"mortgage_oo", "mortgage_inv"}
_FLOOR_TYPES = {"personal", "line_of_credit", "hire_purchase", "lease", "other"}
_BY_LIMIT_TYPES = {"credit_card", "overdraft"}


def pmt(monthly_rate: float, n: int, pv: float, fv: float = 0.0) -> float:
    if n <= 0:
        return 0.0
    if monthly_rate <= 0:
        return (pv + fv) / n
    factor = (1 + monthly_rate) ** -n
    return (pv - fv * factor) * monthly_rate / (1 - factor)


def _implied_annual_rate(balance: float, remaining_months: int,
                         declared_monthly: float) -> float | None:
    """反推满足 pmt(r, n, balance)=declared 的年利率（二分法）。"""
    if balance <= 0 or remaining_months <= 0 or declared_monthly <= 0:
        return None
    if declared_monthly >= balance / remaining_months * 4:
        return 0.30
    lo, hi = 0.0, 0.30
    for _ in range(60):
        mid = (lo + hi) / 2
        if pmt(mid / 12, remaining_months, balance) < declared_monthly:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def assess_mortgage(commitment: dict, assessment: dict, commitments_cfg: dict,
                    steps: list | None = None) -> float:
    buffer = float(assessment.get("buffer", 0.0))
    floor = float(assessment.get("floor", 0.0))
    balance = float(commitment.get("balance", 0.0))
    remaining = int(commitment.get("remaining_months", 0) or 0)
    declared = float(commitment.get("declared_monthly", 0.0) or 0.0)
    rate = float(commitment.get("rate", 0.0) or 0.0)
    ctype = commitment.get("type", "mortgage_oo")

    if commitments_cfg.get("implied_rate_stress"):
        implied = _implied_annual_rate(balance, remaining, declared)
        assess_rate = floor if implied is None else max(floor, implied + buffer)
        formula = f"max(floor {floor}, r_implied {implied or '-'} + buffer {buffer})"
    else:
        assess_rate = max(floor, rate + buffer)
        formula = f"max(floor {floor}, rate {rate} + buffer {buffer})"

    if remaining <= 0:
        remaining = int(commitments_cfg.get("mortgage_default_months", 360))
    monthly = pmt(assess_rate / 12, remaining, balance)
    monthly = max(monthly, declared)
    monthly = round(monthly, 2)
    if steps is not None:
        steps.append({
            "step_id": f"comm:{ctype}", "label": f"Commitment {ctype}",
            "formula": formula,
            "inputs": {"balance": balance, "remaining_months": remaining,
                       "declared_monthly": declared, "assess_rate": assess_rate},
            "output": monthly,
        })
    return monthly


def assess_by_limit(commitment: dict, commitments_cfg: dict,
                    steps: list | None = None) -> float:
    """credit_card / overdraft：每月 max(minimum, rate × limit)。"""
    ctype = commitment.get("type", "credit_card")
    cfg = commitments_cfg.get(ctype, {})
    rate = float(cfg.get("rate", 0.038))
    if cfg.get("annual"):
        rate = rate / 12
    minimum = float(cfg.get("minimum", 0.0))
    limit = float(commitment.get("limit", 0.0) or commitment.get("balance", 0.0))
    monthly = round(max(minimum, rate * limit), 2)
    if steps is not None:
        steps.append({
            "step_id": f"comm:{ctype}", "label": f"Commitment {ctype}",
            "formula": f"max({minimum}, {rate} * {limit})",
            "inputs": {"limit": limit, "rate": rate, "minimum": minimum},
            "output": monthly,
        })
    return monthly


def assess_floor(commitment: dict, commitments_cfg: dict,
                 steps: list | None = None) -> float:
    """personal/hp/lease/other：pmt(floor, term, balance[, residual])。"""
    ctype = commitment.get("type", "personal")
    cfg = commitments_cfg.get("commitment_floor", {})
    floor_rate = float(cfg.get("rate", 0.045))
    term = int(cfg.get("term_months", 300))
    residual = float(cfg.get("residual", 0.0))
    balance = float(commitment.get("balance", 0.0))
    remaining = int(commitment.get("remaining_months", 0) or 0)
    declared = float(commitment.get("declared_monthly", 0.0) or 0.0)
    n = remaining if remaining > 0 else term
    if ctype in ("hire_purchase", "lease"):
        fv = balance * residual
    else:
        fv = 0.0
    monthly = round(pmt(floor_rate / 12, n, balance, fv), 2)
    monthly = max(monthly, declared)
    if steps is not None:
        steps.append({
            "step_id": f"comm:{ctype}", "label": f"Commitment {ctype}",
            "formula": f"pmt({floor_rate}/12, {n}, {balance}, fv {fv})",
            "inputs": {"balance": balance, "remaining_months": n,
                       "declared_monthly": declared},
            "output": monthly,
        })
    return monthly


def assess_bnpl(commitment: dict, commitments_cfg: dict,
                steps: list | None = None) -> float:
    declared = float(commitment.get("declared_monthly", 0.0) or 0.0)
    if declared <= 0:
        balance = float(commitment.get("balance", 0.0) or 0.0)
        months = int(commitment.get("remaining_months", 0) or 12)
        declared = balance / max(months, 1)
    declared = round(declared, 2)
    if steps is not None:
        steps.append({
            "step_id": "comm:bnpl", "label": "Commitment bnpl",
            "formula": "declared_monthly or balance/months",
            "inputs": {"balance": commitment.get("balance", 0.0)},
            "output": declared,
        })
    return declared


def assess_commitment(commitment: dict, assessment: dict, commitments_cfg: dict,
                      steps: list | None = None) -> float:
    ctype = commitment.get("type", "other")
    if ctype in _MORTGAGE_TYPES:
        return assess_mortgage(commitment, assessment, commitments_cfg, steps)
    if ctype in _BY_LIMIT_TYPES:
        return assess_by_limit(commitment, commitments_cfg, steps)
    if ctype in _FLOOR_TYPES:
        return assess_floor(commitment, commitments_cfg, steps)
    return assess_bnpl(commitment, commitments_cfg, steps)


def total_commitments(commitments: list[dict], assessment: dict,
                      commitments_cfg: dict, steps: list | None = None) -> float:
    total = 0.0
    for i, commitment in enumerate(commitments):
        monthly = assess_commitment(commitment, assessment, commitments_cfg, steps)
        total += monthly
    total = round(total, 2)
    if steps is not None and commitments:
        steps.append({
            "step_id": "comm:total", "label": "Total Commitments",
            "formula": f"sum({len(commitments)} assessed)",
            "inputs": {"count": len(commitments)},
            "output": total,
        })
    return total
