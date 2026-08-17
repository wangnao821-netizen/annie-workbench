"""AI 模型 API 配置端点测试（设置页，2026-08-18）。

覆盖：GET 状态 / PATCH 写 .env + 热重载 / 清除 / 测试连接（fake key 返回 ok=False）。
红线：key 只回显是否配置（不返回原文）；用临时 .env 文件避免污染真实配置。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

import server.api.settings as settings_mod
from server.main import app


def _make_client(tmp_path) -> tuple[TestClient, object]:
    env_file = tmp_path / "env_test"
    env_file.write_text(
        "# test env\nENV=development\nDEEPSEEK_API_KEY=sk-old\n",
        encoding="utf-8",
    )
    settings_mod._ENV_PATH = env_file  # 测试替换 .env 路径
    return TestClient(app), env_file


def test_get_ai_settings_status(tmp_path):
    client, _ = _make_client(tmp_path)
    r = client.get("/api/settings/ai")
    assert r.status_code == 200
    body = r.json()
    assert body["deepseek"]["key_configured"] is True
    assert body["gemini"]["key_configured"] is False
    assert body["deepseek"]["base_url"] is None
    # key 原文不返回
    assert "sk-old" not in r.text


def test_patch_updates_env_and_reloads(tmp_path):
    client, env_file = _make_client(tmp_path)
    r = client.patch(
        "/api/settings/ai",
        json={
            "deepseek_api_key": "sk-new",
            "gemini_api_key": "gm-key",
            "gemini_base_url": "https://proxy.example.com/v1",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["deepseek"]["key_configured"] is True
    assert body["gemini"]["key_configured"] is True
    assert body["gemini"]["base_url"] == "https://proxy.example.com/v1"
    # .env 文件已更新且保留原注释/其他键
    content = env_file.read_text(encoding="utf-8")
    assert "DEEPSEEK_API_KEY=sk-new" in content
    assert "GEMINI_API_KEY=gm-key" in content
    assert "GEMINI_API_BASE=https://proxy.example.com/v1" in content
    assert "# test env" in content
    assert "ENV=development" in content
    # key 原文不回显
    assert "sk-new" not in r.text


def test_patch_empty_clears_key(tmp_path):
    client, env_file = _make_client(tmp_path)
    r = client.patch("/api/settings/ai", json={"deepseek_api_key": ""})
    assert r.status_code == 200
    assert r.json()["deepseek"]["key_configured"] is False
    content = env_file.read_text(encoding="utf-8")
    assert "DEEPSEEK_API_KEY=sk-old" not in content


def test_test_connection_missing_key(tmp_path):
    client, _ = _make_client(tmp_path)
    r = client.post(
        "/api/settings/ai/test",
        json={"provider": "gemini", "api_key": ""},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "API Key" in r.json()["message"]


def test_test_connection_fake_key_fails_gracefully(tmp_path):
    client, _ = _make_client(tmp_path)
    r = client.post(
        "/api/settings/ai/test",
        json={"provider": "deepseek", "api_key": "sk-fake"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is False  # fake key → 认证失败，但端点正常返回


def test_reload_ai_config_no_error(tmp_path):
    client, _ = _make_client(tmp_path)
    settings_mod._reload_ai_config()  # 热重载不抛错
    assert client.get("/api/settings/ai").status_code == 200
