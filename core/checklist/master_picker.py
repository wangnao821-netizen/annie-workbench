"""全量清单主库预选器 — AI/规则从全集为案件画像挑选清单项。

三层模型（design §4.2）：
    全集 →（此处：规则硬过滤 + AI 排序/补理由）→ AI 预选（15-25 项）→ Vera 微调

规则：
    1. 按 applicable_when（residency / employment_type / purpose /
       deposit_source_includes / income_sources）与 bank_specific 硬过滤；
    2. use_ai=True 时再用 LLM 做排序与理由补充（输入经 desensitize 脱敏），
       AI 失败自动回退到纯规则结果。
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

_DEFAULT_CASE_INFO = {
    "lender": "CBA",
    "employment_type": "PAYG",
    "residency": "PR",
    "purpose": "Purchase",
}

# 每个条件的值都转小写比较，兼容 "SelfEmployed"/"self_employed" 等写法
_SIZE_MIN, _SIZE_MAX = 15, 25


def _load_master() -> list[dict]:
    """读取 config/checklist_master.yaml 的 items 列表。

    直接按模块路径定位，避免依赖配置加载（离线/测试环境可用）。
    """
    path = _PROJECT_ROOT / "config" / "checklist_master.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data["items"]


def _norm(text: object) -> str:
    return str(text or "").strip().lower()


def _matches_bank_specific(item: dict, lender: str) -> bool:
    bs = item.get("bank_specific")
    if not bs:
        return True
    return _norm(bs) == _norm(lender)


def _matches_applicable_when(item: dict, case_info: dict) -> bool:
    """applicable_when 条件判断：{ all: true } 永远适用，多键同时满足。"""
    aw = item.get("applicable_when") or {}
    if not aw or aw.get("all") is True:
        return True

    if "residency" in aw:
        res = _norm(case_info.get("residency") or _DEFAULT_CASE_INFO["residency"])
        if res not in {_norm(r) for r in aw["residency"]}:
            return False

    if "employment_type" in aw:
        emp = _norm(case_info.get("employment_type") or _DEFAULT_CASE_INFO["employment_type"])
        if not emp or emp not in {_norm(e) for e in aw["employment_type"]}:
            return False

    if "purpose" in aw:
        purpose = _norm(case_info.get("purpose") or _DEFAULT_CASE_INFO["purpose"])
        if purpose not in {_norm(p) for p in aw["purpose"]}:
            return False

    if "deposit_source_includes" in aw:
        sources = {_norm(s) for s in (case_info.get("deposit_source_includes") or [])}
        if not sources or not any(_norm(s) in sources for s in aw["deposit_source_includes"]):
            return False

    if "income_sources" in aw:
        sources = {_norm(s) for s in (case_info.get("income_sources") or [])}
        if not any(_norm(s) in sources for s in aw["income_sources"]):
            return False

    return True


def _rule_pick(items: list[dict], case_info: dict) -> list[dict]:
    """纯规则预选：硬过滤后全部标为必选，reason 给默认说明。"""
    picked: list[dict] = []
    for it in items:
        if not _matches_bank_specific(it, case_info.get("lender")):
            continue
        if not _matches_applicable_when(it, case_info):
            continue
        picked.append({
            "id": it["id"],
            "name_zh": it.get("name_zh", it["id"]),
            "required": True,
            "reason": "根据案件画像与银行政策为必选材料",
        })
    return picked


def _ai_order(picked: list[dict], case_info: dict, db: Session) -> list[dict]:
    """AI 补充理由与排序（输入脱敏，输出按 id 映射回原清单）。"""
    case_key = case_info.get("case_id") or "SYS"
    profile = (
        f"lender={case_info.get('lender')}; emp={case_info.get('employment_type')}; "
        f"res={case_info.get('residency')}; purpose={case_info.get('purpose')}; "
        f"deposit={','.join(case_info.get('deposit_source_includes') or [])}; "
        f"income={','.join(case_info.get('income_sources') or [])}"
    )
    safe_profile = desensitize(profile, case_key, db)
    candidates = ", ".join(f"{p['id']}|{p['name_zh']}" for p in picked)

    prompt = (
        "你是澳洲贷款经纪助手。根据案件画像从候选清单项中选择最重要且适用的 "
        f"{_SIZE_MIN}-{_SIZE_MAX} 项，给出简短中文理由。\n"
        f"画像: {safe_profile}\n候选: {candidates}\n"
        "只返回 JSON 数组，格式: "
        '[{"id": "...", "required": true, "reason": "..."}]'
    )
    gw = ApiGateway(get_config())
    result = gw.call_llm(
        text=DesensitizedText(prompt),
        prompt_template="Select and rank checklist items as JSON.",
    )
    raw = result.response_text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    rows = json.loads(raw)

    by_id = {p["id"]: p for p in picked}
    ordered: list[dict] = []
    for row in rows:
        pid = row.get("id")
        if pid not in by_id:
            continue
        item = dict(by_id[pid])
        item["required"] = bool(row.get("required", True))
        item["reason"] = rehydrate(str(row.get("reason", item["reason"])), case_key, db) or item["reason"]
        ordered.append(item)
        if len(ordered) >= _SIZE_MAX:
            break
    if len(ordered) >= _SIZE_MIN:
        return ordered
    raise ValueError("AI 返回项数不足，回退纯规则")


def pick_checklist(case_info: dict, db: Session, use_ai: bool = True) -> list[dict]:
    """从全集按案件画像预选 15-25 项。

    Args:
        case_info: 案件画像 {lender, employment_type, residency, purpose,
            deposit_source_includes, income_sources, case_id, ...}
        db: SQLAlchemy session（AI 脱敏用）。
        use_ai: True 时用 LLM 排序/补理由，失败回退纯规则。

    Returns:
        [{"id", "name_zh", "required", "reason"}, ...]（15-25 项）
    """
    items = _load_master()
    picked = _rule_pick(items, case_info)
    if not picked or len(picked) < _SIZE_MIN:
        return picked

    if not use_ai:
        return picked[:_SIZE_MAX]

    try:
        return _ai_order(picked, case_info, db)
    except (Exception, SystemExit) as exc:  # noqa: BLE001 — AI 失败回退纯规则，不阻断流程
        logger.warning("AI checklist pre-selection failed, fallback to rules: %s", exc)
        return picked[:_SIZE_MAX]