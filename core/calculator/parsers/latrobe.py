"""Latrobe 解析器：Tax Scales / HEM（周平滑块）/ Living Allow / RepayCalculator。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import cell, family_code, open_workbook

FILE = "Latrobe Serviceability Calculator 290626 (Brokerpedia).xlsm"


def _brackets(rows: list[list]) -> list[list]:
    brackets: list[list] = []
    carry = 0.0
    prev_upper = 0.0
    for lower, upper, width, rate in rows:
        upper_v = 1e9 if float(upper) > 1e7 else float(upper)
        brackets.append([upper_v, float(rate), round(carry, 2)])
        carry += float(rate) * (upper_v - prev_upper)
        prev_upper = upper_v
    return brackets


def parse(path: Path) -> dict[str, Any]:
    wb = open_workbook(path)
    tax = wb["Tax Scales"]
    tax_rows = []
    for r in range(5, 10):
        tax_rows.append([cell(tax, f"A{r}"), cell(tax, f"B{r}"),
                         cell(tax, f"C{r}"), cell(tax, f"D{r}")])
    medicare = float(cell(tax, "D13") or 0.02)
    company_tax = float(cell(tax, "D112") or 0.25)

    la = wb["Living Allow"]
    version_date = str(cell(la, "E11") or "29 June 2026")

    rp = wb["RepayCalculator"]
    buffer_ = float(cell(rp, "B6") or 0.02)
    floor_ = float(cell(rp, "B9") or 0.053)
    rental = float(cell(rp, "B44") or 0.8)

    hem = wb["HEM"]
    raw_bands = [hem.cell(row=9, column=c).value for c in range(3, 17)]
    bands = [0.0] + [float(b) for b in raw_bands[1:]]
    families: dict[str, list[float]] = {}
    for r in range(13, 35):
        label = hem.cell(row=r, column=2).value
        if not label:
            continue
        values = [hem.cell(row=r, column=c).value for c in range(3, 17)]
        families[family_code(label)] = values

    wb.close()
    return {
        "name": "Latrobe Financial Services",
        "source_file": FILE,
        "source_version": version_date,
        "source_date": None,
        "effective_from": "2026-06-29",
        "parameters": {
            "assessment": {"buffer": buffer_, "floor": floor_, "extra": 0.0},
            "income_rules": {
                "haircuts": {"overtime": 1.0, "bonus_commission": 1.0,
                             "investment_income": 1.0, "dividends": 1.0,
                             "foreign_income": 1.0, "rental_income": rental,
                             "casual": 1.0, "government_benefits": 1.0,
                             "other_taxable": 1.0, "other_nontaxable": 1.0},
                "company_tax": company_tax,
            },
            "tax": {
                "brackets": _brackets(tax_rows),
                "lito": [], "lmito": [],
                "medicare": medicare,
            },
            "living": {
                "hem_source": "Latrobe HEM (weekly smoothed block)",
                "hem_weekly": True,
                "use_max_declared": True,
                "non_hem_categories": [],
                "hem_table": {"income_bands": bands, "families": families},
            },
            "commitments": {
                "credit_card": {"rate": 0.038, "minimum": 0.0},
                "overdraft": {"rate": 0.03, "minimum": 0.0},
                "commitment_floor": {"rate": 0.045, "term_months": 300,
                                     "residual": 0.2},
                "implied_rate_stress": True,
                "mortgage_default_months": 360,
            },
            "result": {"indicator": "ndi", "max_loan": "pv_invert"},
        },
        "options": {"new_loan_monthly_fee": 15.0, "new_loan_no_buffer": True},
        "notes": ["信用卡 3.8% 取契约参数表（源表无显式单元格）。",
                  "存量贷款反推隐含利率加压（implied_rate_stress）。",
                  "新贷每月 +$15 评估（options.new_loan_monthly_fee）。",
                  "LITO 源表为 'Refer table' 公式，V1 未提取。"],
    }
