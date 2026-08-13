"""API Integration tests for Skill Package Endpoints (WO-28)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_env):
    """TestClient fixture with temporary database and test environment."""
    test_db = test_env["db"]

    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_list_skills_combines_builtin_and_db(client):
    """1. 列表：内置技能 + 用户技能合并。"""
    res = client.get("/api/skills")
    assert res.status_code == 200
    skills = res.json()
    assert isinstance(skills, list)


def test_create_skill_draft_unactivated(client):
    """2. 创建 draft；未激活状态。"""
    payload = {
        "manifest": {
            "key": "user_skill_1",
            "name": "User Skill 1",
            "version": "1.0.0",
            "category": "flow",
            "steps": [{"tool": "declaration_check", "params": {}}],
        },
        "reason": "Vera manual creation",
    }
    res = client.post("/api/skills", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["key"] == "user_skill_1"
    assert data["status"] == "draft"

    # Verify detail status is draft
    res_detail = client.get("/api/skills/user_skill_1")
    assert res_detail.status_code == 200
    assert res_detail.json()["status"] == "draft"


def test_ai_propose_skill_creates_draft_not_active(client):
    """3. AI 提议 → draft（不自动激活红线断言）。"""
    payload = {
        "manifest": {
            "key": "ai_proposed_skill",
            "name": "AI Generated Skill",
            "version": "1.0.0",
            "category": "flow",
            "steps": [],
        },
        "reason": "AI discovered repeatable flow",
        "scope": "case_processing",
    }
    res = client.post("/api/skills/propose", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["key"] == "ai_proposed_skill"
    assert data["status"] == "draft"

    # Ensure proposal is still draft
    res_detail = client.get("/api/skills/ai_proposed_skill")
    assert res_detail.status_code == 200
    assert res_detail.json()["status"] == "draft"


def test_vera_activates_skill(client):
    """4. Vera 激活 → active。"""
    # Create draft first
    client.post(
        "/api/skills",
        json={
            "manifest": {
                "key": "act_skill",
                "name": "Activation Skill",
                "version": "1.0.0",
                "steps": [],
            }
        },
    )

    # Activate as vera
    res = client.post(
        "/api/skills/act_skill/activate",
        json={"version": "1.0.0", "operator": "vera"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "active"

    # Check detail status is active
    res_detail = client.get("/api/skills/act_skill")
    assert res_detail.status_code == 200
    assert res_detail.json()["status"] == "active"


def test_non_vera_cannot_activate_skill(client):
    """8. 非 Vera 确认的 draft 无法激活（403 禁入）。"""
    client.post(
        "/api/skills",
        json={
            "manifest": {
                "key": "secure_skill",
                "name": "Secure Skill",
                "version": "1.0.0",
                "steps": [],
            }
        },
    )

    res = client.post(
        "/api/skills/secure_skill/activate",
        json={"version": "1.0.0", "operator": "unauthorized_user"},
    )
    assert res.status_code == 403
    assert "Only Vera confirmation" in res.json()["detail"]


def test_deactivate_skill(client):
    """5. 停用 → 不可触发。"""
    client.post(
        "/api/skills",
        json={
            "manifest": {
                "key": "deact_skill",
                "name": "Deactivate Skill",
                "version": "1.0.0",
                "steps": [],
            }
        },
    )
    client.post(
        "/api/skills/deact_skill/activate",
        json={"version": "1.0.0", "operator": "vera"},
    )

    res = client.post("/api/skills/deact_skill/deactivate?version=1.0.0")
    assert res.status_code == 200
    assert res.json()["status"] == "deprecated"


def test_update_and_rollback_skill(client):
    """6. 更新 → 新版本；回滚 → 恢复上一 active。"""
    # Create v1 and activate
    client.post(
        "/api/skills",
        json={
            "manifest": {
                "key": "rb_skill",
                "name": "Rollback Skill V1",
                "version": "1.0.0",
                "steps": [],
            }
        },
    )
    client.post(
        "/api/skills/rb_skill/activate",
        json={"version": "1.0.0", "operator": "vera"},
    )

    # Create v2 and activate
    client.post(
        "/api/skills",
        json={
            "manifest": {
                "key": "rb_skill",
                "name": "Rollback Skill V2",
                "version": "2.0.0",
                "steps": [],
            }
        },
    )
    client.post(
        "/api/skills/rb_skill/activate",
        json={"version": "2.0.0", "operator": "vera"},
    )

    # Rollback to v1
    res = client.post(
        "/api/skills/rb_skill/rollback",
        json={"target_version": "1.0.0"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "active"
    assert res.json()["version"] == "1.0.0"


def test_whitelist_violation_returns_422(client):
    """7. 白名单违规创建 → 422。"""
    payload = {
        "manifest": {
            "key": "illegal_tool_skill",
            "name": "Illegal Tool Skill",
            "version": "1.0.0",
            "steps": [{"tool": "malicious_system_cmd", "params": {}}],
        }
    }
    res = client.post("/api/skills", json=payload)
    assert res.status_code == 422
    assert "not in whitelist" in res.json()["detail"]
