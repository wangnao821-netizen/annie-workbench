"""API tests for /api/agents/ (WO-25)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.models.orm import Base
from server.deps import get_db
from server.main import app


@pytest.fixture(autouse=True)
def _api_env(monkeypatch):
    monkeypatch.setenv("ENV", "development")


@pytest.fixture
def client(test_db):
    def _override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = _override_get_db
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


def test_list_agents(client):
    """1. GET /api/agents/ → 200，15 项，含 agent-calculator。"""
    resp = client.get("/api/agents/")
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data
    agents = data["agents"]
    assert len(agents) == 15
    calc = next((a for a in agents if a["key"] == "agent-calculator"), None)
    assert calc is not None
    assert calc["status"] == "available"


def test_patch_agent_toggle(client):
    """2. PATCH enabled=false → 200，GET 反映。"""
    resp = client.patch("/api/agents/agent-calculator", json={"enabled": False})
    assert resp.status_code == 200
    item = resp.json()
    assert item["key"] == "agent-calculator"
    assert item["enabled"] is False

    get_resp = client.get("/api/agents/")
    calc = next(a for a in get_resp.json()["agents"] if a["key"] == "agent-calculator")
    assert calc["enabled"] is False


def test_patch_agent_unknown_key(client):
    """3. PATCH 未知 key → 404。"""
    resp = client.patch("/api/agents/unknown-agent-xyz", json={"enabled": False})
    assert resp.status_code == 404


def test_patch_agent_missing_enabled(client):
    """4. PATCH body 缺 enabled → 422。"""
    resp = client.patch("/api/agents/agent-calculator", json={})
    assert resp.status_code == 422


def test_patch_agent_session_persistence(tmp_path):
    """5. PATCH 后重启语义（新 session）状态保留。"""
    db_path = tmp_path / "persist.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    s1 = TestingSession()

    def _get_db1():
        yield s1

    app.dependency_overrides[get_db] = _get_db1
    c1 = TestClient(app)
    patch_res = c1.patch("/api/agents/agent-chaser", json={"enabled": True})
    assert patch_res.status_code == 200
    s1.close()

    s2 = TestingSession()

    def _get_db2():
        yield s2

    app.dependency_overrides[get_db] = _get_db2
    c2 = TestClient(app)
    get_res = c2.get("/api/agents/")
    chaser = next(a for a in get_res.json()["agents"] if a["key"] == "agent-chaser")
    assert chaser["enabled"] is True

    s2.close()
    app.dependency_overrides.clear()
    engine.dispose()


def test_agent_frontend_contract(client):
    """6. 前端契约：响应含 triggers/capability/permission 字段。"""
    resp = client.get("/api/agents/")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    for item in agents:
        assert "triggers" in item
        assert "capability" in item
        assert "permission" in item
        assert isinstance(item["triggers"], list)
