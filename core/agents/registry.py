"""能力中心注册表 — config/agents.yaml 种子 + agent_states 运行时开关（WO-25）。"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from core.models.orm import AgentState

logger = logging.getLogger(__name__)

_SEED_PATH: Path = Path(__file__).resolve().parent.parent.parent / "config" / "agents.yaml"


def load_seed(seed_path: Path | None = None) -> list[dict]:
    """读取并校验 config/agents.yaml。

    校验规则：
    1. 文件存在且 yaml 格式正确，version == 1 且 items 为列表
    2. key 唯一
    3. category ∈ {"agent", "tool"}
    4. status ∈ {"available", "pending"}
    """
    path = seed_path or _SEED_PATH
    if not path.exists():
        raise FileNotFoundError(f"配置文件不存在: {path}")

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if data.get("version") != 1 or not isinstance(data.get("items"), list):
        raise ValueError(f"{path}: version 必须为 1 且 items 为列表")

    items = data["items"]
    keys = [item.get("key") for item in items]
    if len(keys) != len(set(keys)) or any(k is None for k in keys):
        raise ValueError(f"{path}: key 必须非空且唯一")

    for item in items:
        if item.get("category") not in ("agent", "tool"):
            raise ValueError(f"{path}: key '{item.get('key')}' category 必须为 agent 或 tool")
        if item.get("status") not in ("available", "pending"):
            raise ValueError(f"{path}: key '{item.get('key')}' status 必须为 available 或 pending")
        if item.get("flow_key") is not None and not isinstance(item.get("flow_key"), str):
            raise ValueError(f"{path}: key '{item.get('key')}' flow_key 必须为字符串或 null")

    return items


def ensure_seeded(db: Session, seed_path: Path | None = None) -> None:
    """幂等：agent_states 空表时按 seed 的 enabled_default 全量插入。"""
    count = db.query(AgentState).count()
    if count > 0:
        return

    try:
        seeds = load_seed(seed_path)
    except Exception as e:  # noqa: BLE001
        logger.error(f"ensure_seeded 加载种子数据失败: {e}")
        return

    for item in seeds:
        db.add(
            AgentState(
                agent_key=str(item["key"]),
                enabled=bool(item.get("enabled_default", True)),
            )
        )
    db.commit()


def effective_agents(db: Session, seed_path: Path | None = None) -> list[dict]:
    """种子 + 运行时状态合并（state 有则覆盖 enabled），返回完整字段列表。"""
    try:
        seeds = load_seed(seed_path)
    except Exception as e:  # noqa: BLE001
        logger.error(f"effective_agents 加载种子数据失败: {e}")
        return []

    states = {s.agent_key: s.enabled for s in db.query(AgentState).all()}
    result = []
    for item in seeds:
        key = str(item["key"])
        enabled = states.get(key, bool(item.get("enabled_default", True)))
        result.append(
            {
                "key": key,
                "name": str(item.get("name", "")),
                "description": str(item.get("description", "")),
                "category": str(item.get("category", "")),
                "status": str(item.get("status", "")),
                "enabled": bool(enabled),
                "triggers": list(item.get("triggers") or []),
                "flow_key": item.get("flow_key"),
                "capability": item.get("capability"),
                "permission": item.get("permission"),
            }
        )
    return result


def set_agent_enabled(db: Session, key: str, enabled: bool, seed_path: Path | None = None) -> dict | None:
    """更新开关；未知 key 返回 None；返回合并后的完整条目。"""
    try:
        seeds = load_seed(seed_path)
    except Exception as e:  # noqa: BLE001
        logger.error(f"set_agent_enabled 加载种子数据失败: {e}")
        return None

    seed_map = {item["key"]: item for item in seeds}
    if key not in seed_map:
        return None

    state = db.query(AgentState).filter_by(agent_key=key).first()
    if state:
        state.enabled = enabled
        state.updated_at = datetime.now(UTC)
    else:
        state = AgentState(agent_key=key, enabled=enabled)
        db.add(state)
    db.commit()

    item = seed_map[key]
    return {
        "key": key,
        "name": str(item.get("name", "")),
        "description": str(item.get("description", "")),
        "category": str(item.get("category", "")),
        "status": str(item.get("status", "")),
        "enabled": enabled,
        "triggers": list(item.get("triggers") or []),
        "capability": item.get("capability"),
        "permission": item.get("permission"),
    }
