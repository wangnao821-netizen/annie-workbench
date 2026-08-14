"""tests/test_core/test_pai_orchestration.py — Pydantic AI 编排内核测试（WO-26b）"""

import time
from types import SimpleNamespace

import pytest

import core.config
from core.agents import pai
from core.agents.flows import flow_tool_whitelist, load_flows
from core.agents.runner import run_flow
from core.models.orm import AiUsageLog, Case


@pytest.fixture(autouse=True)
def _pai_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("VERA_PAI_TEST", "1")  # 显式允许走 PAI（真实 _run_agent 由用例 monkeypatch）
    core.config._cached_config = None
    pai.reset_health()


def _flow(key: str) -> dict:
    return load_flows()[key]


def test_pick_provider_default_deepseek():
    assert pai._pick_provider("查一下政策", core.config.get_config()) == "deepseek"


def test_pick_provider_english_gemini():
    assert pai._pick_provider("写一封邮件给客户", core.config.get_config()) == "gemini"


def test_pick_provider_gemini_key_empty(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert pai._pick_provider("写一封邮件给客户", core.config.get_config()) == "deepseek"


def test_pick_provider_skipped_window():
    pai._gemini_skipped_until = time.time() + 999
    try:
        assert pai._pick_provider("写一封邮件", core.config.get_config()) == "deepseek"
    finally:
        pai.reset_health()


def test_gemini_circuit_breaker(test_db, monkeypatch):
    case = Case(id="c_breaker", client_name="Breaker")
    test_db.add(case)
    test_db.commit()
    monkeypatch.setattr(pai, "_run_agent", lambda a, p, t: (_ for _ in ()).throw(RuntimeError("provider down")))
    flow = _flow("calculator")
    args = {"request": "写一封英文邮件"}
    for _ in range(3):
        assert pai.run_flow_with_pai(flow, "c_breaker", args, test_db) is None
    assert pai._gemini_failures >= 3
    assert pai._gemini_skipped_until > time.time()
    assert pai._pick_provider("写一封英文邮件", core.config.get_config()) == "deepseek"


def test_pai_failure_returns_none(test_db, monkeypatch):
    case = Case(id="c_fail", client_name="Fail")
    test_db.add(case)
    test_db.commit()
    monkeypatch.setattr(pai, "_run_agent", lambda a, p, t: (_ for _ in ()).throw(RuntimeError("boom")))
    assert pai.run_flow_with_pai(_flow("calculator"), "c_fail", {}, test_db) is None


def test_runner_fallback_when_pai_none(test_db, monkeypatch):
    case = Case(id="c_fb", client_name="Fallback")
    test_db.add(case)
    test_db.commit()
    monkeypatch.setattr(pai, "run_flow_with_pai", lambda *a, **k: None)
    res = run_flow(_flow("declaration_check"), "c_fb", {}, test_db)
    assert res["presentation"] == "result_card"
    assert res["tool_cards"][0]["payload"]["status"] == "fail"


def test_runner_pai_success_contract(test_db, monkeypatch):
    contract = {"reply": "PAI 完成", "tool_cards": [], "recorded_facts": [], "presentation": "result_card"}
    monkeypatch.setattr(pai, "run_flow_with_pai", lambda *a, **k: contract)
    assert run_flow(_flow("calculator"), "c_succ", {}, test_db) == contract


def test_tool_whitelist_matches_wo26():
    assert set(pai._TOOL_NAMES) == set(flow_tool_whitelist())
    assert len(pai._TOOL_NAMES) == 10  # WO-27 draft_email + WO-32 folder_lookup + WO-33 gap_analysis + WO-41 task_create + WO-43 checklist_query/checklist_preview


def test_timeout_returns_none(test_db, monkeypatch):
    case = Case(id="c_to", client_name="Timeout")
    test_db.add(case)
    test_db.commit()
    monkeypatch.setattr(pai, "_run_agent", lambda a, p, t: (_ for _ in ()).throw(TimeoutError("slow")))
    assert pai.run_flow_with_pai(_flow("calculator"), "c_to", {}, test_db) is None


def test_tool_parameter_validation():
    res = pai._calculator_assess(bank="", request="")
    assert res["status"] == "invalid"
    assert "bank" in res["reason"]


def test_confirm_hook_blocks_scan_without_path(test_db):
    case = Case(id="c_gate", client_name="Gate")
    test_db.add(case)
    test_db.commit()
    res = pai.run_flow_with_pai(_flow("declaration_check"), "c_gate", {"files": []}, test_db)
    assert res is not None
    assert "已阻断" in res["reply"] and "指定路径" in res["reply"]
    assert res["tool_cards"] == []


def test_confirm_hook_blocks_confirm_required(test_db, monkeypatch):
    case = Case(id="c_req", client_name="Req")
    test_db.add(case)
    test_db.commit()
    flow = dict(_flow("calculator"))
    flow["confirm_required"] = True
    res = pai.run_flow_with_pai(flow, "c_req", {"request": "x"}, test_db)
    assert res is not None and "已阻断" in res["reply"]
    fake = SimpleNamespace(output="ok", usage=lambda: None, all_messages=list)
    monkeypatch.setattr(pai, "_run_agent", lambda a, p, t: fake)
    ok = pai.run_flow_with_pai(flow, "c_req", {"request": "x", "confirmed": True}, test_db)
    assert ok is not None and "已阻断" not in ok["reply"]


def test_usage_log_written_on_success(test_db, monkeypatch):
    case = Case(id="c_usage", client_name="Usage")
    test_db.add(case)
    test_db.commit()

    def fake_run(agent, prompt, timeout):
        return SimpleNamespace(
            output="检查完成",
            usage=lambda: SimpleNamespace(input_tokens=100, output_tokens=50, cache_read_tokens=80, cache_write_tokens=20, details={}),
            all_messages=lambda: [SimpleNamespace(parts=[SimpleNamespace(content={"status": "pass", "summary": "检查通过"})])],
        )

    monkeypatch.setattr(pai, "_run_agent", fake_run)
    res = pai.run_flow_with_pai(_flow("declaration_check"), "c_usage", {"files": ["payslip.pdf"], "folder": None}, test_db)
    assert res is not None
    assert res["tool_cards"][0]["payload"]["status"] == "pass"
    rows = test_db.query(AiUsageLog).filter(AiUsageLog.case_id == "c_usage").all()
    assert len(rows) == 1
    assert rows[0].provider == "deepseek"
    assert rows[0].prompt_tokens == 100 and rows[0].completion_tokens == 50
    assert rows[0].prompt_cache_hit_tokens == 80
    assert rows[0].cost_usd > 0


def test_usage_not_written_on_fallback(test_db, monkeypatch):
    case = Case(id="c_nousage", client_name="NoUsage")
    test_db.add(case)
    test_db.commit()
    monkeypatch.setattr(pai, "_run_agent", lambda a, p, t: (_ for _ in ()).throw(RuntimeError("x")))
    assert pai.run_flow_with_pai(_flow("calculator"), "c_nousage", {}, test_db) is None
    assert test_db.query(AiUsageLog).filter(AiUsageLog.case_id == "c_nousage").count() == 0


def test_system_prompt_stable_and_no_timestamp():
    flow = _flow("calculator")
    assert pai._system_prompt(flow) == pai._system_prompt(flow)
    assert "2026" not in pai._system_prompt(flow)


def test_pai_skipped_in_pytest_without_flag(monkeypatch, test_db):
    monkeypatch.delenv("VERA_PAI_TEST", raising=False)

    def should_not_run(*a, **k):
        raise AssertionError("PAI 不应发起真实调用")

    monkeypatch.setattr(pai, "_run_agent", should_not_run)
    assert pai.run_flow_with_pai(_flow("calculator"), "c_skip", {}, test_db) is None