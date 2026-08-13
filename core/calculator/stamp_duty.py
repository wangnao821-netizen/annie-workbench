"""WO-21 印花税：8 州递进税率（stamp_duty.yaml，OpenClaw v1.1.0 indicative）。

纯配置驱动：transfer/mortgage 为 [[upper, rate, carry]] 递进档；另加固定费用。
"""

from __future__ import annotations

from typing import Any

_VALID_STATES = {"NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"}


def _progressive(price: float, tiers: list) -> float:
    if not tiers:
        return 0.0
    prev_upper = 0.0
    for upper, rate, carry in tiers:
        if price <= float(upper):
            return round(float(carry) + float(rate) * (price - prev_upper), 2)
        prev_upper = float(upper)
    upper, rate, carry = tiers[-1]
    return round(float(carry) + float(rate) * (price - prev_upper), 2)


def stamp_duty(state: str, price: float, stamp_cfg: dict[str, Any],
               steps: list | None = None) -> dict[str, float]:
    """返回 {transfer, mortgage, fees, total}。state 不支持时抛 ValueError。"""
    if state not in _VALID_STATES:
        raise ValueError(f"unsupported state: {state}")
    state_cfg = stamp_cfg.get("states", {}).get(state, {})
    transfer = _progressive(price, state_cfg.get("transfer", []))
    mortgage = _progressive(price, state_cfg.get("mortgage", []))
    fees = round(float(state_cfg.get("transfer_fee", 0.0))
                 + float(state_cfg.get("registration", 0.0))
                 + float(state_cfg.get("mortgage_fee", 0.0)), 2)
    total = round(transfer + mortgage + fees, 2)
    if steps is not None:
        steps.append({
            "step_id": "stamp_duty", "label": "Stamp duty",
            "formula": f"transfer {transfer} + mortgage {mortgage} + fees {fees}",
            "inputs": {"state": state, "price": price}, "output": total,
        })
    return {"transfer": transfer, "mortgage": mortgage, "fees": fees, "total": total}


def lmi_premium(insurer: str, loan: float, lvr: float,
                lmi_cfg: dict[str, Any]) -> float:
    """LMI 保费（lmi_fallback.yaml indicative；无配置返回 0）。"""
    insurer_cfg = lmi_cfg.get("insurers", {}).get(insurer.lower())
    if not insurer_cfg:
        return 0.0
    for max_lvr, rate in insurer_cfg.get("rates", []):
        if lvr <= float(max_lvr):
            return round(loan * float(rate), 2)
    return round(loan * float(insurer_cfg.get("max_rate", 0.0)), 2)
