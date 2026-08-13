"""银行主数据注册表 — 加载/校验/别名解析（WO-22）。

只读 config/bank_registry.yaml；解析只做字符串规范化，不调 LLM、不访问网络。
仅允许 import pathlib / yaml / functools。
"""

from __future__ import annotations

from pathlib import Path

import yaml

_REGISTRY_PATH: Path = Path(__file__).resolve().parent.parent / "config" / "bank_registry.yaml"
_REGISTRY: dict | None = None

_LENDER_REQUIRED = ("key", "display_name", "name_zh", "type", "adi", "tier", "sort_order", "policy_key", "platforms")
_PLATFORM_REQUIRED = ("key", "display_name", "type")
_CALC_LENDERS = 6


def _norm(text: str) -> str:
    """首尾去空白 + 内部连续空白折叠为单空格 + 小写。"""
    return " ".join(text.strip().lower().split())


def _load() -> dict:
    global _REGISTRY
    if _REGISTRY is None:
        data = yaml.safe_load(_REGISTRY_PATH.read_text(encoding="utf-8")) or {}
        _validate(data)
        _REGISTRY = data
    return _REGISTRY


def load_registry() -> dict:
    """读取并缓存 bank_registry.yaml，执行 §一 校验规则；失败抛 ValueError。"""
    return _load()


def _validate(data: dict) -> None:
    lenders = data.get("lenders") or []
    platforms = data.get("platforms") or []
    if data.get("version") != 1 or not isinstance(lenders, list) or not isinstance(platforms, list):
        raise ValueError("bank_registry.yaml: version 必须为 1 且 lenders/platforms 为列表")

    keys = [l.get("key") for l in lenders]
    if len(keys) != len(set(keys)):
        raise ValueError("bank_registry.yaml: lender key 存在重复")
    names = [l.get("display_name") for l in lenders]
    if len(names) != len(set(names)):
        raise ValueError("bank_registry.yaml: display_name 存在重复")

    blank_keys = [k for k in keys if k is None]
    for lender in lenders:
        missing = [f for f in _LENDER_REQUIRED if f not in lender]
        if missing:
            raise ValueError(f"bank_registry.yaml: lender {lender.get('key')} 缺字段 {missing}")
    if blank_keys:
        raise ValueError("bank_registry.yaml: 存在 key 为空的 lender")

    by_key = {l["key"]: l for l in lenders}
    for fixed in ("boc", "ma_money"):
        if by_key.get(fixed, {}).get("policy_key") is not None:
            raise ValueError(f"bank_registry.yaml: {fixed} 的 policy_key 必须为 null")
    calc_count = sum(1 for l in lenders if (l.get("calculator_profile") or None) is not None)
    if calc_count != _CALC_LENDERS:
        raise ValueError(f"bank_registry.yaml: calculator_profile 非 null 应恰为 {_CALC_LENDERS} 家，实际 {calc_count}")

    plat_keys = {p.get("key") for p in platforms}
    for p in platforms:
        missing = [f for f in _PLATFORM_REQUIRED if f not in p]
        if missing:
            raise ValueError(f"bank_registry.yaml: platform {p.get('key')} 缺字段 {missing}")
    for lender in lenders:
        for pk in lender.get("platforms") or []:
            if pk not in plat_keys:
                raise ValueError(f"bank_registry.yaml: lender {lender['key']} 引用了不存在的平台 {pk}")
    for required in ("mqg", "infynity", "manual"):
        if required not in plat_keys:
            raise ValueError(f"bank_registry.yaml: platforms 段缺少 {required}")


def resolve_lender_key(name: str | None) -> str | None:
    """任意写法 → 规范 key（小写下划线 slug）。匹配顺序（全部大小写不敏感、首尾去空白）：
    1) 等于某 key；2) 等于某 display_name；3) 等于某 alias（alias 匹配前把内部连续空白折叠为单空格再小写）；
    4) name_en 包含关系。无法匹配返回 None。"""
    if not name or not name.strip():
        return None
    want = _norm(name)
    data = _load()
    for lender in data["lenders"]:
        if _norm(str(lender["key"])) == want:
            return lender["key"]
    for lender in data["lenders"]:
        if _norm(str(lender["display_name"])) == want:
            return lender["key"]
    for lender in data["lenders"]:
        for alias in lender.get("aliases") or []:
            if _norm(str(alias)) == want:
                return lender["key"]
    for lender in data["lenders"]:
        if lender.get("name_en") and want in _norm(str(lender["name_en"])):
            return lender["key"]
    return None


def resolve_policy_key(name: str | None) -> str | None:
    """→ lender_policies.yaml 顶层键（display_name）。先 resolve_lender_key 再取 policy_key。"""
    key = resolve_lender_key(name)
    if not key:
        return None
    for lender in _load()["lenders"]:
        if lender["key"] == key:
            return lender.get("policy_key")
    return None


def display_name(key: str | None) -> str | None:
    """规范 key → display_name；未知返回 None。"""
    if not key:
        return None
    for lender in all_lenders():
        if lender["key"] == key:
            return lender["display_name"]
    return None


def resolve_platform_key(name: str | None) -> str | None:
    """任意写法 → 平台 key（匹配规则同 resolve_lender_key：key/display_name/alias）。"""
    if not name or not name.strip():
        return None
    want = _norm(name)
    for platform in all_platforms():
        if _norm(str(platform["key"])) == want or _norm(str(platform["display_name"])) == want:
            return platform["key"]
        for alias in platform.get("aliases") or []:
            if _norm(str(alias)) == want:
                return platform["key"]
    return None


def display_platform(key: str | None) -> str | None:
    """平台 key → display_name；未知返回 None。"""
    if not key:
        return None
    for platform in all_platforms():
        if platform["key"] == key:
            return platform["display_name"]
    return None


def all_lenders() -> list[dict]:
    """lenders 列表（按 sort_order 升序）。"""
    return sorted(_load()["lenders"], key=lambda l: l.get("sort_order", 0))


def all_platforms() -> list[dict]:
    """platforms 列表（按 yaml 顺序）。"""
    return list(_load()["platforms"])


def platforms_for_bank(key: str) -> list[str]:
    """银行 key → platforms 列表；未知返回 []。"""
    for lender in all_lenders():
        if lender["key"] == key:
            return list(lender.get("platforms") or [])
    return []


def has_calculator(key: str) -> bool:
    """bank 的 calculator_profile 非 null。"""
    for lender in all_lenders():
        if lender["key"] == key:
            return (lender.get("calculator_profile") or None) is not None
    return False


def bank_names_for_pii() -> frozenset[str]:
    """所有 display_name + name_en + aliases 的并集（供 PII 白名单生成）。"""
    names: set[str] = set()
    for lender in all_lenders():
        if lender.get("display_name"):
            names.add(lender["display_name"])
        if lender.get("name_en"):
            names.add(lender["name_en"])
        for alias in lender.get("aliases") or []:
            if alias:
                names.add(alias)
    return frozenset(names)