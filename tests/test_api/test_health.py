"""健康检查配置探针测试（Phase 2 收口：config_ok / missing_config）。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.main import app


def test_health_ok_when_env_set(monkeypatch):
    monkeypatch.setenv("CLIENT_FILES_ROOT", "C:/tmp/clients")
    monkeypatch.setenv("ENV", "development")
    resp = TestClient(app).get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["config_ok"] is True
    assert body["missing_config"] == []


def test_health_reports_missing_env(monkeypatch):
    monkeypatch.delenv("CLIENT_FILES_ROOT", raising=False)
    monkeypatch.setenv("ENV", "development")
    resp = TestClient(app).get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["config_ok"] is False
    assert "CLIENT_FILES_ROOT" in body["missing_config"]
