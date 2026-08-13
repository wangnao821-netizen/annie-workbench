"""WO-21 结果判定：bank 特定指标（nis/surplus_sign/nsr/dscr/ndi）。"""

from __future__ import annotations

from typing import Any


def evaluate(result_cfg: dict, surplus: float, extra: dict[str, Any],
             steps: list | None = None) -> tuple[str, str, float | None, list[str]]:
    """返回 (verdict, indicator, indicator_value, warnings)。"""
    indicator = result_cfg.get("indicator", "max_loan_only")
    warnings: list[str] = []
    verdict = "APPROVE"
    value: float | None = None

    if indicator == "nis":
        threshold = float(result_cfg.get("threshold", 100))
        value = round(surplus, 2)
        verdict = "APPROVE" if surplus >= threshold else "REFER"

    elif indicator == "surplus_sign":
        value = round(surplus, 2)
        if surplus < 0 or result_cfg.get("refer_without_buffer") and \
                extra.get("surplus_without_buffer", surplus) < 0:
            verdict = "REFER"

    elif indicator == "nsr":
        burden = float(extra.get("total_burden", 0.0))
        ratio = surplus / burden if burden > 0 else 0.0
        value = round(ratio, 4)
        required = _nsr_required(result_cfg, extra)
        if extra.get("lvr") and result_cfg.get("nsr_lvr90") and \
                extra["lvr"] > 0.90:
            required = max(required, float(result_cfg["nsr_lvr90"]))
        min_surplus = float(result_cfg.get("min_surplus", 0.0))
        if ratio < required or surplus < min_surplus:
            verdict = "REFER"
            warnings.append(
                f"NSR {value:.4f} < required {required} or surplus < ${min_surplus:,.0f}")

    elif indicator == "dscr":
        burden = float(extra.get("total_burden", 0.0))
        income = float(extra.get("net_income_monthly", 0.0))
        ratio = income / burden if burden > 0 else 0.0
        value = round(ratio, 4)
        required = _dscr_required(result_cfg, extra)
        if ratio < required:
            verdict = "REFER"

    elif indicator == "ndi":
        value = round(surplus, 2)
        if surplus <= 0:
            verdict = "REFER"

    if steps is not None:
        steps.append({
            "step_id": "result:indicator", "label": f"Indicator {indicator}",
            "formula": f"{indicator}(surplus={surplus}, extra={extra})",
            "inputs": {"surplus": surplus, "extra": extra,
                       "required": required if indicator in ("nsr", "dscr") else None},
            "output": verdict,
        })
    return verdict, indicator, value, warnings


def _nsr_required(result_cfg: dict, extra: dict[str, Any]) -> float:
    by_insurer = result_cfg.get("nsr_by_insurer")
    if by_insurer:
        insurer = str(extra.get("mortgage_insurer", "")).lower()
        if insurer in by_insurer:
            return float(by_insurer[insurer])
    return float(result_cfg.get("nsr_required", 1.0))


def _dscr_required(result_cfg: dict, extra: dict[str, Any]) -> float:
    by_lvr = result_cfg.get("dscr_by_lvr")
    if by_lvr:
        lvr = float(extra.get("lvr", 0.0))
        req = 1.0
        for max_lvr, min_dscr in by_lvr:
            if lvr <= float(max_lvr):
                req = float(min_dscr)
        return req
    return float(result_cfg.get("dscr_required", 1.0))
