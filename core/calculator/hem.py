"""WO-21 HEM 查询：income_bands 档位查表 + 周/月换算 + 超表外推。

超表外推两种语义（契约 §三）：
- CBA：families 中 *_add（S_add/C_add/C_adult）为每增一人固定增量。
- latrobe/resimac：按同一收入档末两档家庭差值线性外推。
"""

from __future__ import annotations

from typing import Any


def hem_lookup(status: str, dependents: int, income: float,
               living: dict[str, Any], steps: list | None = None,
               prefix: str = "hem") -> float:
    hem = living.get("hem_table", living)
    bands = [float(b) for b in hem["income_bands"]]
    families: dict[str, list[float]] = {
        k: [float(v) for v in vs] for k, vs in hem["families"].items()
    }
    weekly = bool(living.get("hem_weekly", False))

    band = 0
    for i, lower in enumerate(bands):
        if income >= lower:
            band = i
        else:
            break

    prefix_char = "C" if status == "Couple" else "S"
    code = f"{prefix_char}{dependents}"

    if code in families:
        value = families[code][band]
        formula = f"HEM[{code}][band {band}]"
    else:
        max_code, min_code = _bracket_codes(families, prefix_char)
        value, formula = _extrapolate(families, prefix_char, dependents, band,
                                      max_code, min_code)

    if weekly:
        value = value * 52 / 12
    value = round(value, 2)
    if steps is not None:
        steps.append({
            "step_id": f"{prefix}:hem_lookup", "label": "HEM Living Expenses",
            "formula": formula + (" *52/12" if weekly else ""),
            "inputs": {"status": status, "dependents": dependents,
                       "income": income, "band": band, "weekly": weekly},
            "output": value,
        })
    return value


def _bracket_codes(families: dict[str, list[float]], prefix: str):
    numeric = [int(k[1:]) for k in families if k.startswith(prefix) and k[1:].isdigit()]
    if not numeric:
        return f"{prefix}0", f"{prefix}0"
    return f"{prefix}{max(numeric)}", f"{prefix}{min(numeric)}"


def _extrapolate(families, prefix, dependents, band, max_code, min_code):
    add = families.get(f"{prefix}_add")
    if add is not None:
        base = families[max_code][band]
        value = base + (dependents - int(max_code[1:])) * add[band]
        return value, f"HEM[{max_code}]+({dependents}-{int(max_code[1:])})*{add[band]}"
    last = families[max_code][band]
    dmax = int(max_code[1:])
    if dmax > 0:
        prev = families[f"{prefix}{dmax - 1}"][band]
        delta = last - prev
        value = last + (dependents - dmax) * delta
        return value, f"HEM[{max_code}]+({dependents}-{dmax})*{delta}"
    return last, f"HEM[{max_code}]"
