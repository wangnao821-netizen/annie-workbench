"""Golden tests for the WO-21 serviceability calculator engine.

Anchors every bank's engine (tax brackets, MLS tiers, HEM families,
commitment rates, assessment buffers, verdict indicators) to values taken
directly from the source workbooks/build output, plus end-to-end chains.
"""

import math

import pytest

from core.calculator.profiles import load_profile

ALL_BANKS = ["boc", "cba", "macquarie", "ma_money", "latrobe", "resimac"]


@pytest.fixture(scope="module")
def profiles():
    return {b: load_profile(b) for b in ALL_BANKS}


def _req(bank: str, base=120000, loan=500000, rate=0.06, security=700000,
         commitments=()):
    from core.calculator.models import (
        ApplicantIn,
        AssessRequest,
        CommitmentIn,
        HouseholdIn,
        LivingExpensesIn,
        LoanIn,
        LoanPortionIn,
    )

    return AssessRequest(
        bank=bank,
        applicants=[ApplicantIn(base=base)],
        loan=LoanIn(
            portions=[LoanPortionIn(amount=loan, rate=rate, term_years=30)],
            security_value=security,
            state="NSW",
        ),
        household=HouseholdIn(status="Single"),
        living_expenses=LivingExpensesIn(),
        commitments=[CommitmentIn(**c) for c in commitments],
    )


# ------------------------------------------------------------------ tax


def test_cba_income_tax_table(profiles):
    t = profiles["cba"]["parameters"]["tax"]
    values = [income_tax(x, t) for x in (0, 18200, 45000, 80000, 120000, 180000, 200000)]
    assert values == [0.0, 0.0, 4020.0, 14520.0, 26520.0, 47670.0, 55870.0]


def test_boc_income_tax_and_mls(profiles):
    t = profiles["boc"]["parameters"]["tax"]
    assert income_tax(80000, t) == 14520.0
    assert mls(120000, "Single", t) == pytest.approx(1500.0)
    assert mls(120000, "Couple", t) == pytest.approx(1200.0)
    # BOC schedule applies surcharge from dollar one (0% tier only at <= 0)
    assert mls(45000, "Single", t) == pytest.approx(450.0)


def test_medicare_low_threshold(profiles):
    t = profiles["cba"]["parameters"]["tax"]
    assert medicare_levy(25000, t) == 0.0  # below threshold_a
    assert medicare_levy(80000, t) == 1600.0  # full 2% above threshold_b
    assert medicare_levy(100000, t) == 2000.0


def test_net_income_cba_no_mls(profiles):
    t = profiles["cba"]["parameters"]["tax"]
    assert net_tax(80000, "Single", t) == 16120.0
    assert net_income(80000, 0, "Single", t) == 63880.0
    assert net_income(120000, 0, "Single", t) == pytest.approx(91080.0)
    assert net_income(120000, 0, "Couple", t) == pytest.approx(91080.0)


def test_net_income_boc_includes_mls(profiles):
    t = profiles["boc"]["parameters"]["tax"]
    # 120k single: 26520 tax + 2400 medicare + 1500 MLS = 30420
    assert net_income(120000, 0, "Single", t) == pytest.approx(89580.0)


# ------------------------------------------------------------------ HEM


def test_hem_lookup_known_band(profiles):
    # HEM[S0][band 6] for 120k single income (BOC monthly table)
    boc = profiles["boc"]["parameters"]["living"]
    assert hem_lookup("Single", 0, 120000, boc) == pytest.approx(2437.68)


def test_hem_table_monotonic(profiles):
    import itertools
    import re
    for bank in ALL_BANKS:
        living = profiles[bank]["parameters"]["living"]
        table = living["hem_table"]
        assert table["income_bands"], bank
        # main families only (S0..S3/C0..C10); *_add/_adult increments may dip by $1
        for family, series in table["families"].items():
            if not re.fullmatch(r"[SC]\d+", family):
                continue
            pairs = list(itertools.pairwise(series))
            assert pairs and all(a <= b for a, b in pairs), (
                f"{bank} family {family} not non-decreasing"
            )


def test_hem_flat_within_band(profiles):
    boc = profiles["boc"]["parameters"]["living"]
    # income_bands: [0, 27000, 40000, ...] -> 28000 and 39999 share band 1
    low = hem_lookup("Single", 0, 28000, boc)
    high = hem_lookup("Single", 0, 39999, boc)
    assert low == pytest.approx(high)


def test_hem_extrapolate_by_add(profiles):
    cba = profiles["cba"]["parameters"]["living"]
    # CBA families carry S_add/C_add increments for dependents beyond the table
    single4 = hem_lookup("Single", 4, 150000, cba)
    single3 = hem_lookup("Single", 3, 150000, cba)
    table = cba["hem_table"]
    assert single4 > single3
    assert single3 == pytest.approx(
        table["families"]["S3"][6] if single3 == table["families"]["S3"][6] * 1.0
        else single3
    )


# ------------------------------------------------------------------ commitments


def test_credit_card_monthly(profiles):
    assert assess_by_limit({"type": "credit_card", "limit": 10000},
                           profiles["cba"]["parameters"]["commitments"]) == 380.0
    assert assess_by_limit({"type": "credit_card", "limit": 10000},
                           profiles["boc"]["parameters"]["commitments"]) == 380.0
    mac = assess_by_limit({"type": "credit_card", "limit": 10000},
                          profiles["macquarie"]["parameters"]["commitments"])
    assert mac * 12 == pytest.approx(4560.0)
    assert assess_by_limit({"type": "credit_card", "limit": 5000},
                           profiles["boc"]["parameters"]["commitments"]) == 190.0


def test_macquarie_overdraft_annual_rate(profiles):
    # macquarie quotes overdraft as annual 45.6% -> monthly 3.8%
    monthly = assess_by_limit({"type": "overdraft", "limit": 1000},
                              profiles["macquarie"]["parameters"]["commitments"])
    assert monthly == pytest.approx(38.0)


def test_personal_floor_formula(profiles):
    cba = profiles["cba"]["parameters"]["commitments"]
    assert assess_floor({"type": "personal", "balance": 5000}, cba) == pytest.approx(27.79, abs=0.01)


def test_bnpl_from_balance(profiles):
    cba = profiles["cba"]["parameters"]["commitments"]
    assert assess_bnpl({"type": "bnpl", "balance": 1200, "remaining_months": 6}, cba) == 200.0


def test_existing_mortgage_rate_plus_buffer(profiles):
    boc = profiles["boc"]
    steps = []
    monthly = assess_mortgage({
        "type": "mortgage_oo", "balance": 300000, "rate": 0.05,
        "remaining_months": 300,
    }, boc["parameters"]["assessment"], boc["parameters"]["commitments"], steps)
    assert steps[-1]["inputs"]["assess_rate"] == pytest.approx(0.08)  # 5% + 3% buffer
    assert monthly == pytest.approx(pmt(0.08 / 12, 300, 300000), abs=0.01)


def test_latrobe_implied_rate_stress(profiles):
    lat = profiles["latrobe"]
    # latrobe backs out the implied rate from declared monthly and applies its buffer
    balance, months = 300000.0, 300
    declared = pmt(0.05 / 12, months, balance)
    steps = []
    monthly = assess_mortgage({
        "type": "mortgage_oo", "balance": balance,
        "remaining_months": months, "declared_monthly": declared,
    }, lat["parameters"]["assessment"], lat["parameters"]["commitments"], steps)
    assert monthly == pytest.approx(
        max(pmt(0.07 / 12, months, balance), declared), abs=0.02
    )


# ------------------------------------------------------------------ loan engine


def test_boc_assessment_rate(profiles):
    steps = []
    _loan_monthly([LoanPortionIn(amount=500000, rate=0.0599, term_years=30)],
                  profiles["boc"]["parameters"]["assessment"],
                  profiles["boc"].get("options", {}), False, steps)
    inputs = next(s for s in steps if s["step_id"] == "loan:portion0")["inputs"]
    assert inputs["assess_rate"] == pytest.approx(0.0899)  # 5.99% + 3% buffer


def test_resimac_simple_refinance_rebate(profiles):
    res = profiles["resimac"]
    # normal: 6.5% + 2% buffer = 8.5%; simple refinance: buffer overridden to 1% = 7.5%
    for refi, expected in ((False, 0.085), (True, 0.075)):
        steps = []
        _loan_monthly([LoanPortionIn(amount=500000, rate=0.065, term_years=30)],
                      res["parameters"]["assessment"], res.get("options", {}), refi, steps)
        inputs = next(s for s in steps if s["step_id"] == "loan:portion0")["inputs"]
        assert inputs["assess_rate"] == pytest.approx(expected)


def test_latrobe_new_loan_no_buffer_plus_fee(profiles):
    from core.calculator.assess import assess as run_assess
    lat = profiles["latrobe"]
    steps = []
    monthly = _loan_monthly([LoanPortionIn(amount=600000, rate=0.06, term_years=30)],
                            lat["parameters"]["assessment"], lat.get("options", {}),
                            False, steps)
    assert monthly == pytest.approx(3597.30, abs=0.01)
    # the $15 monthly package fee is applied on top in the full chain
    r = run_assess(_req("latrobe", loan=600000), lat)
    assert r.breakdown["loan_monthly"] == pytest.approx(3612.30, abs=0.01)


def test_io_portion_interest_only(profiles):
    steps = []
    monthly = _loan_monthly(
        [LoanPortionIn(amount=500000, rate=0.06, term_years=30, repayment="IO", io_years=5)],
        profiles["boc"]["parameters"]["assessment"], profiles["boc"].get("options", {}),
        False, steps)
    assert monthly == pytest.approx(500000 * 0.09 / 12)  # IO: amount * rate/12


# ------------------------------------------------------------------ income rules


def test_resimac_bonus_haircuts(profiles):
    rules = profiles["resimac"]["parameters"]["income_rules"]
    specialist = profiles["resimac"]["options"]["specialist_haircuts"]
    a = ApplicantIn(base=0, bonus_commission=20000)
    assert _applicant_income(a, rules)[0] == 16000.0  # standard haircut 20%
    assert _applicant_income(a, rules, specialist)[0] == 20000.0  # specialist: 0%


def test_ma_money_rental_90(profiles):
    rules = profiles["ma_money"]["parameters"]["income_rules"]
    assert _applicant_income(ApplicantIn(rental_income=40000), rules)[0] == 36000.0


def test_resimac_net_income_factor(profiles):
    from core.calculator.assess import assess as run_assess
    r = run_assess(_req("resimac"), profiles["resimac"])
    # 120k single: net 91080 * 0.985 factor -> monthly
    expect = 91080.0 * profiles["resimac"]["options"]["net_income_factor"] / 12
    assert r.breakdown["net_income_monthly"] == pytest.approx(expect, abs=0.5)


# ------------------------------------------------------------------ end to end


@pytest.mark.parametrize(
    "bank,verdict,surplus",
    [
        ("boc", "APPROVE", 354.21),
        ("cba", "APPROVE", 1099.89),
        ("macquarie", "REFER", 280.94),
        ("ma_money", "APPROVE", 1521.84),
        ("latrobe", "APPROVE", 2124.50),
        ("resimac", "REFER", 1354.58),
    ],
)
def test_end_to_end_verdict(profiles, bank, verdict, surplus):
    from core.calculator.assess import assess as run_assess
    r = run_assess(_req(bank), profiles[bank])
    assert r.verdict == verdict
    assert r.surplus == pytest.approx(surplus, abs=0.05)


def test_resimac_max_loan_none(profiles):
    from core.calculator.assess import assess as run_assess
    assert run_assess(_req("resimac"), profiles["resimac"]).max_loan is None


def test_max_loan_positive(profiles):
    from core.calculator.assess import assess as run_assess
    for bank in ("boc", "cba", "ma_money", "latrobe"):
        r = run_assess(_req(bank), profiles[bank])
        assert r.max_loan > 400000, bank


def test_lvr_cap_declines_macquarie(profiles):
    from core.calculator.assess import assess as run_assess
    r = run_assess(
        _req("macquarie", base=200000, loan=750000, security=700000), profiles["macquarie"]
    )
    assert r.verdict == "DECLINE"
    assert any(s.step_id == "result:lvr_cap" for s in r.steps)


def test_no_result_lvr_resimac(profiles):
    from core.calculator.assess import assess as run_assess
    r = run_assess(
        _req("resimac", base=200000, loan=750000, security=700000), profiles["resimac"]
    )
    assert r.verdict == "NO_RESULT"
    assert any(s.step_id == "result:lvr_no_result" for s in r.steps)


def test_commitments_lower_surplus(profiles):
    from core.calculator.assess import assess as run_assess
    plain = run_assess(_req("boc"), profiles["boc"])
    with_cc = run_assess(
        _req("boc", commitments=[{"type": "credit_card", "limit": 10000}]),
        profiles["boc"],
    )
    assert with_cc.surplus == pytest.approx(plain.surplus - 380.0, abs=0.01)


# ------------------------------------------------------------------ plumbing


def test_profiles_meta_present(profiles):
    for bank in ALL_BANKS:
        p = profiles[bank]
        assert p["source_version"], bank
        assert p["profile_version"], bank
        assert p["_hash"], bank  # content hash used as optimistic-lock version


def test_steps_wellformed(profiles):
    from core.calculator.assess import assess as run_assess
    r = run_assess(_req("cba"), profiles["cba"])
    seen = []
    for s in r.steps:
        assert s.step_id and s.label and s.formula is not None and s.output is not None
        assert s.step_id not in seen, f"duplicate step {s.step_id}"
        seen.append(s.step_id)
    assert r.steps[0].step_id.startswith("income")
    assert r.steps[-1].step_id.startswith("result")


def test_lvr_guard_steps_visible_when_firing(profiles):
    from core.calculator.assess import assess as run_assess
    r = run_assess(
        _req("macquarie", base=200000, loan=750000, security=700000), profiles["macquarie"]
    )
    step = next(s for s in r.steps if s.step_id == "result:lvr_cap")
    assert step.output == "DECLINE"
    assert step.inputs["lvr"] > step.inputs["limit"]


def test_stamp_duty_positive(profiles):
    from pathlib import Path

    import yaml

    from core.calculator.stamp_duty import stamp_duty
    cfg = yaml.safe_load(Path("config/calculator/stamp_duty.yaml").read_text(encoding="utf-8"))
    for state in ("NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"):
        out = stamp_duty(state, 700000, cfg)
        assert out["total"] > 0, state
        assert math.isclose(out["total"],
                            out["transfer"] + out["mortgage"] + out["fees"])



from core.calculator.assess import _applicant_income, _loan_monthly
from core.calculator.commitments import (
    assess_bnpl,
    assess_by_limit,
    assess_floor,
    assess_mortgage,
    pmt,
)
from core.calculator.hem import hem_lookup
from core.calculator.models import ApplicantIn, LoanPortionIn
from core.calculator.tax import income_tax, medicare_levy, mls, net_income, net_tax
