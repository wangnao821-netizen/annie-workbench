"""WO-21 上传更新闭环测试 — pending / apply(CAS) / rollback / 安全。"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml

from core.calculator import profiles as profiles_mod
from core.calculator import updates
from core.calculator.profiles import load_profile


@pytest.fixture
def env(tmp_path, monkeypatch):
    """隔离更新目录：_PROFILES_DIR/_PENDING_DIR/_SOURCES_DIR/_HISTORY_DIR → tmp。"""
    conf = tmp_path / "conf"
    data = tmp_path / "data"
    conf.mkdir()
    for f in Path("config/calculator").glob("*.yaml"):
        shutil.copy(f, conf / f.name)
    monkeypatch.setattr(profiles_mod, "_CONFIG_DIR", conf)
    monkeypatch.setattr(updates, "_PROFILES_DIR", conf)
    monkeypatch.setattr(updates, "_DATA_DIR", data)
    monkeypatch.setattr(updates, "_PENDING_DIR", data / "pending")
    monkeypatch.setattr(updates, "_SOURCES_DIR", data / "sources")
    monkeypatch.setattr(updates, "_HISTORY_DIR", data / "history")
    return {"conf": conf, "data": data}


def _boc_yaml(buffer: float | None = None) -> bytes:
    p = load_profile("boc")
    p.pop("_hash", None)
    if buffer is not None:
        p["parameters"]["assessment"]["buffer"] = buffer
    return yaml.safe_dump(p, sort_keys=False).encode()


def test_prepare_upload_writes_pending_and_hash(env):
    pid = updates.prepare_upload("boc", _boc_yaml(0.031), source_file="boc_update.yaml")
    assert len(pid) == 16
    pending = env["data"] / "pending" / f"boc-{pid}.yaml"
    assert pending.exists()
    payload = __import__("json").loads(pending.read_text(encoding="utf-8"))
    assert payload["bank"] == "boc"
    assert payload["pending_id"] == pid
    assert payload["source_file"] == "boc_update.yaml"
    # hash 一致：同一内容 → 同一 pending id（幂等）
    assert updates.prepare_upload("boc", _boc_yaml(0.031)) == pid


def test_prepare_upload_unknown_bank(env):
    with pytest.raises(ValueError, match="unknown bank"):
        updates.prepare_upload("nope", b"bank: nope\n")


def test_prepare_upload_bank_mismatch(env):
    with pytest.raises(ValueError, match="bank mismatch"):
        updates.prepare_upload("boc", b"bank: cba\n")


def test_apply_pending_missing(env):
    with pytest.raises(ValueError, match="pending not found"):
        updates.apply_pending("boc", "deadbeef12345678")


def test_apply_version_conflict_cas(env):
    pid = updates.prepare_upload("boc", _boc_yaml(0.031))
    with pytest.raises(ValueError, match="version conflict"):
        updates.apply_pending("boc", pid, expected_version="wrong-hash")


def test_apply_pending_success(env):
    before = load_profile("boc")["_hash"]
    pid = updates.prepare_upload("boc", _boc_yaml(0.031))
    res = updates.apply_pending("boc", pid, expected_version=before)
    assert res["bank"] == "boc"
    assert res["version"] != before
    assert load_profile("boc")["parameters"]["assessment"]["buffer"] == 0.031
    hist = env["data"] / "history" / f"boc-{pid}.json"
    assert hist.exists()


def test_apply_with_raw_source_snapshot(env):
    pid = updates.prepare_upload("boc", _boc_yaml(0.031))
    updates.apply_pending("boc", pid, raw_bytes=b"PK\x03\x04fake")
    snap = env["data"] / "sources" / f"boc-{pid}.xlsm"
    assert snap.read_bytes() == b"PK\x03\x04fake"


def test_rollback_success(env):
    before = load_profile("boc")["_hash"]
    pid = updates.prepare_upload("boc", _boc_yaml(0.031))
    updates.apply_pending("boc", pid, expected_version=before)
    res = updates.rollback("boc")
    assert res["bank"] == "boc"
    assert res["rolled_back"] == pid
    assert load_profile("boc")["_hash"] == before


def test_rollback_no_history(env):
    with pytest.raises(ValueError, match="no history"):
        updates.rollback("boc")


def test_rollback_unknown_pending(env):
    pid = updates.prepare_upload("boc", _boc_yaml(0.031))
    updates.apply_pending("boc", pid, expected_version=load_profile("boc")["_hash"])
    with pytest.raises(ValueError, match="no history entry"):
        updates.rollback("boc", pending_id="doesnotexist")


def test_yaml_upload_never_opens_xlsm(env, monkeypatch):
    """prepare_upload 是纯 YAML 路径：openpyxl 不应被触碰（宏红线）。"""
    import openpyxl

    called = []

    def boom(*args, **kwargs):
        called.append(True)
        raise AssertionError("openpyxl must not run on YAML upload")

    monkeypatch.setattr(openpyxl, "load_workbook", boom)
    updates.prepare_upload("boc", _boc_yaml(0.031))
    assert not called
