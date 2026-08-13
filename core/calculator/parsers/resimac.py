"""Resimac 解析器：Calculator 版本 / Tables（floor、NSR、税）/ HEM Table。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import cell, family_code, open_workbook

FILE = "resimacserviceabilitycalculator.xlsm"


def _brackets(rows: list[list]) -> list[list]:
    # rows = [boundary, tax_due_incl_medicare, excess_incl_medicare]
    brackets: list[list] = []
    for i, (boundary, tax_due, excess) in enumerate(rows):
        upper = 1e9 if i == len(rows) - 1 else float(rows[i + 1][0])
        rate = round(float(excess) - 0.02, 4)
        carry = round(float(tax_due) - 0.02 * float(boundary), 2)
        brackets.append([upper, rate, carry])
    return brackets


def parse(path: Path) -> dict[str, Any]:
    wb = open_workbook(path)
    calc = wb["Calculator"]
    version = str(cell(calc, "A5") or "Version 7.03 (01/07/2026)")

    t = wb["Tables"]
    floor_ = float(cell(t, "G50") or 0.0575)
    buffer_ = float(cell(t, "H50") or 0.02)
    cc_rate = float(cell(t, "C55") or 0.038)
    supp_multiplier = float(cell(t, "L54") or 0.8)
    nsr = {str(cell(t, f"K{r}")).lower(): float(cell(t, f"L{r}"))
           for r in range(49, 52) if cell(t, f"K{r}")}

    tax_rows = []
    for r in range(60, 65):
        tax_rows.append([cell(t, f"B{r}"), cell(t, f"C{r}"), cell(t, f"D{r}")])

    hem = wb["HEM Table"]
    raw_bands = [hem.cell(row=2, column=c).value for c in range(2, 16)]
    deduped = list(dict.fromkeys(float(b) for b in raw_bands))
    bands = [0.0] + deduped
    families: dict[str, list[float]] = {}
    for r in list(range(6, 10)) + list(range(11, 15)):
        label = hem.cell(row=r, column=1).value
        if not label:
            continue
        values = [hem.cell(row=r, column=c).value for c in range(2, 16)]
        families[family_code(label)] = values

    wb.close()
    return {
        "name": "Resimac",
        "source_file": FILE,
        "source_version": version,
        "source_date": None,
        "effective_from": "2026-07-01",
        "parameters": {
            "assessment": {"buffer": buffer_, "floor": floor_, "extra": 0.0},
            "income_rules": {
                "haircuts": {"overtime": 1.0,
                             "bonus_commission": supp_multiplier,
                             "investment_income": supp_multiplier,
                             "dividends": 1.0, "foreign_income": 1.0,
                             "rental_income": 0.9,
                             "casual": 1.0, "government_benefits": 1.0,
                             "other_taxable": 1.0, "other_nontaxable": 1.0},
                "casual_annualize_weeks": 46,
                "company_tax": 0.30,
            },
            "tax": {
                "brackets": _brackets(tax_rows),
                "lito": [], "lmito": [],
                "medicare": 0.02,
            },
            "living": {
                "hem_source": "Resimac HEM Table (2026Q1, weekly)",
                "hem_weekly": True,
                "use_max_declared": True,
                "non_hem_categories": [],
                "hem_table": {"income_bands": bands, "families": families},
            },
            "commitments": {
                "credit_card": {"rate": cc_rate, "minimum": 0.0},
                "overdraft": {"rate": 0.03, "minimum": 0.0},
                "commitment_floor": {"rate": 0.045, "term_months": 300,
                                     "residual": 0.2},
            },
            "result": {"indicator": "nsr", "nsr_by_insurer": nsr,
                       "min_surplus": 200, "no_result_lvr": 1.0,
                       "max_loan": None},
        },
        "options": {
            "simple_refinance": {"mode": "override", "value": 0.01},
            "net_income_factor": 0.985,
            "deemed_investment_rate": 0.06,
            "specialist_haircuts": {"bonus_commission": 1.0,
                                    "investment_income": 1.0},
        },
        "notes": ["税表含 Medicare（Excess % 扣 2%、Tax Due 扣 0.02×boundary）。",
                  "HEM 取 HEM Table 2026Q1 Australia 块（周值，14 收入档）。",
                  "子女人数 >3 按 Extrapolate Income Bands 外推。",
                  "LVR>100% 返回 NO RESULT；max_loan V1 不计算（null）。",
                  "casual 按 46/52 周年化（Supplementary Income 说明）。",
                  "specialist 补充收入按 100%（options.specialist_haircuts）。"],
    }
