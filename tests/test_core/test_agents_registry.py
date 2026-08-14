"""Tests for core.agents.registry (WO-25)."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.agents.registry import (
    effective_agents,
    ensure_seeded,
    load_seed,
    set_agent_enabled,
)
from core.models.orm import AgentState, Base


@pytest.fixture
def db_session(tmp_path):
    db_path = tmp_path / "test_registry.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_load_seed_valid():
    """1. load_seed 加载 13 项，key 唯一，category/status 枚举合法。"""
    seeds = load_seed()
    assert len(seeds) == 13
    keys = [s["key"] for s in seeds]
    assert len(keys) == len(set(keys))
    for s in seeds:
        assert s["category"] in ("agent", "tool")
        assert s["status"] in ("available", "pending")
    # Verify agent-calculator exists
    calc = next((s for s in seeds if s["key"] == "agent-calculator"), None)
    assert calc is not None
    assert calc["status"] == "available"


def test_ensure_seeded_idempotent(db_session):
    """2. ensure_seeded 幂等（跑两次不重复插入）。"""
    ensure_seeded(db_session)
    count1 = db_session.query(AgentState).count()
    assert count1 == 13

    ensure_seeded(db_session)
    count2 = db_session.query(AgentState).count()
    assert count2 == 13


def test_effective_agents_initial(db_session):
    """3. effective_agents 初始 enabled == enabled_default。"""
    ensure_seeded(db_session)
    items = effective_agents(db_session)
    assert len(items) == 13
    email_tool = next(i for i in items if i["key"] == "tool-email")
    assert email_tool["enabled"] is False  # default false
    intake_agent = next(i for i in items if i["key"] == "agent-intake")
    assert intake_agent["enabled"] is True  # default true


def test_set_agent_enabled_update(db_session):
    """4. set_agent_enabled 更新后 effective 反映新值。"""
    ensure_seeded(db_session)
    updated = set_agent_enabled(db_session, "agent-calculator", False)
    assert updated is not None
    assert updated["enabled"] is False

    items = effective_agents(db_session)
    calc = next(i for i in items if i["key"] == "agent-calculator")
    assert calc["enabled"] is False


def test_set_agent_enabled_unknown_key(db_session):
    """5. set_agent_enabled 未知 key → None。"""
    ensure_seeded(db_session)
    res = set_agent_enabled(db_session, "non-existent-agent", False)
    assert res is None


def test_effective_agents_missing_yaml(db_session, monkeypatch, tmp_path):
    """6. agents.yaml 缺失（monkeypatch 路径）→ effective_agents 空列表不抛。"""
    missing_path = tmp_path / "non_existent_agents.yaml"
    res = effective_agents(db_session, seed_path=missing_path)
    assert res == []
