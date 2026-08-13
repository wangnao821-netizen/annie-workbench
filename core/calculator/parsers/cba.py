"""CBA (Commonwealth Bank) 解析器：MasterData / Data / HEM 表。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import cell, family_code, open_workbook

FILE = "cba hl calculator 270626 (Brokerpedia).xlsm"


def _brackets(rows: list[list]) -> list[list]:
    # rows = [upper, rate, carry]；bracket[i] = [next_upper, rate_i, carry_i]
    brackets: list[list] = []
    for i in range(len(rows) - 1):
        brackets.append([float(rows[i + 1][0]), float(rows[i][1]),
                         float(rows[i][2])])
    brackets.append([1e9, float(rows[-1][1]), float(rows[-1][2])])
    return brackets


def parse(path: Path) -> dict[str, Any]:
    wb = open_workbook(path)
    ws = wb["MasterData"]

    tax_rows = []
    for r in range(3, 8):
        tax_rows.append([cell(ws, f"A{r}"), cell(ws, f"B{r}"), cell(ws, f"C{r}")])

    lito_rows = []
    for r in range(38, 41):
        lito_rows.append([cell(ws, f"A{r}"), cell(ws, f"B{r}"), cell(ws, f"C{r}")])

    # HEM: Q23:AC43，labels 行 22（S..AC 列）
    bands = []
    for r in range(23, 38):
        bands.append(cell(ws, f"Q{r}"))
    families: dict[str, list[float]] = {}
    for col in range(19, 30):  # S..AC
        label = ws.cell(row=22, column=col).value
        if not label:
            continue
        code, _ = family_code_label(label)
        families[code] = [ws.cell(row=r, column=col).value for r in range(23, 38)]

    data = wb["Data"]
    version_date = cell(ws, "T3")
    source_version = str(cell(ws, "S3") or "LV81.3")
    buffer_ = float(cell(ws, "R52") or 0.03)
    floor_ = float(cell(ws, "R51") or 0.054)
    med_low = {"threshold_a": float(cell(ws, "B12") or 28011),
               "threshold_b": float(cell(ws, "B13") or 35013),
               "phase_rate": float(cell(ws, "C12") or 0.1)}
    ot = float(cell(data, "C20") or 0.8)
    bonus = float(cell(data, "C21") or 0.8)
    invest = float(cell(data, "C22") or 0.8)
    rental = float(cell(data, "G12") or 0.7)
    taxfree = float(cell(data, "G28") or 0.9)
    pensions = float(cell(data, "G30") or 0.9)
    cc_rate = float(cell(ws, "R48") or 0.038)
    cc_min = float(cell(ws, "R49") or 25)
    od_rate = float(cell(ws, "R50") or 0.03)
    effective_from = str(version_date or "2026-06-27")[:10]

    wb.close()
    return {
        "name": "Commonwealth Bank",
        "source_file": FILE,
        "source_version": source_version,
        "source_date": version_date,
        "effective_from": effective_from,
        "parameters": {
            "assessment": {"buffer": buffer_, "floor": floor_, "extra": 0.0},
            "income_rules": {
                "haircuts": {
                    "overtime": ot, "bonus_commission": bonus,
                    "investment_income": invest, "dividends": 0.8,
                    "foreign_income": 0.8, "rental_income": rental,
                    "casual": 1.0, "government_benefits": pensions,
                    "other_taxable": 1.0, "other_nontaxable": taxfree},
                "company_tax": 0.30,
            },
            "tax": {
                "brackets": _brackets(tax_rows),
                "lito": [[float(x) for x in r] for r in lito_rows],
                "lmito": [],
                "medicare": 0.02,
                "medicare_low": med_low,
            },
            "living": {
                "hem_source": "CBA MasterData HEM",
                "hem_weekly": False,
                "use_max_declared": True,
                "non_hem_categories": [],
                "hem_table": {"income_bands": bands, "families": families},
            },
            "commitments": {
                "credit_card": {"rate": cc_rate, "minimum": cc_min},
                "overdraft": {"rate": od_rate, "minimum": 0.0},
                "commitment_floor": {"rate": 0.045, "term_months": 300,
                                     "residual": 0.2},
            },
            "result": {"indicator": "surplus_sign", "refer_without_buffer": True,
                       "max_loan": "pv_invert"},
        },
        "options": {"simple_refinance": {"mode": "add", "value": 0.01}},
        "notes": ["IO 上限 5 年 / LOC 25 年（Data O11/Q-R 产品期限），V1 未启用。",
                  "LITO/Medicare 低收入阶梯取自 MasterData。",
                  "公司税 30% 取契约参数表。"],
    }


def family_code_label(label):
    """返回 (code, label)，add dep/adult -> *_add/_adult。"""
    if label is None:
        return None, ""
    text = str(label).strip().lower()
    prefix = "C" if "couple" in text else "S"
    if "add" in text:
        if "adult" in text:
            return f"{prefix}_adult", str(label)
        return f"{prefix}_add", str(label)
    return family_code(label), str(label)
