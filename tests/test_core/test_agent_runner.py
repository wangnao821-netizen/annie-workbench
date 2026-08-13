"""tests/test_core/test_agent_runner.py — 流程包执行器测试 (WO-26)"""

import pytest

from core.agents.flows import load_flows
from core.agents.runner import run_flow
from core.models.orm import Case, CaseContextEvent


@pytest.fixture(autouse=True)
def _runner_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    import core.config
    core.config._cached_config = None


def test_run_flow_declaration_check_no_declaration(test_db):
    case = Case(id="case_no_dec", client_name="Test Case")
    test_db.add(case)
    test_db.commit()

    flows = load_flows()
    res = run_flow(flows["declaration_check"], "case_no_dec", {}, test_db)

    assert res["presentation"] == "result_card"
    cards = res["tool_cards"]
    assert len(cards) == 1
    assert cards[0]["type"] == "flow_declaration_check"
    assert cards[0]["presentation"] == "result_card"
    assert cards[0]["payload"]["status"] == "fail"


def test_run_flow_declaration_check_with_monkeypatch(test_db, monkeypatch):
    case = Case(id="case_with_dec", client_name="Test Case")
    test_db.add(case)
    test_db.commit()

    dummy_result = {
        "status": "pass",
        "findings": [{"item": "income", "level": "pass"}],
        "summary": "检查通过",
    }
    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: dummy_result,
    )

    flows = load_flows()
    res = run_flow(flows["declaration_check"], "case_with_dec", {}, test_db)

    cards = res["tool_cards"]
    assert len(cards) == 1
    assert cards[0]["payload"]["status"] == "pass"
    assert cards[0]["payload"]["findings"] == dummy_result["findings"]


def test_run_flow_calculator_needs_form(test_db):
    flows = load_flows()
    res = run_flow(flows["calculator"], "case_calc", {}, test_db)

    assert res["presentation"] == "dialog"
    cards = res["tool_cards"]
    assert len(cards) == 1
    assert cards[0]["type"] == "flow_calculator"
    assert cards[0]["presentation"] == "dialog"
    assert cards[0]["payload"].get("needs_form") is True


def test_run_flow_case_intake_writes_event(test_db):
    case = Case(id="case_intake_1", client_name="Intake Case")
    test_db.add(case)
    test_db.commit()

    flows = load_flows()
    res = run_flow(flows["case_intake"], "case_intake_1", {}, test_db)

    assert res["presentation"] == "dialog"
    cards = res["tool_cards"]
    assert len(cards) == 1
    assert cards[0]["type"] == "flow_case_intake"

    events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "case_intake_1",
            CaseContextEvent.source_type == "flow:case_intake",
        )
        .all()
    )
    assert len(events) >= 1


def test_run_flow_writes_internal_events(test_db, monkeypatch):
    case = Case(id="case_events", client_name="Event Case")
    test_db.add(case)
    test_db.commit()

    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: {"summary": "Step 1 done", "status": "pass"},
    )

    flows = load_flows()
    run_flow(flows["declaration_check"], "case_events", {}, test_db)

    events = (
        test_db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == "case_events")
        .all()
    )
    assert len(events) >= 1
    assert any(e.source_type == "flow:declaration_check" for e in events)


def test_run_flow_exception_fallback(test_db, monkeypatch):
    def raise_err(*args, **kwargs):
        raise RuntimeError("Simulated tool error")

    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        raise_err,
    )

    flows = load_flows()
    res = run_flow(flows["declaration_check"], "case_err", {}, test_db)

    assert res["reply"] is not None and "遇到问题" in res["reply"]
    assert res["tool_cards"] == []


def test_run_flow_unknown_tool_skipped(test_db):
    flow_bogus = {
        "key": "bogus_flow",
        "name": "Bogus Flow",
        "presentation": "result_card",
        "steps": [{"tool": "bogus_tool"}],
    }

    res = run_flow(flow_bogus, "case_1", {}, test_db)

    assert res["tool_cards"] == []
    assert "无可执行步骤" in res["reply"]


def test_run_flow_summary_truncated(test_db, monkeypatch):
    case = Case(id="case_trunc", client_name="Trunc Case")
    test_db.add(case)
    test_db.commit()

    long_summary = "A" * 300
    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: {"summary": long_summary, "status": "pass"},
    )

    flows = load_flows()
    run_flow(flows["declaration_check"], "case_trunc", {}, test_db)

    events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "case_trunc",
            CaseContextEvent.source_type == "flow:declaration_check",
        )
        .all()
    )
    assert len(events) >= 1
    for ev in events:
        assert len(ev.content) <= 200
