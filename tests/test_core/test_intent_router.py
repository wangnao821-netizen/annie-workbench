"""tests/test_core/test_intent_router.py — 意图路由升级（WO-30）"""

import pytest

import core.config
from core.agents import router
from core.agents.flows import load_flows
from core.ai.gateway import ApiCallResult
from core.chat.loop import run_chat_with_tools
from core.models.orm import Case

AMBIGUOUS = "跟进邮件和催件有什么区别"


@pytest.fixture(autouse=True)
def _router_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    core.config._cached_config = None


def _no_llm():
    def boom(*a, **k):
        raise AssertionError("不应调用 LLM")

    return boom


def test_unique_hit_no_llm(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    flow = router.route_flow("帮我检查一下申报一致性", test_db)
    assert flow is not None and flow["key"] == "declaration_check"


def test_ambiguous_llm_picks(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", lambda *a, **k: "followup")
    flow = router.route_flow(AMBIGUOUS, test_db)
    assert flow["key"] == "followup"


def test_ambiguous_unknown_key_fallback(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", lambda *a, **k: "bogus")
    flow = router.route_flow(AMBIGUOUS, test_db)
    assert flow["key"] == "chaser"  # 规则保底：按文件名序首个命中


def test_ambiguous_llm_error_fallback(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    flow = router.route_flow(AMBIGUOUS, test_db)
    assert flow["key"] == "chaser"


def test_zero_hit_no_llm(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    assert router.route_flow("今天天气怎么样", test_db) is None


def test_llm_pick_pii_desensitized(monkeypatch, test_db):
    captured: dict = {}

    def fake_call(self, text, prompt_template, system_prompt, prefer_provider=None):
        captured["text"] = str(text)
        return ApiCallResult(response_text='{"flow_key": "followup"}', prompt_tokens=10, completion_tokens=5,
                             cost_usd=0.0, latency_ms=1, provider_used="deepseek")

    monkeypatch.setattr("core.ai.gateway.ApiGateway.call_llm", fake_call)
    router._llm_pick("客户电话 0412 345 678 写跟进邮件", load_flows(), test_db, "c_pii")
    assert "0412 345 678" not in captured["text"]


def test_llm_pick_valid_key(monkeypatch, test_db):
    monkeypatch.setattr(
        "core.ai.gateway.ApiGateway.call_llm",
        lambda self, text, prompt_template, system_prompt, prefer_provider=None: ApiCallResult(
            response_text='{"flow_key": "followup"}', prompt_tokens=10, completion_tokens=5,
            cost_usd=0.0, latency_ms=1, provider_used="deepseek"),
    )
    assert router._llm_pick("写跟进邮件", load_flows(), test_db, None) == "followup"


def test_llm_pick_invalid_json(monkeypatch, test_db):
    monkeypatch.setattr(
        "core.ai.gateway.ApiGateway.call_llm",
        lambda self, text, prompt_template, system_prompt, prefer_provider=None: ApiCallResult(
            response_text="抱歉，我没听懂", prompt_tokens=1, completion_tokens=1,
            cost_usd=0.0, latency_ms=1, provider_used="deepseek"),
    )
    assert router._llm_pick("x", load_flows(), test_db, None) is None


def test_routing_disabled(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    core.config.get_config().settings.ai.routing.intent_routing_enabled = False
    flow = router.route_flow(AMBIGUOUS, test_db)
    assert flow["key"] == "chaser"


def test_route_flow_returns_flow_dict(monkeypatch, test_db):
    monkeypatch.setattr(router, "_llm_pick", lambda *a, **k: "followup")
    flow = router.route_flow(AMBIGUOUS, test_db)
    assert {"key", "name", "presentation"} <= set(flow.keys())
    assert flow["presentation"] == "dialog"


def test_candidate_prompt_stable():
    flows = load_flows()
    assert router._candidate_prompt(flows) == router._candidate_prompt(flows)
    assert "2026" not in router._candidate_prompt(flows)


def test_chat_loop_uses_router(monkeypatch, test_db):
    case = Case(id="c_route", client_name="Route Case")
    test_db.add(case)
    test_db.commit()
    flows = load_flows()
    monkeypatch.setattr(router, "route_flow", lambda message, db, case_id=None: flows["calculator"])
    res = run_chat_with_tools("c_route", "随便说点什么", "internal", test_db)
    assert res["presentation"] == "dialog"
    assert res["tool_cards"][0]["payload"]["needs_form"] is True