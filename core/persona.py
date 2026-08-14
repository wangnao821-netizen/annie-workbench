"""AI 人格配置加载 — 四种内置，默认 A 专业稳重型（2026-08-14 定稿）。"""

from __future__ import annotations

from pathlib import Path

import yaml

from core.logger import get_logger

logger = get_logger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_PERSONA_PATH = _PROJECT_ROOT / "config" / "persona.yaml"


def _load() -> dict:
    """读取 config/persona.yaml；缺失/损坏返回空 dict（调用方回退旧文案，不阻断）。"""
    try:
        data = yaml.safe_load(_PERSONA_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception as exc:  # noqa: BLE001 — 人格加载失败不阻断对话
        logger.warning("persona config load failed: %s", exc)
    return {}


def get_default_key() -> str:
    """默认人格 key（配置 default；缺失回退 'a'）。"""
    data = _load()
    return str(data.get("default") or "a")


def load_persona(key: str | None = None) -> dict:
    """按 key 取人格定义；key 缺失/不存在 → 默认人格；配置缺失 → 空 dict。

    Args:
        key: 人格 key（a/b/c/d）；None 用默认。

    Returns:
        {"key", "name", "role", "style", "rules": [...]}；空 dict 表示加载失败。
    """
    data = _load()
    personas: dict = data.get("personas") or {}
    target = key if key in personas else get_default_key()
    persona = personas.get(target)
    if not isinstance(persona, dict):
        return {}
    return {
        "key": str(persona.get("key", target)),
        "name": str(persona.get("name", target)),
        "role": str(persona.get("role", "")),
        "style": str(persona.get("style", "")),
        "rules": [str(r) for r in persona.get("rules", [])],
    }


def build_system_prompt(key: str | None = None) -> str:
    """拼装 Layer 1 角色 system prompt（公共规则 + 人格特征）。

    Args:
        key: 人格 key；None 用默认。

    Returns:
        完整 system prompt 字符串；配置缺失时返回空串（调用方回退旧文案）。
    """
    data = _load()
    persona = load_persona(key)
    if not persona:
        return ""

    common = [str(r) for r in data.get("common_rules", [])]
    lines: list[str] = []
    if common:
        lines.append(common[0])
        for r in common[1:]:
            lines.append(f"- {r}")
    if persona["name"]:
        lines.append(f"\n【人格：{persona['name']}｜{persona['role']}】{persona['style']}")
    for r in persona["rules"]:
        lines.append(f"- {r}")
    return "\n".join(lines)
