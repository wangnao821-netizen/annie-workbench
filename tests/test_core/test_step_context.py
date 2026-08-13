"""tests/test_core/test_step_context.py — StepContext 显式契约测试（WO-26c）"""

import pytest

import core.config
from core.agents import pai
from core.agents.flows import load_flows
from core.agents.runner import run_flow
from core.models.orm import Case, CaseContextEvent


@pytest.fixture(autouse=True)
def _step_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    core.config._cached_config = None
    # 本单专注轻量回退执行器；PAI 路径由 WO-26b 测试覆盖
    monkeypatch.setattr(pai, "run_flow_with_pai", lambda *a, **k: None)


def _case(db, cid: str) -> Case:
    c = Case(id=cid, client_name=f"Case {cid}")
    db.add(c)
    db.commit()
    return c


def _flow(steps, presentation="result_card", key="test", name="测试流程") -> dict:
    return {"key": key, "name": name, "presentation": presentation, "steps": steps}


def test_single_step_arg_resolution(test_db, monkeypatch):
    _case(test_db, "c_arg")
    captured: dict = {}
    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: captured.update(files=files, folder=folder) or {"status": "pass", "summary": "ok"},
    )
    flow = _flow([{"tool": "declaration_check", "params": {"files": "$arg.files", "folder": "$arg.folder"}, "output": "findings"}])
    run_flow(flow, "c_arg", {"files": ["a.pdf"], "folder": "/x"}, test_db)
    assert captured["files"] == ["a.pdf"]
    assert captured["folder"] == "/x"


def test_case_id_injection(test_db, monkeypatch):
    _case(test_db, "c_cid")
    captured: dict = {}
    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: captured.update(case_id=case_id) or {"status": "pass", "summary": "ok"},
    )
    flow = _flow([{"tool": "declaration_check", "params": {"case_id": "$case_id"}, "output": "r"}])
    run_flow(flow, "c_cid", {}, test_db)
    assert captured["case_id"] == "c_cid"


def test_multistep_output_chaining(test_db, monkeypatch):
    _case(test_db, "c_multi")
    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: {"status": "pass", "summary": "s1", "value": "v1"},
    )
    flow = _flow([
        {"tool": "declaration_check", "params": {"files": "$arg.files"}, "output": "findings"},
        {"tool": "context_event_write", "params": {"event_type": "chained", "content": "$step.findings"}, "output": "evt"},
    ])
    run_flow(flow, "c_multi", {"files": ["a.pdf"]}, test_db)
    contents = [e.content for e in test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "c_multi").all()]
    assert any("v1" in c for c in contents)


def test_missing_step_output_error(test_db):
    flow = _flow([{"tool": "policy_check", "params": {"query": "$step.nonexistent"}}])
    res = run_flow(flow, None, {}, test_db)
    assert "参数无效" in res["reply"]
    assert "未产出" in res["reply"]
    assert res["tool_cards"] == []


def test_required_arg_missing_error(test_db):
    flow = _flow([{"tool": "calculator_assess", "params": {"bank": "$arg.bank"}, "required": ["bank"]}])
    res = run_flow(flow, None, {}, test_db)
    assert "参数缺失：bank" in res["reply"]
    assert res["tool_cards"] == []


def test_unknown_tool_skipped(test_db):
    flow = _flow([{"tool": "bogus_tool"}])
    res = run_flow(flow, None, {}, test_db)
    assert res["tool_cards"] == []
    assert "无可执行步骤" in res["reply"]


def test_case_intake_flow_writes_event(test_db):
    _case(test_db, "c_intake")
    res = run_flow(load_flows()["case_intake"], "c_intake", {}, test_db)
    assert res["presentation"] == "dialog"
    events = (
        test_db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == "c_intake", CaseContextEvent.source_type == "flow:case_intake")
        .all()
    )
    assert len(events) >= 1


def test_returns_wo26_contract(test_db):
    res = run_flow(load_flows()["calculator"], None, {}, test_db)
    assert set(res.keys()) == {"reply", "tool_cards", "recorded_facts", "presentation"}
    assert res["presentation"] == "dialog"
    assert res["tool_cards"][0]["payload"]["needs_form"] is True


def test_literal_params_passthrough(test_db):
    _case(test_db, "c_lit")
    flow = _flow([{"tool": "context_event_write", "params": {"event_type": "literal_x"}, "output": "r"}])
    res = run_flow(flow, "c_lit", {}, test_db)
    assert res["tool_cards"][0]["payload"]["event_type"] == "literal_x"


def test_pai_exception_falls_back_to_lightweight(test_db, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("pai down")

    monkeypatch.setattr(pai, "run_flow_with_pai", boom)
    res = run_flow(load_flows()["calculator"], None, {}, test_db)
    assert res["tool_cards"][0]["payload"]["needs_form"] is True