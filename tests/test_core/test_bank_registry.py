"""WO-22 银行主数据注册表测试 — load_registry / 别名解析 / PII 红线。

数据基准来自 config/bank_registry.yaml（22 家 + 5 平台）。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from core.bank_registry import (
    all_lenders,
    bank_names_for_pii,
    display_name,
    display_platform,
    has_calculator,
    load_registry,
    platforms_for_bank,
    resolve_lender_key,
    resolve_platform_key,
    resolve_policy_key,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _all_lenders() -> list[dict]:
    return load_registry()["lenders"]


def _all_platforms() -> list[dict]:
    return load_registry()["platforms"]


class TestLoadRegistry:
    def test_load_registry_shape(self):
        data = load_registry()
        assert data["version"] == 1
        assert len(data["lenders"]) == 22
        assert len(data["platforms"]) == 5

    def test_lender_required_fields_and_unique_keys(self):
        required = {"key", "display_name", "name_zh", "type", "adi", "tier", "sort_order", "policy_key", "platforms"}
        keys = []
        for lender in _all_lenders():
            assert required <= set(lender), f"{lender.get('key')} 缺字段 {required - set(lender)}"
            keys.append(lender["key"])
        assert len(keys) == len(set(keys)), "key 应唯一"

    def test_display_name_unique_and_boc_ma_money_policy_null(self):
        names = [l["display_name"] for l in _all_lenders()]
        assert len(names) == len(set(names)), "display_name 应唯一"
        by_key = {l["key"]: l for l in _all_lenders()}
        assert by_key["boc"]["policy_key"] is None
        assert by_key["ma_money"]["policy_key"] is None


class TestResolveBankKey:
    def test_display_name_and_alias(self):
        assert resolve_lender_key("CBA") == "cba"
        assert resolve_lender_key("Commonwealth Bank") == "cba"

    @pytest.mark.parametrize("name", ["St George", "St.George", "ST GEORGE"])
    def test_st_george_variants(self, name):
        assert resolve_lender_key(name) == "st_george"

    def test_display_names(self):
        assert resolve_lender_key("ME Bank") == "me_bank"
        assert resolve_lender_key("Bank of Melbourne") == "bank_of_melbourne"
        assert resolve_lender_key("Bank of Queensland") == "boq"

    def test_chinese_and_other(self):
        assert resolve_lender_key("Bank of China") == "boc"
        assert resolve_lender_key("中国银行") == "boc"
        assert resolve_lender_key("MA Money") == "ma_money"

    def test_none_and_unknown(self):
        assert resolve_lender_key(None) is None
        assert resolve_lender_key("未知银行") is None


class TestResolvePolicyKey:
    def test_policy_key_mapping(self):
        assert resolve_policy_key("CBA") == "CBA"
        assert resolve_policy_key("st_george") == "St George"
        assert resolve_policy_key("Commonwealth Bank") == "CBA"

    def test_boc_has_no_policy(self):
        assert resolve_policy_key("Bank of China") is None


class TestDisplayName:
    def test_display_name_lookup(self):
        assert display_name("st_george") == "St George"
        assert display_name(None) is None
        assert display_name("no_such_bank") is None


class TestCalculatorOnce:
    def test_has_calculator_exactly_six(self):
        expected = {"cba", "macquarie", "boc", "ma_money", "latrobe", "resimac"}
        actual = {l["key"] for l in _all_lenders() if has_calculator(l["key"])}
        assert actual == expected


class TestResolvePlatform:
    def test_platform_aliases(self):
        assert resolve_platform_key("MoneyQuest") == "mqg"
        assert resolve_platform_key("MQG") == "mqg"
        assert resolve_platform_key("ApplyOnline") == "aol"
        assert resolve_platform_key("Finsure") == "infynity"
        assert resolve_platform_key("手动递交") == "manual"
        assert resolve_platform_key("不存在的平台") is None


class TestPiiNames:
    def test_bank_names_for_pii(self):
        names = bank_names_for_pii()
        assert names
        for expected in ("CBA", "Commonwealth Bank", "St George", "St.George", "中国银行"):
            assert expected in names


class TestConsistency:
    @pytest.mark.parametrize("key", [l["key"] for l in _all_lenders() if l["policy_key"] is not None])
    def test_display_name_matches_policy_key(self, key):
        """policy_key 非空的 lender，display_name 必须与 policy_key 逐字一致（防政策引擎 miss）。"""
        lender = next(l for l in _all_lenders() if l["key"] == key)
        assert lender["display_name"] == lender["policy_key"], (
            f"{key}: display_name={lender['display_name']!r} != policy_key={lender['policy_key']!r}"
        )

    def test_platform_refs_and_full_tier_infynity(self):
        platform_keys = {p["key"] for p in _all_platforms()}
        full_keys = []
        for lender in _all_lenders():
            for pk in lender["platforms"]:
                assert pk in platform_keys, f"{lender['key']} 引用未知平台 {pk}"
            if lender["tier"] == "full":
                full_keys.append(lender["key"])
                assert "infynity" in lender["platforms"]
        assert len(full_keys) == 9

    def test_platforms_for_bank(self):
        assert platforms_for_bank("cba") == ["mqg", "infynity"]
        assert platforms_for_bank("bendigo") == ["mqg"]
        assert platforms_for_bank("no_such") == []

    def test_all_lenders_sorted_by_sort_order(self):
        orders = [l["sort_order"] for l in all_lenders()]
        assert orders == sorted(orders)
        assert display_platform("mqg") == "MoneyQuest"
        assert display_platform(None) is None


class TestNoPii:
    def test_registry_contains_no_pii(self):
        text = (PROJECT_ROOT / "config" / "bank_registry.yaml").read_text(encoding="utf-8")
        phone = re.compile(r"(?:\+61|04|1300|1800)[\d\s\-]{7,}")
        email = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
        tfn = re.compile(r"\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b")
        assert not phone.search(text), "registry 不应含电话号码"
        assert not email.search(text), "registry 不应含邮箱"
        assert not tfn.search(text), "registry 不应含 TFN 模式"