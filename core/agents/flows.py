"""流程包注册表 — config/agent_flows/*.yaml 加载/校验/触发匹配（WO-26）。"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from core.logger import get_logger

logger = get_logger(__name__)

FLOW_DIR: Path = Path(__file__).resolve().parents[2] / "config" / "agent_flows"

_ALLOWED_PRESENTATIONS = frozenset({"result_card", "dialog"})
_TOOL_WHITELIST = frozenset({
    "declaration_check",
    "calculator_assess",
    "policy_check",
    "context_event_write",
})


def flow_tool_whitelist() -> frozenset[str]:
    """白名单：declaration_check / calculator_assess / policy_check / context_event_write。"""
    return _TOOL_WHITELIST


def load_flows() -> dict[str, dict]:
    """读取全部 *.yaml 流程包；校验：key 唯一、presentation ∈ {result_card, dialog}、
    steps 非空且每步 tool 在白名单。失败抛 ValueError。
    FLOW_DIR 缺失或损坏降级返回 {}。
    """
    if not FLOW_DIR.exists() or not FLOW_DIR.is_dir():
        logger.warning("FLOW_DIR does not exist or is not a directory: %s", FLOW_DIR)
        return {}

    flows: dict[str, dict] = {}
    yaml_files = sorted(list(FLOW_DIR.glob("*.yaml")) + list(FLOW_DIR.glob("*.yml")))
    if not yaml_files:
        return {}

    for file_path in yaml_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to load flow yaml %s: %s", file_path, exc)
            continue

        if not isinstance(data, dict):
            continue

        key = data.get("key")
        if not key or not isinstance(key, str):
            raise ValueError(f"Flow in {file_path} missing valid 'key'")

        if key in flows:
            raise ValueError(f"Duplicate flow key found: {key}")

        presentation = data.get("presentation")
        if presentation not in _ALLOWED_PRESENTATIONS:
            raise ValueError(f"Flow {key} has invalid presentation: {presentation!r}")

        steps = data.get("steps")
        if not isinstance(steps, list) or len(steps) == 0:
            raise ValueError(f"Flow {key} steps must be a non-empty list")

        for idx, step in enumerate(steps):
            if not isinstance(step, dict):
                raise ValueError(f"Flow {key} step [{idx}] must be a dict")  # noqa: TRY004
            tool = step.get("tool")
            if tool not in _TOOL_WHITELIST:
                raise ValueError(f"Flow {key} step [{idx}] tool '{tool}' not in whitelist")

        flows[key] = data

    return flows


def match_flow(message: str) -> dict | None:
    """规则触发：消息包含任一 triggers 关键词 → 返回流程包 dict；否则 None。
    匹配大小写不敏感；triggers 含正则时用 re.search。
    """
    if not message:
        return None

    try:
        flows = load_flows()
    except ValueError as exc:
        logger.warning("Failed to load flows during match: %s", exc)
        return None

    for flow in flows.values():
        triggers = flow.get("triggers", [])
        for trig in triggers:
            if not trig or not isinstance(trig, str):
                continue
            try:
                if re.search(trig, message, re.IGNORECASE):
                    return flow
            except re.error:
                if trig.lower() in message.lower():
                    return flow

    return None
