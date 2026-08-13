"""WO-21 税费计算：递进所得税 + LITO/LMITO + Medicare（含低收入阶梯）+ MLS。

语义对齐源表：CBA/MA Money 的 medicare_low 为 ATO 渐进公式
（threshold_a 以下免、threshold_a..threshold_b 按 phase_rate 渐进、以上全额）。
offset = min(income_tax, LITO + LMITO)（CBA Calculations B15/B16）。
"""

from __future__ import annotations

from typing import Any


def income_tax(taxable: float, tax: dict[str, Any],
               steps: list | None = None, prefix: str = "tax") -> float:
    """递进所得税：brackets=[[upper, rate, carry]]；carry 为该档门槛的累计税。"""
    brackets = tax["brackets"]
    if taxable <= 0:
        return 0.0
    prev_upper = 0.0
    for upper, rate, carry in brackets:
        if taxable <= float(upper):
            value = round(float(carry) + float(rate) * (taxable - prev_upper), 2)
            if steps is not None:
                steps.append({
                    "step_id": f"{prefix}:income_tax", "label": "Income Tax (递进所得税)",
                    "formula": f"{carry} + {rate} * ({taxable} - {prev_upper})",
                    "inputs": {"taxable": taxable, "bracket": [upper, rate, carry]},
                    "output": value,
                })
            return max(0.0, value)
        prev_upper = float(upper)
    upper, rate, carry = brackets[-1]
    value = round(float(carry) + float(rate) * (taxable - prev_upper), 2)
    if steps is not None:
        steps.append({
            "step_id": f"{prefix}:income_tax", "label": "Income Tax",
            "formula": f"{carry} + {rate} * ({taxable} - {prev_upper})",
            "inputs": {"taxable": taxable, "bracket": [upper, rate, carry]},
            "output": value,
        })
    return max(0.0, value)


def medicare_levy(taxable: float, tax: dict[str, Any],
                  steps: list | None = None, prefix: str = "tax") -> float:
    """Medicare 2% + 低收入渐进减免。"""
    rate = float(tax.get("medicare", 0.02))
    full = taxable * rate
    low = tax.get("medicare_low")
    if low and taxable > 0:
        ta = float(low["threshold_a"])
        tb = float(low["threshold_b"])
        pr = float(low.get("phase_rate", 0.1))
        if taxable <= ta:
            full = 0.0
        elif taxable <= tb:
            full = pr * (taxable - ta)
    value = round(full, 2)
    if steps is not None:
        steps.append({
            "step_id": f"{prefix}:medicare", "label": "Medicare Levy",
            "formula": f"{rate} * {taxable}", "inputs": {"taxable": taxable,
                                                         "medicare_low": low},
            "output": value,
        })
    return value


def _offset_from_table(taxable: float, tax_amount: float, table_name: str,
                       tax: dict[str, Any], steps: list | None, prefix: str) -> float:
    """LITO/LMITO：逐档取 income<=upper，offset - (income-prev_upper)*taper，下限 0。"""
    table = tax.get(table_name) or []
    if not table or taxable <= 0:
        return 0.0
    prev_upper = 0.0
    for upper, offset, taper in table:
        if taxable <= float(upper):
            value = round(float(offset) - (taxable - prev_upper) * float(taper), 2)
            value = max(0.0, min(value, tax_amount))
            if steps is not None:
                steps.append({
                    "step_id": f"{prefix}:{table_name}",
                    "label": table_name.upper(),
                    "formula": f"offset {offset} - ({taxable}-{prev_upper})*{taper}",
                    "inputs": {"taxable": taxable, "tier": [upper, offset, taper]},
                    "output": value,
                })
            return value
        prev_upper = float(upper)
    return 0.0


def lito(taxable: float, tax_amount: float, tax: dict[str, Any],
         steps: list | None = None, prefix: str = "tax") -> float:
    return _offset_from_table(taxable, tax_amount, "lito", tax, steps, prefix)


def lmito(taxable: float, tax_amount: float, tax: dict[str, Any],
          steps: list | None = None, prefix: str = "tax") -> float:
    return _offset_from_table(taxable, tax_amount, "lmito", tax, steps, prefix)


def mls(taxable: float, status: str, tax: dict[str, Any],
        steps: list | None = None, prefix: str = "tax") -> float:
    """Medicare Levy Surcharge（仅 BOC 使用）。tiers=[[single, couple, rate]]。"""
    mls_cfg = tax.get("mls")
    if not mls_cfg or taxable <= 0:
        return 0.0
    idx = 0 if status == "Single" else 1
    rate = float(mls_cfg.get("max_rate", 0.015))
    for tier in mls_cfg["tiers"]:
        if taxable <= float(tier[idx]):
            rate = float(tier[2])
            break
    value = round(taxable * rate, 2)
    if steps is not None:
        steps.append({
            "step_id": f"{prefix}:mls", "label": "Medicare Levy Surcharge",
            "formula": f"{taxable} * {rate}", "inputs": {"taxable": taxable,
                                                         "status": status},
            "output": value,
        })
    return value


def net_tax(taxable: float, status: str, tax: dict[str, Any],
            steps: list | None = None, prefix: str = "tax") -> float:
    """净税费 = income_tax + medicare - min(tax, LITO+LMITO) + MLS。"""
    itax = income_tax(taxable, tax, steps, prefix)
    mlevy = medicare_levy(taxable, tax, steps, prefix)
    lito_v = lito(taxable, itax, tax, steps, prefix)
    lmito_v = lmito(taxable, itax, tax, steps, prefix)
    offset = min(itax, lito_v + lmito_v)
    surcharge = mls(taxable, status, tax, steps, prefix)
    total = round(itax + mlevy - offset + surcharge, 2)
    if steps is not None:
        steps.append({
            "step_id": f"{prefix}:net", "label": "Net Tax",
            "formula": f"{itax}+{mlevy}-min({itax},{lito_v}+{lmito_v})+{surcharge}",
            "inputs": {"income_tax": itax, "medicare": mlevy, "lito": lito_v,
                       "lmito": lmito_v, "mls": surcharge},
            "output": total,
        })
    return total


def net_income(taxable: float, gross_nontaxable: float, status: str,
               tax: dict[str, Any], steps: list | None = None,
               prefix: str = "tax") -> float:
    """税后净收入 = 非应税收入 + 应税收入 - 净税费。"""
    total = net_tax(taxable, status, tax, steps, prefix)
    value = round(gross_nontaxable + taxable - total, 2)
    if steps is not None:
        steps.append({
            "step_id": f"{prefix}:net_income", "label": "Net Income",
            "formula": f"{gross_nontaxable}+{taxable}-{total}",
            "inputs": {"taxable": taxable, "gross_nontaxable": gross_nontaxable,
                       "net_tax": total},
            "output": value,
        })
    return value
