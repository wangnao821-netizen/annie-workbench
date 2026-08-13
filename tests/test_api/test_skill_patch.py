"""tests/test_api/test_skill_patch.py — 技能草稿更新 + AI 提议拒绝（F-15 对接补丁）"""

import pytest
from fastapi.testclient import TestClient

from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_env):
    test_db = test_env["db"]

    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _manifest(key: str, name: str = "Skill") -> dict:
    return {"key": key, "name": name, "version": "1.0.0", "category": "flow", "steps": []}


def test_update_skill_draft(client):
    key = "patch_skill_1"
    assert client.post("/api/skills", json={"manifest": _manifest(key), "reason": "create"}).status_code == 201
    res = client.put(f"/api/skills/{key}", json={"manifest": {**_manifest(key, name="Updated Name"), "triggers": ["新触发"]}, "reason": "edit"})
    assert res.status_code == 200
    assert res.json()["status"] == "draft"
    detail = client.get(f"/api/skills/{key}").json()
    assert detail["name"] == "Updated Name"


def test_update_skill_active_rejected(client):
    key = "patch_skill_2"
    client.post("/api/skills", json={"manifest": _manifest(key), "reason": "create"})
    client.post(f"/api/skills/{key}/activate", json={"version": "1.0.0", "operator": "vera"})
    res = client.put(f"/api/skills/{key}", json={"manifest": _manifest(key, name="X")})
    assert res.status_code == 422  # 非 draft 不可更新


def test_reject_skill_proposal(client):
    key = "patch_prop_1"
    res = client.post("/api/skills/propose", json={"manifest": _manifest(key, "AI Skill"), "reason": "AI propose", "scope": "case"})
    assert res.status_code == 201
    rej = client.post(f"/api/skills/{key}/reject", json={"reason": "措辞太死板"})
    assert rej.status_code == 200
    assert rej.json()["status"] == "deprecated"
    detail = client.get(f"/api/skills/{key}").json()
    assert detail["reason"] == "措辞太死板"


def test_reject_no_proposal_404(client):
    res = client.post("/api/skills/no_such_prop/reject", json={"reason": "x"})
    assert res.status_code == 404