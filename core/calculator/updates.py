"""WO-21 上传更新闭环：pending -> apply -> rollback（契约 §五）。

目录结构（data/calculator_profiles/）：
  pending/    待生效 YAML（带 bank + version 元数据）
  sources/    已生效版本的原始文件快照
  history/    回滚时间线
并发：apply 采用 CAS —— 传入的 version 必须等于当前生效 version。
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import yaml

from .profiles import load_profile

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "calculator_profiles"
_PROFILES_DIR = Path(__file__).resolve().parent.parent.parent / "config" / "calculator"
_PENDING_DIR = _DATA_DIR / "pending"
_SOURCES_DIR = _DATA_DIR / "sources"
_HISTORY_DIR = _DATA_DIR / "history"
_VALID_BANKS = {"boc", "cba", "macquarie", "ma_money", "latrobe", "resimac"}


def _digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


def prepare_upload(bank: str, content: bytes, source_file: str = "") -> str:
    """写入 pending/<bank>-<digest>.yaml，返回 pending id。"""
    if bank not in _VALID_BANKS:
        raise ValueError(f"unknown bank: {bank}")
    data = yaml.safe_load(content.decode("utf-8"))
    if data.get("bank") != bank:
        raise ValueError(f"profile bank mismatch: {data.get('bank')} != {bank}")
    pending_id = _digest(content)
    path = _PENDING_DIR / f"{bank}-{pending_id}.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "bank": bank,
        "pending_id": pending_id,
        "source_file": source_file,
        "received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "yaml": content.decode("utf-8"),
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return pending_id


def apply_pending(bank: str, pending_id: str, expected_version: str | None = None,
                  raw_bytes: bytes | None = None) -> dict:
    """校验并替换生效 YAML。expected_version 为 CAS 乐观锁。"""
    if bank not in _VALID_BANKS:
        raise ValueError(f"unknown bank: {bank}")
    path = _PENDING_DIR / f"{bank}-{pending_id}.yaml"
    if not path.exists():
        raise ValueError(f"pending not found: {pending_id}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if expected_version is not None:
        current = load_profile(bank)
        if current.get("_hash") != expected_version:
            raise ValueError(
                f"version conflict: expected {expected_version}, "
                f"actual {current.get('_hash')}")
    content = payload["yaml"].encode("utf-8")
    path.unlink()
    target = _PROFILES_DIR / f"{bank}.yaml"
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = target.read_text(encoding="utf-8") if target.exists() else None
    if raw_bytes:
        snap = _SOURCES_DIR / f"{bank}-{pending_id}.xlsm"
        snap.parent.mkdir(parents=True, exist_ok=True)
        snap.write_bytes(raw_bytes)
    with open(target, "wb") as fh:
        fh.write(content)
    hist = _HISTORY_DIR / f"{bank}-{pending_id}.json"
    hist.parent.mkdir(parents=True, exist_ok=True)
    hist.write_text(json.dumps({
        "bank": bank, "pending_id": pending_id,
        "applied_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "from": expected_version,
        "previous_yaml": previous,
    }), encoding="utf-8")
    new_data = load_profile(bank)
    return {"bank": bank, "version": new_data["_hash"],
            "profile_version": new_data["profile_version"]}


def rollback(bank: str, pending_id: str | None = None) -> dict:
    """回滚最近一次生效（或指定 pending_id 的上一次）。恢复上一版 YAML。"""
    hist_files = sorted((_HISTORY_DIR / "").glob(f"{bank}-*.json")) if \
        _HISTORY_DIR.exists() else []
    if not hist_files:
        raise ValueError(f"no history for {bank}")
    target = hist_files[-1] if pending_id is None else \
        next((h for h in hist_files if pending_id in h.name), None)
    if target is None:
        raise ValueError(f"no history entry for pending {pending_id}")
    record = json.loads(target.read_text(encoding="utf-8"))
    if record.get("previous_yaml") is not None:
        (_PROFILES_DIR / f"{bank}.yaml").write_text(
            record["previous_yaml"], encoding="utf-8")
    snap = _SOURCES_DIR / f"{bank}-{record['pending_id']}.xlsm"
    if snap.exists():
        snap.unlink()
    target.unlink()
    return {"bank": bank, "rolled_back": record["pending_id"],
            "at": record["applied_at"]}
