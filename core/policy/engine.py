"""政策库规则引擎 — 只读 lender_policies.yaml，规则判断不依赖 LLM（#14）。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session  # noqa: F401 — 契约头保留，预留 db 用途

from core.logger import get_logger

logger = get_logger(__name__)

# 规则表：employment_type → (min_abn_years 要求, 宽松度)
# 宽松度: strict=自雇<2yr 红 / medium=黄 / lenient=绿
_SELF_EMPLOYED_RULES = {
    "ANZ": {"min_years": 2, "strictness": "strict"},
    "NAB": {"min_years": 2, "strictness": "strict"},
    "CBA": {"min_years": 1, "strictness": "lenient"},
    "Westpac": {"min_years": 2, "strictness": "medium"},
    "Macquarie": {"min_years": 2, "strictness": "medium"},
}

# 临时签证 → 多数主流行收紧（方向性）
_TEMP_VISA_LENDERS = {"CBA", "ANZ", "NAB", "Westpac"}

# 宽松度 → 替代银行排序权重（lenient 优先，风险从低到高）
_STRICTNESS_RANK = {"lenient": 0, "medium": 1, "strict": 2}

# 模块级 yaml 缓存：路径 → lenders dict（只读）
_yaml_cache: dict[str, dict[str, Any]] = {}


@dataclass
class PolicyIssue:
    """一条政策风险/提示。"""

    level: str          # green | amber | red
    title: str          # 简短结论（如 "自雇 ABN 不足 2 年"）
    detail: str         # 一句话原因（读 yaml 的 avoid_for/special_requirements）
    suggestion: str     # 建议（如 "建议改投 CBA（接受 1 年税表）"）


@dataclass
class PolicyCheckResult:
    """政策检查结果。"""

    lender: str
    overall: str                 # green | amber | red（取最严重）
    issues: list[PolicyIssue]
    alternative_lenders: list[str]   # 按风险从低到高
    disclaimer: str = "政策会变，以银行官方为准；本提示仅供辅助参考。"


def load_lender_policies(config_dir: Path) -> dict[str, Any]:
    """读取 config/lender_policies.yaml（只读缓存）。"""
    return _load_yaml(config_dir)


def _load_yaml(config_dir: Path) -> dict[str, Any]:
    """读取并缓存 lender_policies.yaml 的 lenders 段（按 path 缓存）。"""
    path = config_dir / "lender_policies.yaml"
    if str(path) not in _yaml_cache:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            _yaml_cache[str(path)] = data.get("lenders") or {}
        except Exception as exc:  # noqa: BLE001 — 政策库缺失不影响主流程
            logger.warning("Failed to load lender policies %s: %s", path, exc)
            _yaml_cache[str(path)] = {}
    return _yaml_cache[str(path)]


def _is_self_employed(employment_type: str | None) -> bool:
    return bool(employment_type) and any(k in employment_type for k in ("自雇", "ABN", "self"))


def _match_detail(lender_data: dict[str, Any], keywords: tuple[str, ...], fallback: str) -> str:
    """从 yaml special_requirements/avoid_for 找含关键词文案，取不到用内置模板。"""
    for field_name in ("special_requirements", "avoid_for"):
        for it in lender_data.get(field_name) or []:
            if any(k in str(it) for k in keywords):
                return str(it)
    return fallback


def _self_employed_issue(strictness: str, lender_data: dict[str, Any]) -> PolicyIssue:
    """自雇按宽松度生成 issue：strict=red / medium=amber / lenient=green。"""
    detail = _match_detail(lender_data, ("自雇",), "自雇需提供 2 年税表+会计师信")
    if strictness == "strict":
        return PolicyIssue("red", "自雇要求严格（需 2 年税表）", detail, "建议改投接受 1 年税表的银行（如 CBA）")
    if strictness == "medium":
        return PolicyIssue("amber", "自雇要求较严格（需 2 年税表）", detail, "建议准备 2 年税表，或评估 CBA（接受 1 年税表）")
    return PolicyIssue("green", "自雇政策宽松（接受 add-backs）",
                       _match_detail(lender_data, ("自雇",), "自雇政策相对宽松（接受 add-backs）"),
                       "准备 1 年完整税表即可")


def check_policy(
    lender: str,
    employment_type: str | None,
    residency: str | None,
    lvr: float | None,
    loan_amount: float | None,
    property_value: float | None,
    config_dir: Path,
) -> PolicyCheckResult:
    """规则引擎主入口：按案件画像输出政策风险与替代银行建议。

    规则（V1）：自雇（含 自雇/ABN/self）对照 _SELF_EMPLOYED_RULES，strict 无 ABN 年限→red、
    lenient→green/amber；temp_visa 且 lender 在 _TEMP_VISA_LENDERS→amber；LVR > max_lvr_no_lmi
    （读 yaml）→amber、> max_lvr_with_lmi→red；无 lender 数据→green 空结果；overall 取最严重，
    alternative_lenders 按 strictness 排序（lenient 优先）。
    """
    del loan_amount, property_value  # V1 仅用 lvr，金额字段预留给后续规则
    lenders = _load_yaml(config_dir)
    lender_data = lenders.get(lender) if lender else None
    if not lender or lender_data is None:
        return PolicyCheckResult(lender=lender or "", overall="green", issues=[], alternative_lenders=[])

    issues: list[PolicyIssue] = []
    if _is_self_employed(employment_type) and _SELF_EMPLOYED_RULES.get(lender):
        issues.append(_self_employed_issue(_SELF_EMPLOYED_RULES[lender]["strictness"], lender_data))
    if residency == "temp_visa" and lender in _TEMP_VISA_LENDERS:
        issues.append(PolicyIssue(
            "amber", "临时签证需银行逐案审核",
            "临时签证在主流银行通常需逐案审核，审批可能更久或受限",
            "建议准备签证信并提前与银行确认资质",
        ))
    max_no_lmi = float(lender_data.get("max_lvr_no_lmi") or 80)
    max_with_lmi = float(lender_data.get("max_lvr_with_lmi") or 95)
    if lvr is not None:
        if lvr > max_with_lmi:
            issues.append(PolicyIssue(
                "red", f"LVR 超过 {max_with_lmi:.0f}% 需特殊产品",
                f"当前 LVR {lvr:.0f}%，超过 {max_with_lmi:.0f}% 常规上限，主流行无法承接",
                "建议追加首付降低 LVR，或评估二贷/平层等特殊产品",
            ))
        elif lvr > max_no_lmi:
            issues.append(PolicyIssue(
                "amber", f"LVR 超过 {max_no_lmi:.0f}% 需 LMI",
                f"当前 LVR {lvr:.0f}%，超过 {max_no_lmi:.0f}% 免 LMI 上限",
                "需购买房贷保险（LMI），或追加首付降至 80% 以下",
            ))
    if not issues:
        overall = "green"
    elif any(i.level == "red" for i in issues):
        overall = "red"
    elif any(i.level == "amber" for i in issues):
        overall = "amber"
    else:
        overall = "green"
    alternatives = [name for name in lenders if name != lender]
    alternatives.sort(
        key=lambda n: _STRICTNESS_RANK.get(_SELF_EMPLOYED_RULES.get(n, {}).get("strictness", "unknown"), 3)
    )
    return PolicyCheckResult(
        lender=lender, overall=overall, issues=issues, alternative_lenders=alternatives,
    )
