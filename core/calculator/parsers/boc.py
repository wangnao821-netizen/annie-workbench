"""BOC (Bank of China) 解析器：Parameters / HEM / Change Log。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import cell, family_code, open_workbook

FILE = "BOC BOCAL Loan Serviceability Calculator V7.1.6 FINAL 300626 (Brokerpedia).xlsm"


def parse(path: Path) -> dict[str, Any]:
    wb = open_workbook(path)
    ws = wb["Parameters"]

    tax_rows = []
    for r in range(2, 7):
        upper = cell(ws, f"F{r}")
        carry = cell(ws, f"G{r}")
        rate = cell(ws, f"H{r}")
        if upper is None:
            continue
        tax_rows.append([float(upper), float(rate or 0.0), float(carry or 0.0)])
    tax_rows[-1][0] = 1e9 if float(tax_rows[-1][0]) > 1_000_000 else float(tax_rows[-1][0])

    mls_tiers = []
    for r in range(2, 5):
        single = cell(ws, f"J{r}")
        couple = cell(ws, f"K{r}")
        rate = cell(ws, f"L{r}")
        if single is None:
            continue
        mls_tiers.append([float(single), float(couple), float(rate)])

    # HEM: A=Location, B=Status, C=Income lower, D=HEM monthly
    hem = wb["HEM"]
    raw: list[tuple[str, float, float]] = []
    for r in range(2, 200):
        loc = hem.cell(row=r, column=1).value
        status = hem.cell(row=r, column=2).value
        income = hem.cell(row=r, column=3).value
        value = hem.cell(row=r, column=4).value
        if loc == "Australia" and status and isinstance(income, (int, float)) \
                and isinstance(value, (int, float)):
            raw.append((str(status), float(income), float(value)))
    incomes = sorted({r[1] for r in raw})
    bands = [0.0] + [i for i in incomes[:-1]]
    families: dict[str, list[float]] = {}
    by_code: dict[str, list[tuple[float, float]]] = {}
    for status, income, value in raw:
        by_code.setdefault(family_code(status), []).append((income, value))
    for code, pairs in by_code.items():
        pairs.sort(key=lambda x: x[0])
        if len(pairs) == len(incomes):
            families[code] = [p[1] for p in pairs]

    version = str(cell(wb["Change Log"], "A27") or "V7.1.6")
    buffer_ = float(cell(ws, "Q2") or 0.03)
    floor_ = float(cell(ws, "R2") or 0.053)
    extra_ = float(cell(ws, "S2") or 0.0)
    overtime = 1 - float(cell(ws, "X2") or 0.2)
    bonus = 1 - float(cell(ws, "Y2") or 0.2)
    invest = 1 - float(cell(ws, "AE2") or 0.2)
    rental = 1 - float(cell(ws, "AA2") or 0.2)
    rental_high_density = 1 - float(cell(ws, "AB2") or 0.3)
    high_risk_postcodes = str(cell(ws, "AC2") or "")
    medicare = float(cell(ws, "I2") or 0.02)
    cc_rate = float(cell(ws, "P2") or 0.038)
    od_rate = float(cell(ws, "O2") or 0.038)
    threshold = float(cell(ws, "N2") or 100)
    rent_single = float(cell(ws, "V2") or 150)
    rent_couple = float(cell(ws, "W2") or 180)

    wb.close()
    return {
        "name": "Bank of China",
        "source_file": FILE,
        "source_version": version,
        "source_date": None,
        "effective_from": "2026-06-30",
        "parameters": {
            "assessment": {"buffer": buffer_, "floor": floor_, "extra": extra_},
            "income_rules": {
                "haircuts": {"overtime": overtime,
                             "bonus_commission": bonus,
                             "investment_income": invest,
                             "dividends": invest,
                             "foreign_income": invest,
                             "rental_income": rental,
                             "casual": 1.0, "government_benefits": 1.0,
                             "other_taxable": 1.0, "other_nontaxable": 1.0},
                "company_tax": 0.30,
            },
            "tax": {
                "brackets": tax_rows,
                "lito": [], "lmito": [],
                "medicare": medicare,
                "mls": {"tiers": mls_tiers, "max_rate": 0.015},
            },
            "living": {
                "hem_source": "BOC HEM (Australia block)",
                "hem_weekly": False,
                "use_max_declared": True,
                "non_hem_categories": [],
                "hem_table": {"income_bands": bands, "families": families},
            },
            "commitments": {
                "credit_card": {"rate": cc_rate, "minimum": 0.0},
                "overdraft": {"rate": od_rate, "minimum": 0.0},
                "commitment_floor": {"rate": 0.045, "term_months": 300,
                                     "residual": 0.2},
            },
            "result": {"indicator": "nis", "threshold": threshold,
                       "max_loan": "pv_invert"},
        },
        "options": {
            "notional_rent": {"single": rent_single,
                              "couple": rent_couple,
                              "weekly": True},
            "high_density": {"postcodes": high_risk_postcodes,
                             "rental_haircut": rental_high_density},
        },
        "notes": ["HEM 仅提取 Australia 国表块（州分表 V1 不支持）。",
                  "公司税 30% 与信用卡 3.8% 取契约参数表（源表无显式单元格）。",
                  "租金 haircut=AA2(80%)；高密度区 AB2(70%) 存入 options.high_density，V1 引擎未接线。",
                  "投资收入/海外收入 20% 取契约参数表（源表无独立单元格）；股息用 AE2。"],
    }
