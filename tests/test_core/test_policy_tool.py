"""tests/test_core/test_policy_tool.py — C 小债：policy_check 白名单死项接线"""

from core.agents.flows import load_flows, match_flows
from core.models.orm import Case
from core.policy.engine import run_policy_check


def test_policy_check_flow_loaded():
    flows = load_flows()
    assert "policy_check" in flows
    assert flows["policy_check"]["presentation"] == "result_card"


def test_policy_check_trigger_routes():
    hits = match_flows("帮我查一下政策")
    assert any(f.get("key") == "policy_check" for f in hits)


def test_run_policy_check_no_case():
    res = run_policy_check("", {}, None)  # type: ignore[arg-type]
    assert res["status"] == "skipped"


def test_run_policy_check_case_green(test_db):
    test_db.add(Case(
        id="POL-1",
        client_name="PERSON_1",
        lender="CBA",
        employment_type="Full-time",
        residency="citizen",
        lvr=70.0,
    ))
    test_db.commit()
    res = run_policy_check("POL-1", {}, test_db)
    assert res["status"] == "ok"
    assert res["lender"] == "CBA"
    assert res["overall"] in ("green", "amber", "red")
    assert isinstance(res["issues"], list)
    assert isinstance(res["alternative_lenders"], list)


def test_run_policy_check_bank_override(test_db):
    test_db.add(Case(id="POL-2", client_name="PERSON_1", lender="CBA", employment_type="Self-employed"))
    test_db.commit()
    res = run_policy_check("POL-2", {"bank": "ANZ"}, test_db)
    assert res["status"] == "ok"
    assert res["lender"] == "ANZ"
