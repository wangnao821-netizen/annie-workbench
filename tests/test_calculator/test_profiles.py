"""WO-21 档案测试 — 6 家加载/校验、HEM 形状、stamp_duty/LMI 兜底、data 覆盖优先。"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml

from core.calculator import profiles as profiles_mod
from core.calculator.profiles import ProfileError, load_profile

ALL_BANKS = ["boc", "cba", "macquarie", "ma_money", "latrobe", "resimac"]


@pytest.fixture(scope="module")
def profiles():
    return {b: load_profile(b) for b in ALL_BANKS}


@pytest.mark.parametrize("bank", ALL_BANKS)
def test_bank_loads_and_validates(bank):
    p = load_profile(bank)
    for key in ("bank", "name", "source_file", "source_version", "source_date",
                "effective_from", "profile_version", "parameters"):
        assert key in p, f"{bank} missing {key}"
    for key in ("assessment", "income_rules", "tax", "living", "commitments",
                "result"):
        assert key in p["parameters"], f"{bank} parameters missing {key}"


@pytest.mark.parametrize("bank", ALL_BANKS)
def test_bank_source_meta_nonempty(bank, profiles):
    p = profiles[bank]
    assert p["source_file"]
    assert p["source_version"]
    assert p["effective_from"]
    assert p["parameters"]["assessment"]["buffer"] is not None
    assert p["parameters"]["assessment"]["floor"] is not None


@pytest.mark.parametrize("bank", ALL_BANKS)
def test_bank_not_indicative(bank, profiles):
    """契约：6 家银行档案由源文件机械提取，indicative 恒为 False（仅估算表为 True）。"""
    assert profiles[bank]["indicative"] is False


@pytest.mark.parametrize("bank", ALL_BANKS)
def test_hem_table_shape(bank, profiles):
    hem = profiles[bank]["parameters"]["living"]["hem_table"]
    bands = hem["income_bands"]
    families = hem["families"]
    assert len(bands) >= 5, bank
    assert families, bank
    for code, values in families.items():
        assert len(values) == len(bands), f"{bank} family {code}"
        assert all(isinstance(v, (int, float)) for v in values), f"{bank} {code}"
    # 收入档严格递增且含 0 起点
    import itertools

    assert bands[0] == 0 or bands[0] > 0
    assert all(a < b for a, b in itertools.pairwise(bands)), bank


@pytest.mark.parametrize("bank", ALL_BANKS)
def test_tax_brackets_wellformed(bank, profiles):
    brackets = profiles[bank]["parameters"]["tax"]["brackets"]
    assert len(brackets) >= 4, bank
    for upper, rate, carry in brackets:
        assert 0 <= rate <= 1, f"{bank} rate {rate}"
        assert carry >= 0, f"{bank} negative carry"
    assert brackets[-1][0] > 1_000_000, f"{bank} last upper not capped"


def test_unknown_bank_raises():
    with pytest.raises(ProfileError, match="unknown bank"):
        load_profile("nope")


def _minimal_ok():
    p = load_profile("boc")
    p.pop("_hash", None)
    return p


def test_validate_missing_required_key():
    p = _minimal_ok()
    del p["parameters"]["assessment"]
    with pytest.raises(ProfileError, match="assessment"):
        profiles_mod._validate(p)


def test_validate_hem_shape_mismatch():
    p = _minimal_ok()
    hem = p["parameters"]["living"]["hem_table"]
    first = next(iter(hem["families"]))
    hem["families"][first].pop()
    with pytest.raises(ProfileError, match="values length"):
        profiles_mod._validate(p)


def test_validate_unknown_indicator():
    p = _minimal_ok()
    p["parameters"]["result"]["indicator"] = "bogus"
    with pytest.raises(ProfileError, match="indicator"):
        profiles_mod._validate(p)


def test_stamp_duty_and_lmi_load_with_indicative():
    base = Path("config/calculator")
    sd = yaml.safe_load((base / "stamp_duty.yaml").read_text(encoding="utf-8"))
    assert set(sd["states"]) == {"NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"}
    for cfg in sd["states"].values():
        assert cfg["transfer"]
    assert "indicative" in sd["source"].lower()
    lmi = yaml.safe_load((base / "lmi_fallback.yaml").read_text(encoding="utf-8"))
    assert set(lmi["insurers"]) >= {"qbe", "genworth", "helia"}
    assert "indicative" in lmi["source"].lower()


def test_data_override_priority(monkeypatch, tmp_path):
    conf = tmp_path / "conf"
    conf.mkdir()
    for f in Path("config/calculator").glob("*.yaml"):
        shutil.copy(f, conf / f.name)
    original = load_profile("boc")
    assert original["parameters"]["assessment"]["buffer"] == 0.03
    data = yaml.safe_load(Path("config/calculator/boc.yaml").read_text(encoding="utf-8"))
    data["parameters"]["assessment"]["buffer"] = 0.041
    (conf / "boc.yaml").write_text(yaml.safe_dump(data, sort_keys=False),
                                   encoding="utf-8")
    monkeypatch.setattr(profiles_mod, "_CONFIG_DIR", conf)
    overridden = load_profile("boc")
    assert overridden["parameters"]["assessment"]["buffer"] == 0.041
