"""tests/test_safety/test_pai_pii.py — WO-26b 红线：脱敏/还原/pii_map 不出站"""

import time
from types import SimpleNamespace

import pytest

import core.config
from core.agents import pai
from core.agents.flows import load_flows
from core.models.orm import Case
from core.pii.gateway import desensitize


@pytest.fixture(autouse=True)
def _pai_pii_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("VERA_PAI_TEST", "1")
    core.config._cached_config = None
    pai.reset_health()


def _capture_fake(captured: dict):
    def fake_run(agent, prompt, timeout, deps=None):
        captured["prompt"] = prompt
        return SimpleNamespace(output="ok", usage=lambda: None, all_messages=list)
    return fake_run


def test_input_desensitized_before_agent(test_db, monkeypatch):
    case = Case(id="c_pii1", client_name="张三")
    test_db.add(case)
    test_db.commit()
    captured: dict = {}
    monkeypatch.setattr(pai, "_run_agent", _capture_fake(captured))
    args = {"request": "客户电话 0412 345 678 想买房子"}
    pai.run_flow_with_pai(load_flows()["calculator"], "c_pii1", args, test_db)
    assert "0412 345 678" not in captured["prompt"]


def test_output_rehydrated(test_db, monkeypatch):
    case = Case(id="c_pii2", client_name="李四")
    test_db.add(case)
    test_db.commit()
    token = desensitize("0412 345 678", "c_pii2", test_db)
    captured: dict = {}
    monkeypatch.setattr(pai, "_run_agent", _capture_fake(captured))
    fake = SimpleNamespace(output=f"客户电话 {token} 已确认", usage=lambda: None, all_messages=list)
    monkeypatch.setattr(pai, "_run_agent", lambda a, p, t, d: fake)
    res = pai.run_flow_with_pai(load_flows()["calculator"], "c_pii2", {}, test_db)
    assert res is not None
    assert "0412 345 678" in res["reply"]


def test_pii_map_not_in_prompt(test_db, monkeypatch):
    case = Case(id="c_pii3", client_name="王五")
    test_db.add(case)
    test_db.commit()
    desensitize("0412 345 678", "c_pii3", test_db)
    captured: dict = {}
    monkeypatch.setattr(pai, "_run_agent", _capture_fake(captured))
    pai.run_flow_with_pai(load_flows()["calculator"], "c_pii3", {"request": "客户电话 0412 345 678"}, test_db)
    assert "0412 345 678" not in captured["prompt"]


def test_desensitization_chain_survives_provider_switch(test_db, monkeypatch):
    case = Case(id="c_pii4", client_name="赵六")
    test_db.add(case)
    test_db.commit()
    prompts: list[str] = []
    calls = {"n": 0}

    def fake_run(agent, prompt, timeout, deps=None):
        prompts.append(prompt)
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("gemini down")
        return SimpleNamespace(output="ok", usage=lambda: None, all_messages=list)

    monkeypatch.setattr(pai, "_run_agent", fake_run)
    flow = load_flows()["calculator"]
    args = {"request": "写一封英文邮件 客户电话 0412 345 678"}
    assert pai.run_flow_with_pai(flow, "c_pii4", args, test_db) is None
    pai._gemini_skipped_until = time.time() + 999  # 模拟 Gemini 被健康探测跳过
    assert pai.run_flow_with_pai(flow, "c_pii4", args, test_db) is not None
    for p in prompts:
        assert "0412 345 678" not in p
