"""API tests for /api/settings/assistant（AI 助手设置，2026-08-14）。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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


def test_get_default_onboarding_needed(client):
    """1. GET 默认 → 200，onboarding_needed=true，四人格齐全。"""
    resp = client.get("/api/settings/assistant")
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_needed"] is True
    assert data["default_persona"] == "a"
    assert data["ai_name"] is None
    assert data["user_address"] is None
    assert [p["key"] for p in data["personas"]] == ["a", "b", "c", "d"]


def test_patch_saves_and_disables_onboarding(client):
    """2. PATCH 名字/称呼/人格 → 200，onboarding_needed=false，GET 反映。"""
    resp = client.patch(
        "/api/settings/assistant",
        json={"ai_name": "小V", "user_address": "Vera姐", "persona_key": "d"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ai_name"] == "小V"
    assert data["user_address"] == "Vera姐"
    assert data["persona_key"] == "d"
    assert data["onboarding_needed"] is False

    get_resp = client.get("/api/settings/assistant")
    assert get_resp.json()["persona_key"] == "d"
    assert get_resp.json()["onboarding_needed"] is False


def test_patch_invalid_persona_422(client):
    """3. PATCH 非法 persona_key → 422。"""
    resp = client.patch("/api/settings/assistant", json={"persona_key": "zzz"})
    assert resp.status_code == 422


def test_patch_empty_clears_and_onboarding_back(client):
    """4. PATCH 空字符串清除字段 → onboarding_needed 恢复 true。"""
    client.patch(
        "/api/settings/assistant",
        json={"ai_name": "小V", "user_address": "Vera姐", "persona_key": "d"},
    )
    resp = client.patch("/api/settings/assistant", json={"ai_name": ""})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ai_name"] is None
    assert data["user_address"] == "Vera姐"
    assert data["onboarding_needed"] is True
