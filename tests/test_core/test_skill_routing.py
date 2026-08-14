"""tests/test_core/test_skill_routing.py — 技能 active 接入对话路由（WO-36）"""

import pytest

import core.config
from core.agents import router
from core.agents.registry import set_agent_enabled


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


def test_skill_trigger_only_routes_to_flow(monkeypatch, test_db):
    """agent-audit 技能触发语'交叉比对申报'（flow triggers 不命中）→ declaration_check。"""
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    flow = router.route_flow("交叉比对申报", test_db)
    assert flow is not None and flow["key"] == "declaration_check"


def test_disabled_skill_not_routed(monkeypatch, test_db):
    """关闭 agent-audit 后其技能触发语不再路由（flow triggers 也不命中 → None）。"""
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    set_agent_enabled(test_db, "agent-audit", False)
    assert router.route_flow("交叉比对申报", test_db) is None


def test_pending_skill_not_routed(monkeypatch, test_db):
    """agent-followup 为 pending，其技能触发语不接入（flow followup triggers 不命中 → None）。"""
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    assert router.route_flow("帮我跟进案件", test_db) is None


def test_flow_trigger_unchanged(monkeypatch, test_db):
    """既有 flow 触发语零回归。"""
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    flow = router.route_flow("帮我检查一下申报一致性", test_db)
    assert flow is not None and flow["key"] == "declaration_check"


def test_skill_and_flow_dedup_no_llm(monkeypatch, test_db):
    """'帮我建个案件'同时命中 flow 与技能触发语 → 去重唯一，直接走不调 LLM。"""
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    flow = router.route_flow("帮我建个案件", test_db)
    assert flow is not None and flow["key"] == "case_intake"


def test_tool_without_triggers_not_routed(monkeypatch, test_db):
    """tool 类技能无 flow_key/triggers，不参与路由。"""
    monkeypatch.setattr(router, "_llm_pick", _no_llm())
    assert router.route_flow("记忆工具用一下", test_db) is None


def test_collision_behavior_unchanged(monkeypatch, test_db):
    """撞车场景（跟进 vs 催件）保持 LLM 路由，技能接入不改变规则保底语义。"""
    monkeypatch.setattr(router, "_llm_pick", lambda *a, **k: "followup")
    flow = router.route_flow("跟进邮件和催件有什么区别", test_db)
    assert flow["key"] == "followup"
