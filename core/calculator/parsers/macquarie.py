"""Macquarie 解析器：References / Serviceability Worksheet / HEM Table。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import cell, open_workbook

FILE = "macquarie bank mortgage solutions serviceability calculator 170726 (Brokerpedia).xlsm"


def _brackets(rows: list[list]) -> list[list]:
    # rows = [lower, upper, rate]
    bands: list[list] = []
    for i, (lo, up, rate) in enumerate(rows):
        upper = 1e9 if i == len(rows) - 1 else float(up)
        bands.append([upper, float(rate), 0.0])
    carry = 0.0
    prev_upper = 0.0
    for b in bands:
        b[2] = round(carry, 2)
        carry += b[1] * (b[0] - prev_upper)
        prev_upper = b[0]
    return bands


def parse(path: Path) -> dict[str, Any]:
    wb = open_workbook(path)
    refs = wb["References"]

    tax_rows = []
    for r in range(15, 20):
        tax_rows.append([cell(refs, f"B{r}"), cell(refs, f"C{r}"),
                         cell(refs, f"D{r}")])

    hem = wb["HEM Table"]
    bands = [float(hem.cell(row=7, column=c).value) for c in range(3, 21)]
    families: dict[str, list[float]] = {}
    for r in range(8, 40):
        code = hem.cell(row=r, column=2).value
        if not code or str(code).strip() == "":
            continue
        code = str(code).strip()
        if not (len(code) >= 2 and code[0] in "CS" and code[1:].isdigit()):
            continue
        families[code] = [hem.cell(row=r, column=c).value for c in range(3, 21)]

    ws = wb["Serviceability Worksheet"]
    version = str(cell(ws, "I4") or "")
    buffer_ = float(cell(refs, "H10") or 0.03)
    floor_ = float(cell(refs, "H9") or 0.053)
    extra_ = float(cell(refs, "H11") or 0.0225)

    wb.close()
    return {
        "name": "Macquarie Bank",
        "source_file": FILE,
        "source_version": version,
        "source_date": None,
        "effective_from": "2026-07-17",
        "parameters": {
            "assessment": {"buffer": buffer_, "floor": floor_, "extra": extra_},
            "income_rules": {
                "haircuts": {"overtime": 0.8, "bonus_commission": 0.8,
                             "investment_income": 0.8, "dividends": 0.8,
                             "foreign_income": 0.8, "rental_income": 0.8,
                             "casual": 1.0, "government_benefits": 1.0,
                             "other_taxable": 1.0, "other_nontaxable": 1.0},
                "company_tax": 0.30,
            },
            "tax": {
                "brackets": _brackets(tax_rows),
                "lito": [], "lmito": [],
                "medicare": 0.02,
            },
            "living": {
                "hem_source": "Macquarie HEM Table (weekly)",
                "hem_weekly": True,
                "use_max_declared": True,
                "non_hem_categories": [],
                "hem_table": {"income_bands": bands, "families": families},
            },
            "commitments": {
                "credit_card": {"rate": 0.038, "minimum": 0.0},
                "overdraft": {"rate": 0.456, "annual": True, "minimum": 0.0},
                "commitment_floor": {"rate": 0.045, "term_months": 300,
                                     "residual": 0.2},
            },
            "result": {"indicator": "nsr", "nsr_required": 1.0,
                       "nsr_lvr90": 1.20, "min_surplus": 500,
                       "lvr_cap": 0.95, "max_loan": "pv_invert"},
        },
        "options": {},
        "notes": ["NSR 语义：surplus/total_burden；LVR>90% 需 1.20（契约参数表）。",
                  "信用卡 45.6% p.a.（=3.8%/月）、透支同率；DTI>8 出政策（V1 警告）。",
                  "评估期 294 月 / max LVR 95%（契约参数表），V1 未启用期限。"],
    }
