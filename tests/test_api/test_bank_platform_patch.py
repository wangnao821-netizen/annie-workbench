"""API tests for /api/banks/{key} PATCH endpoint (WO-25)."""

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


def test_get_banks_no_override(client):
    """1. GET /api/banks/ 无覆盖时 == registry 值（vera_confirmed=false）。"""
    resp = client.get("/api/banks/")
    assert resp.status_code == 200
    banks = resp.json()["banks"]
    assert len(banks) == 22
    cba = next(b for b in banks if b["key"] == "cba")
    assert cba["vera_confirmed"] is False
    assert "mqg" in cba["platforms"]


def test_patch_bank_override(client):
    """2. PATCH cba {platforms:[mqg], vera_confirmed:true} → 200；GET cba 反映。"""
    resp = client.patch(
        "/api/banks/cba",
        json={"platforms": ["mqg"], "vera_confirmed": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "cba"
    assert data["platforms"] == ["mqg"]
    assert data["vera_confirmed"] is True

    get_resp = client.get("/api/banks/")
    cba = next(b for b in get_resp.json()["banks"] if b["key"] == "cba")
    assert cba["platforms"] == ["mqg"]
    assert cba["vera_confirmed"] is True


def test_patch_bank_unknown_key(client):
    """3. PATCH 未知 bank → 404。"""
    resp = client.patch(
        "/api/banks/unknown_bank_xyz",
        json={"platforms": ["mqg"], "vera_confirmed": True},
    )
    assert resp.status_code == 404


def test_patch_bank_invalid_platform(client):
    """4. PATCH 非法平台 key → 422（detail 含非法值）。"""
    resp = client.patch(
        "/api/banks/cba",
        json={"platforms": ["invalid_platform_key"], "vera_confirmed": True},
    )
    assert resp.status_code == 422
    assert "invalid_platform_key" in str(resp.json())


def test_patch_bank_empty_platforms(client):
    """5. PATCH platforms=[] → 422。"""
    resp = client.patch(
        "/api/banks/cba",
        json={"platforms": [], "vera_confirmed": True},
    )
    assert resp.status_code == 422


def test_patch_bank_revert(client):
    """6. 覆盖后改回（platforms 恢复原值）→ GET 反映（可逆）。"""
    # First patch override
    client.patch("/api/banks/cba", json={"platforms": ["mqg"], "vera_confirmed": True})

    # Second patch revert platforms to original list
    orig_platforms = ["mqg", "infynity"]
    resp = client.patch(
        "/api/banks/cba",
        json={"platforms": orig_platforms, "vera_confirmed": False},
    )
    assert resp.status_code == 200
    assert resp.json()["platforms"] == orig_platforms
    assert resp.json()["vera_confirmed"] is False

    get_resp = client.get("/api/banks/")
    cba = next(b for b in get_resp.json()["banks"] if b["key"] == "cba")
    assert cba["platforms"] == orig_platforms
    assert cba["vera_confirmed"] is False


def test_patch_bank_idempotent(client):
    """7. 幂等：同值重复 PATCH → 200 不变。"""
    payload = {"platforms": ["mqg"], "vera_confirmed": True}
    res1 = client.patch("/api/banks/cba", json=payload)
    assert res1.status_code == 200

    res2 = client.patch("/api/banks/cba", json=payload)
    assert res2.status_code == 200
    assert res2.json() == res1.json()
