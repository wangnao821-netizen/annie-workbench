"""WO-21 档案加载与校验（契约 §一）。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import yaml

from .models import ProfileInfo

_CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config" / "calculator"
_KNOWN_BANKS = {"boc", "cba", "macquarie", "ma_money", "latrobe", "resimac"}
_VALID_STATES = {"NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"}


class ProfileError(ValueError):
    """档案配置缺失/非法。"""


def profile_version(bank: str) -> str:
    return hashlib.sha256(f"calculator:{bank}".encode()).hexdigest()[:12]


def _require(mapping: dict, *keys: str) -> None:
    for key in keys:
        if key not in mapping:
            raise ProfileError(f"profile missing required key: {key}")


def _require_tax(tax: dict) -> None:
    _require(tax, "brackets", "lito", "medicare")
    for bracket in tax["brackets"]:
        if len(bracket) != 3:
            raise ProfileError(f"bad bracket: {bracket}")
    lows = [0.0] + [float(b[0]) for b in tax["brackets"][:-1]]
    for (upper, _rate, carry), low in zip(tax["brackets"], lows):
        if not (float(carry) >= 0.0):
            raise ProfileError(f"negative carry: {carry}")


def _require_hem(hem: dict) -> None:
    _require(hem, "income_bands", "families")
    bands = hem["income_bands"]
    families = hem["families"]
    if not bands or not families:
        raise ProfileError("empty hem_table")
    for values in families.values():
        if len(values) != len(bands):
            raise ProfileError("hem family values length != income_bands length")


def _require_result(result: dict) -> None:
    indicator = result.get("indicator")
    if indicator not in ("nis", "surplus_sign", "nsr", "dscr", "ndi", "max_loan_only"):
        raise ProfileError(f"unknown result.indicator: {indicator}")
    _require(result, "max_loan")


def _validate(mapping: dict) -> None:
    _require(mapping, "bank", "source_file", "source_version", "effective_from",
             "profile_version", "parameters")
    params = mapping["parameters"]
    _require(params, "assessment", "income_rules", "tax", "living", "commitments",
             "result")
    assessment = params["assessment"]
    _require(assessment, "buffer", "floor")
    if "options" in mapping:
        hem_weekly = mapping["options"].get("hem_weekly")
        if hem_weekly is None:
            hem_weekly = params["living"].get("hem_weekly", False)
    else:
        hem_weekly = bool(params["living"].get("hem_weekly", False))
    _require(assessment, "extra") if "extra" in assessment else None
    _require_tax(params["tax"])
    _require_hem(params["living"].get("hem_table", params["living"]))
    _require_result(params["result"])
    for commitment_type in ("credit_card", "overdraft", "rental", "commitment_floor"):
        if commitment_type in params["commitments"] and isinstance(
                params["commitments"][commitment_type], list) and not \
                params["commitments"][commitment_type]:
            raise ProfileError(f"empty commitments.{commitment_type}")
    state = mapping.get("parameters", {}).get("result", {}).get("stamp_duty")
    if state is not None and state not in _VALID_STATES:
        raise ProfileError(f"unknown state: {state}")


def load_profile(bank: str) -> dict:
    """加载并校验单个银行档案（带内容哈希）。"""
    if bank not in _KNOWN_BANKS:
        raise ProfileError(f"unknown bank: {bank}")
    path = _CONFIG_DIR / f"{bank}.yaml"
    if not path.exists():
        raise ProfileError(f"profile not found: {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    _validate(data)
    data["_hash"] = hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    return data


def list_profiles() -> list[ProfileInfo]:
    out: list[ProfileInfo] = []
    for bank in _KNOWN_BANKS:
        try:
            data = load_profile(bank)
        except ProfileError:
            continue
        out.append(ProfileInfo(
            bank=bank,
            name=data["name"],
            source_file=data["source_file"],
            source_version=str(data["source_version"]),
            source_date=None,
            effective_from=data["effective_from"],
            profile_version=data["profile_version"],
            version=data["_hash"],
        ))
    return out
