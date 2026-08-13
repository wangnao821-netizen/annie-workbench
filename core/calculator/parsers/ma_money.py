"""MA Money 解析器：Setup（命名单元格）/ Hidden.Calcs（税）/ HEM（NSW 块）。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import cell, family_code, open_workbook

FILE = "MA_Money_Serviceability_Calculator 060726 (Brokerpedia).xlsm"


def _tax_rows(ws, r0: int, n: int, cols: tuple[int, int, int, int]) -> list[list]:
    rows = []
    for i in range(n):
        lower = ws.cell(row=r0 + i, column=cols[0]).value
        upper = ws.cell(row=r0 + i, column=cols[1]).value
        fixed = ws.cell(row=r0 + i, column=cols[2]).value
        var = ws.cell(row=r0 + i, column=cols[3]).value
        if upper is None:
            continue
        rows.append([lower, upper, fixed, var])
    return rows


def _brackets(rows: list[list]) -> list[list]:
    brackets = [[float(r[1]), float(r[3]), float(r[2])] for r in rows]
    brackets[-1][0] = 1e9
    return brackets


def parse(path: Path) -> dict[str, Any]:
    wb = open_workbook(path)
    setup = wb["Setup"]
    hidden = wb["Hidden.Calcs"]

    version_num = cell(setup, "I22")
    version_date = cell(setup, "I23")
    buffer_ = float(cell(setup, "I39") or 0.0201)
    floor_ = float(cell(setup, "I41") or 0.0575)
    cc_rate = float(cell(setup, "I43") or 0.038)
    ofi_buffer = float(cell(setup, "I45") or 0.9)
    repay_switch = float(cell(setup, "I54") or 0.0)
    mortgage_stress = float(cell(setup, "I44") or 0.25)
    company_tax = float(cell(hidden, "D55") or 0.25)

    tax_rows = _tax_rows(hidden, 22, 5, (3, 4, 5, 6))  # C..F
    c30 = hidden.cell(30, 3).value
    c31 = hidden.cell(31, 3).value
    g30 = hidden.cell(30, 7).value
    med = {"threshold_a": float(c30), "threshold_b": float(c31),
           "phase_rate": float(g30)} if all(v is not None for v in (c30, c31, g30)) \
        else None
    lito_rows = _tax_rows(hidden, 47, 4, (3, 4, 5, 6))  # C..F

    hem = wb["HEM"]
    bands = [float(hem.cell(row=20, column=c).value) for c in range(5, 19)]
    families: dict[str, list[float]] = {}
    for r in range(23, 31):
        state = hem.cell(row=r, column=3).value
        label = hem.cell(row=r, column=4).value
        if state != "NSW" or not label:
            continue
        code = family_code(label)
        values = [hem.cell(row=r, column=c).value for c in range(5, 19)]
        if len(values) == len(bands):
            families[code] = values

    wb.close()
    return {
        "name": "MA Money",
        "source_file": FILE,
        "source_version": str(version_num or "5.2"),
        "source_date": version_date,
        "effective_from": str(version_date or "2026-07-06")[:10],
        "parameters": {
            "assessment": {"buffer": buffer_, "floor": floor_, "extra": 0.0},
            "income_rules": {
                "haircuts": {"overtime": 0.8, "bonus_commission": 0.8,
                             "investment_income": 0.8, "dividends": 0.8,
                             "foreign_income": 0.8, "rental_income": 0.9,
                             "casual": 1.0, "government_benefits": 1.0,
                             "other_taxable": 1.0, "other_nontaxable": 1.0},
                "casual_annualize_weeks": 48,
                "company_tax": company_tax,
            },
            "tax": {
                "brackets": _brackets(tax_rows),
                "lito": [[float(r[1]), float(r[2]), float(r[3]) * -1]
                         for r in lito_rows if r[2]],
                "lmito": [],
                "medicare": 0.02,
                "medicare_low": med,
            },
            "living": {
                "hem_source": "MA Money HEM (NSW block, weekly)",
                "hem_weekly": True,
                "use_max_declared": True,
                "non_hem_categories": [],
                "hem_table": {"income_bands": bands, "families": families},
            },
            "commitments": {
                "credit_card": {"rate": cc_rate, "minimum": 0.0},
                "overdraft": {"rate": 0.038, "minimum": 0.0},
                "commitment_floor": {"rate": 0.045, "term_months": 300,
                                     "residual": 0.2},
            },
            "result": {"indicator": "dscr", "dscr_by_lvr": [[0.85, 1.0],
                                                            [1.0, 1.1]],
                       "max_loan": "pv_invert"},
        },
        "options": {"ofi_buffer": ofi_buffer, "mortgage_stress_1_25": mortgage_stress,
                    "repay_switch": bool(repay_switch)},
        "notes": ["HEM 仅提取 NSW 块（州分表 V1 不支持）；周值 ×52/12。",
                  "casual 按 48/52 周年化（Setup Weeks 52 + 契约参数表）。",
                  "DSCR 阶梯取契约参数表（源表仅 Min.DSCR=1）。",
                  "存量负债 ×1.25 加压（Mortgage.Stressed）由 Repay.Switch 关闭，V1 默认不启用。",
                  "LITO taper 以负数存储于源表，解析时转为正数。"],
    }
