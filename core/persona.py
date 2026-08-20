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


def list_personas() -> list[dict]:
    """列出全部内置人格（key/name/role/style）；配置缺失返回空列表。"""
    data = _load()
    personas: dict = data.get("personas") or {}
    result: list[dict] = []
    for key, p in personas.items():
        if isinstance(p, dict):
            result.append(
                {
                    "key": str(p.get("key", key)),
                    "name": str(p.get("name", key)),
                    "role": str(p.get("role", "")),
                    "style": str(p.get("style", "")),
                }
            )
    return result


def get_runtime_persona(db) -> dict:
    """读取运行期助手设置（system_settings：ai_name / user_address / persona_key）。

    Args:
        db: SQLAlchemy session。

    Returns:
        {"ai_name": str|None, "user_address": str|None, "persona_key": str|None}；
        读取失败时返回全 None（调用方回退默认人格，不阻断对话）。
    """
    from core.models.orm import SystemSetting

    result = {"ai_name": None, "user_address": None, "persona_key": None}
    try:
        rows = (
            db.query(SystemSetting)
            .filter(SystemSetting.key.in_(["ai_name", "user_address", "persona_key"]))
            .all()
        )
        for row in rows:
            value = (row.value or "").strip() or None
            result[row.key] = value
    except Exception:
        logger.warning("runtime persona settings load failed, fallback to defaults", exc_info=True)
    return result


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


def build_system_prompt(
    key: str | None = None,
    ai_name: str | None = None,
    user_address: str | None = None,
) -> str:
    """拼装 Layer 1 角色 system prompt（公共规则 + 人格特征 + 运行期身份称呼 + Emoji 排版）。

    Args:
        key: 人格 key；None 用默认。
        ai_name: Vera 给 AI 起的名字（仅内线使用）；缺省默认 "Vera AI"。
        user_address: 希望 AI 对经纪人的称呼；缺省默认 "Vera"。

    Returns:
        完整 system prompt 字符串。
    """
    data = _load()
    persona = load_persona(key)
    if not persona:
        return ""

    actual_ai_name = ai_name or "Vera AI"
    actual_user_address = user_address or "Vera"

    common = [str(r) for r in data.get("common_rules", [])]
    lines: list[str] = []
    if common:
        lines.append(common[0])
        for r in common[1:]:
            lines.append(f"- {r}")
    if persona["name"]:
        lines.append(f"\n【当前人格设定：{persona['name']} ｜ 角色：{persona['role']}】\n语气风格：{persona['style']}")
    for r in persona["rules"]:
        lines.append(f"- {r}")

    lines.append("\n【身份称呼规范】")
    lines.append(f"- 你的名字是「{actual_ai_name}」。")
    lines.append(f"- 你的专属服务对象是「{actual_user_address}」，请务必以亲切专业的称呼「{actual_user_address}」开头与对方沟通（例如：『{actual_user_address}，我帮您梳理了当前案件...』），绝不能用生硬的『用户』称呼。")
    lines.append("- 名字与称呼仅限内线对话；外线草稿（邮件/递交材料）绝不出现你的名字或对内部的称呼，一律以团队身份落款。")

    lines.append("\n【结构化 Emoji 视觉排版规范】")
    lines.append("请使用业务 Emoji 视觉标识作为各模块的小标题，层次分明：")
    lines.append("- 📌 **案件全景 (已知画像)**：银行、方案、贷款金额、利率、客户画像与客户目标。")
    lines.append("- 🚨 **核心卡点 (首要关注)**：估值阻断、暂停原因、政策冲突或紧急 Deadline。")
    lines.append("- 📋 **材料缺口 (按阻断优先级)**：已收材料 vs 核心缺件，指明哪项是放款硬前提。")
    lines.append("- 💡 **我的判断 & 实战建议**：给出清晰的先后顺序与破局思路。")
    lines.append("- ✉️ **建议沟通草稿 / 待确认项**：提供现成专业话术（中文思路/英文正文）或向 Vera 确认的关键信息。")

    return "\n".join(lines)
