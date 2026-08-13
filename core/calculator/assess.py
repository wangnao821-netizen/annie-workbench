"""WO-21 主评估链：收入 -> 税费 -> 净收入 -> HEM -> 贷款月供 -> 存量负债
-> 盈余 -> 指标 -> max_loan（pv_invert 二分）。

每一步追加 CalcStep，保证过程可见（契约 §三 确定性引擎）。
"""

from __future__ import annotations

from . import commitments as _commitments
from . import hem as _hem
from . import result as _result
from . import tax as _tax
from .models import ApplicantIn, AssessRequest, CalcResult, CalcStep, LoanPortionIn

_TAXABLE_FIELDS = ("base", "overtime", "bonus_commission", "casual",
                   "investment_income", "dividends", "foreign_income",
                   "rental_income", "other_taxable")
_NONTAXABLE_FIELDS = ("government_benefits", "other_nontaxable")


def _applicant_income(applicant: ApplicantIn, rules: dict,
                      haircuts_override: dict | None = None) -> tuple[float, float]:
    """返回 (应税收入, 非应税收入)，各项目按 haircut + 年化折算。"""
    haircuts = rules.get("haircuts", {})
    if haircuts_override:
        haircuts = {**haircuts, **haircuts_override}
    casual_weeks = float(rules.get("casual_annualize_weeks", 52))
    taxable = 0.0
    nontaxable = 0.0
    for field in _TAXABLE_FIELDS:
        raw = float(getattr(applicant, field, 0.0) or 0.0)
        if raw == 0:
            continue
        factor = float(haircuts.get(field, 1.0))
        if field == "casual":
            factor *= casual_weeks / 52
        taxable += raw * factor
    for field in _NONTAXABLE_FIELDS:
        raw = float(getattr(applicant, field, 0.0) or 0.0)
        if raw == 0:
            continue
        nontaxable += raw * float(haircuts.get(field, 1.0))
    return round(taxable, 2), round(nontaxable, 2)


def _company_net(applicants: list[ApplicantIn], rules: dict) -> float:
    rate = float(rules.get("company_tax", 0.30))
    total = sum(
        (float(a.company_npbt or 0.0) + float(a.company_addbacks or 0.0))
        * (1 - rate) for a in applicants
    )
    return round(total, 2)


def _gross_for_hem(applicants: list[ApplicantIn], rules: dict) -> float:
    haircuts = rules.get("haircuts", {})
    total = 0.0
    for applicant in applicants:
        for field in _TAXABLE_FIELDS + _NONTAXABLE_FIELDS:
            total += float(getattr(applicant, field, 0.0) or 0.0) * \
                float(haircuts.get(field, 1.0))
        total += float(applicant.company_npbt or 0.0) + \
            float(applicant.company_addbacks or 0.0)
    return round(total, 2)


def _loan_monthly(portions: list[LoanPortionIn], assessment: dict,
                  options: dict, simple_refinance: bool,
                  steps: list | None, buffer_override: float | None = None) -> float:
    buffer = float(assessment.get("buffer", 0.0))
    floor = float(assessment.get("floor", 0.0))
    extra = float(assessment.get("extra", 0.0))
    refi = options.get("simple_refinance")
    if simple_refinance and refi:
        if refi.get("mode") == "override":
            buffer = float(refi["value"])
        else:
            buffer += float(refi["value"])
    if options.get("new_loan_no_buffer"):
        buffer = 0.0
    if buffer_override is not None:
        buffer = buffer_override
    deemed = options.get("deemed_investment_rate")
    total = 0.0
    for i, portion in enumerate(portions):
        rate = float(portion.rate)
        if deemed and portion.purpose == "INV":
            rate = max(rate, float(deemed))
        assess_rate = max(floor, rate + buffer + extra)
        if portion.repayment == "IO" and (portion.io_years or 0) > 0:
            monthly = portion.amount * assess_rate / 12
            formula = f"{portion.amount} * {assess_rate}/12"
        else:
            term = int(portion.term_years) * 12
            monthly = _commitments.pmt(assess_rate / 12, term, portion.amount)
            formula = f"pmt({assess_rate}/12, {term}, {portion.amount})"
        total += monthly
        if steps is not None:
            steps.append({
                "step_id": f"loan:portion{i}", "label": f"New loan portion {i}",
                "formula": formula,
                "inputs": {"amount": portion.amount, "rate": portion.rate,
                           "assess_rate": assess_rate, "term_years": portion.term_years,
                           "repayment": portion.repayment},
                "output": round(monthly, 2),
            })
    total = round(total, 2)
    if steps is not None:
        steps.append({
            "step_id": "loan:total", "label": "Total new loan monthly",
            "formula": "sum(portions)", "inputs": {"portions": len(portions)},
            "output": total,
        })
    return total


def _surplus(request: AssessRequest, profile: dict, steps: list) -> dict:
    """核心链，返回中间量 dict（不判定 verdict）。"""
    params = profile["parameters"]
    assessment = params["assessment"]
    options = profile.get("options", {})
    rules = params["income_rules"]
    tax_cfg = params["tax"]
    living_cfg = params["living"]
    commitments_cfg = params["commitments"]
    result_cfg = params["result"]
    household = request.household
    status = household.status if household.status else "Single"

    taxable_total = nontaxable_total = 0.0
    haircuts_override = {}
    if options.get("specialist_haircuts") and \
            str(request.loan.mortgage_insurer).lower() == "specialist":
        haircuts_override = options["specialist_haircuts"]
    for applicant in request.applicants:
        taxable, nontaxable = _applicant_income(applicant, rules, haircuts_override)
        taxable_total += taxable
        nontaxable_total += nontaxable
        steps.append({
            "step_id": "income:applicant", "label": "Applicant income",
            "formula": "haircuts per income_rules",
            "inputs": {"applicant": applicant.__dict__},
            "output": {"taxable": taxable, "nontaxable": nontaxable},
        })
    taxable_total, nontaxable_total = round(taxable_total, 2), round(nontaxable_total, 2)
    company_net = _company_net(request.applicants, rules)
    gross_for_hem = household.income_for_hem if household.income_for_hem \
        else _gross_for_hem(request.applicants, rules)

    net_personal = _tax.net_income(taxable_total, nontaxable_total, status,
                                   tax_cfg, steps)
    net_total = round(net_personal + company_net, 2)
    factor = options.get("net_income_factor")
    if factor:
        net_total = round(net_total * float(factor), 2)
    income_monthly = round(net_total / 12, 2)
    steps.append({
        "step_id": "income:net", "label": "Net household income",
        "formula": f"{net_personal}+{company_net}", "inputs": {},
        "output": net_total,
    })

    hem_monthly = _hem.hem_lookup(status, household.dependents, gross_for_hem,
                                  living_cfg, steps)
    declared = float(request.living_expenses.declared_basic_monthly or 0.0)
    declared_non_hem = float(request.living_expenses.declared_non_hem or 0.0)
    notional = 0.0
    nr = options.get("notional_rent")
    if nr and request.loan.portions:
        notional = float(nr.get(status.lower(), nr.get("couple", 0)))
        if nr.get("weekly"):
            notional = notional * 52 / 12
    living = round(max(hem_monthly, declared) + declared_non_hem + notional, 2)
    steps.append({
        "step_id": "living:final", "label": "Living expenses",
        "formula": f"max(HEM {hem_monthly}, declared {declared}) + {declared_non_hem} + {notional}",
        "inputs": {"hem": hem_monthly, "declared": declared,
                   "declared_non_hem": declared_non_hem, "notional": notional},
        "output": living,
    })

    loan_monthly = _loan_monthly(request.loan.portions, assessment, options,
                                 request.loan.simple_refinance, steps)
    fee = options.get("new_loan_monthly_fee")
    if fee:
        loan_monthly = round(loan_monthly + float(fee), 2)
    loan_monthly_no_buffer = _loan_monthly(
        request.loan.portions, assessment, options,
        request.loan.simple_refinance, None, buffer_override=0.0)

    loan_amount = sum(p.amount for p in request.loan.portions)
    security = float(request.loan.security_value or 0.0)
    lvr = round(loan_amount / security, 4) if security > 0 else 0.0

    commitments_total = _commitments.total_commitments(
        [c.__dict__ for c in request.commitments], assessment, commitments_cfg,
        steps)

    surplus = round(income_monthly - loan_monthly - commitments_total - living, 2)
    surplus_without_buffer = round(
        income_monthly - loan_monthly_no_buffer - commitments_total - living, 2)
    steps.append({
        "step_id": "result:surplus", "label": "Monthly surplus",
        "formula": f"{income_monthly} - {loan_monthly} - {commitments_total} - {living}",
        "inputs": {"income_monthly": income_monthly, "loan_monthly": loan_monthly,
                   "commitments_total": commitments_total, "living": living},
        "output": surplus,
    })

    total_burden = round(loan_monthly + commitments_total + living, 2)
    extra = {
        "lvr": lvr,
        "mortgage_insurer": request.loan.mortgage_insurer,
        "total_burden": total_burden,
        "net_income_monthly": income_monthly,
        "surplus_without_buffer": surplus_without_buffer,
    }
    return {
        "surplus": surplus, "income_monthly": income_monthly,
        "loan_monthly": loan_monthly, "commitments_total": commitments_total,
        "living": living, "net_total": net_total, "lvr": lvr,
        "company_net": company_net, "gross_for_hem": gross_for_hem,
        "result_cfg": result_cfg, "options": options, "extra": extra,
        "hem_monthly": hem_monthly,
    }


def _assess_scaled(request: AssessRequest, profile: dict,
                   loan_total: float) -> dict:
    """按 loan_total 等比缩放分片后运行核心链，返回 (verdict, surplus)。"""
    if not request.loan.portions:
        return {"verdict": "APPROVE", "surplus": 0.0}
    current = sum(p.amount for p in request.loan.portions) or 1.0
    scale = loan_total / current
    scaled = AssessRequest(
        bank=request.bank,
        applicants=request.applicants,
        household=request.household,
        living_expenses=request.living_expenses,
        commitments=request.commitments,
        loan=_scale_loan(request.loan, scale),
    )
    steps: list[dict] = []
    mid = _surplus(scaled, profile, steps)
    return _verdict(mid, profile, steps)


def _scale_loan(loan, scale):
    from dataclasses import replace

    return replace(loan, portions=[
        LoanPortionIn(
            amount=round(p.amount * scale, 2), rate=p.rate, term_years=p.term_years,
            io_years=p.io_years, purpose=p.purpose, repayment=p.repayment)
        for p in loan.portions])


def _verdict(mid: dict, profile: dict, steps: list[dict]) -> dict:
    result_cfg = mid["result_cfg"]
    lvr = mid["lvr"]
    if result_cfg.get("no_result_lvr") and lvr > float(result_cfg["no_result_lvr"]):
        steps.append({
            "step_id": "result:lvr_no_result", "label": "LVR guard (NO_RESULT)",
            "formula": f"lvr {lvr} > no_result_lvr {result_cfg['no_result_lvr']}",
            "inputs": {"lvr": lvr, "limit": result_cfg["no_result_lvr"]},
            "output": "NO_RESULT",
        })
        return {"verdict": "NO_RESULT", "surplus": mid["surplus"], "steps": steps}
    if result_cfg.get("lvr_cap") and lvr > float(result_cfg["lvr_cap"]):
        steps.append({
            "step_id": "result:lvr_cap", "label": "LVR guard (DECLINE)",
            "formula": f"lvr {lvr} > lvr_cap {result_cfg['lvr_cap']}",
            "inputs": {"lvr": lvr, "limit": result_cfg["lvr_cap"]},
            "output": "DECLINE",
        })
        return {"verdict": "DECLINE", "surplus": mid["surplus"], "steps": steps}
    verdict, indicator, value, warnings = _result.evaluate(
        result_cfg, mid["surplus"], mid["extra"], steps)
    return {"verdict": verdict, "surplus": mid["surplus"], "steps": steps,
            "indicator": indicator, "indicator_value": value,
            "warnings": warnings}


def assess(request: AssessRequest, profile: dict) -> CalcResult:
    steps: list[dict] = []
    mid = _surplus(request, profile, steps)
    out = _verdict(mid, profile, steps)
    max_loan = None
    if profile["parameters"]["result"].get("max_loan") == "pv_invert":
        max_loan = _max_loan(request, profile)
    breakdown = {
        "net_income_monthly": mid["income_monthly"],
        "hem_monthly": mid["hem_monthly"],
        "living_monthly": mid["living"],
        "loan_monthly": mid["loan_monthly"],
        "commitments_monthly": mid["commitments_total"],
        "surplus_monthly": mid["surplus"],
        "lvr": mid["lvr"],
    }
    return CalcResult(
        bank=request.bank,
        verdict=out["verdict"],
        max_loan=max_loan,
        surplus=mid["surplus"],
        indicator=out.get("indicator"),
        indicator_value=out.get("indicator_value"),
        steps=[CalcStep(**s) for s in steps],
        breakdown=breakdown,
        profile_used={"name": profile.get("name"), "source_version": profile.get("source_version"),
                      "profile_version": profile.get("profile_version")},
        warnings=out.get("warnings", []),
    )


def _max_loan(request: AssessRequest, profile: dict, precision: float = 0.01) -> float:
    if not request.loan.portions:
        return 0.0
    hi = sum(p.amount for p in request.loan.portions) * 10 + 1_000_000.0
    lo = 0.0
    best = 0.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if _assess_scaled(request, profile, mid)["verdict"] == "APPROVE":
            best = mid
            lo = mid
        else:
            hi = mid
        if hi - lo < precision:
            break
    return round(best, 2)
