"""建档预填提取 — 一段话/文件 → 字段预填 + 事实（#13/#16）。"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.facts.anchors import extract_rule_facts
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

# 建档字段映射：fact_schema key → CaseCreateRequest 字段名（返回给前端预填）
_PREFILL_KEYS = {
    "identity.full_name": "client_name",
    "bank.lender": "lender",
    "loan.amount": "loan_amount",
    "property.value": "property_value",
    "property.purpose": "purpose",
    "employment.type": "employment_type",
    "identity.residency": "residency",
    "loan.rate": "interest_rate",
    "loan.goal": "client_goal",
    "special.circumstances": "special_circumstances",
}

_PREFILL_PROMPT = (
    "从客户描述中提取贷款建档字段，只输出 JSON 对象。"
    "字段只允许：client_name/lender/loan_amount/property_value/purpose/employment_type/"
    "residency/interest_rate/client_goal/special_circumstances；无法确定的字段不输出。"
    "金额为数字（去货币符号与逗号）；居住取 citizen/PR/temp_visa/other；用途取 自住/投资/转贷/建房。"
)


def build_prefill_from_text(text: str, db: Session) -> dict:
    """一段话/文件文本 → 建档预填字段 + 规则事实。

    链路：desensitize → LLM 提取（_PREFILL_KEYS 白名单）→ rehydrate → 结构化返回。
    LLM 失败 → 返回空 prefilled（不阻断）；规则锚定（bank.lender/stage.current）照常返回。

    Returns:
        {"prefilled": dict, "facts": list[dict]}
    """
    prefilled: dict = {}
    facts = extract_rule_facts(text)
    try:
        safe = desensitize(text, "prefill", db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe),
            prompt_template=_PREFILL_PROMPT + "\n\n客户描述：\n" + str(safe),
            system_prompt="你是贷款建档字段提取器，只输出 JSON。",
        )
        raw = rehydrate(result.response_text.strip(), "prefill", db)
        data = _parse_prefill_json(raw)
        prefilled = {k: v for k, v in data.items() if k in _PREFILL_KEYS.values() and v not in (None, "")}
    except Exception as exc:  # noqa: BLE001 — 提取失败降级，不阻断
        logger.warning("Prefill extraction failed, fallback: %s", exc)
    return {"prefilled": prefilled, "facts": facts}


def _parse_prefill_json(raw: str) -> dict:
    """解析 LLM 返回的 JSON 对象（容错：取首个 {…} 块）；失败返回 {}。"""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        return json.loads(text[start:end + 1])
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}