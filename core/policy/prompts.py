"""政策提示话术润色 — LLM 把结构化结论改写成中文一段话；失败回退模板文案（#14：LLM 只做解释）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate
from core.policy.engine import PolicyCheckResult

logger = get_logger(__name__)

_SYSTEM_PROMPT = (
    "你是贷款经纪人助手。请把结构化政策检查结论改写成一段简洁专业的中文提示，"
    "不超过 120 字，结尾提醒以银行官方为准。"
)


def _fallback_template(result: PolicyCheckResult) -> str:
    """失败回退模板：`{lender}：{overall}` + 各 issue title 拼接（不含客户名/PII）。"""
    parts = [f"{result.lender}：{result.overall}"]
    parts.extend(f"[{i.level}] {i.title}" for i in result.issues)
    return "；".join(parts)


def polish_policy_text(result: PolicyCheckResult, case_id: str, db: Session) -> str:
    """desensitize → LLM → rehydrate；失败回退「{lender}：{overall}」+ 各 issue title 拼接。"""
    try:
        structured = "；".join(
            f"[{i.level}] {i.title}：{i.detail}（{i.suggestion}）" for i in result.issues
        )
        prompt = (
            "下面是某案件的银行政策检查结论，请改写成一段连贯的中文提示，"
            "不超过 120 字，结尾一句提醒以银行官方为准。如有风险请明确说明。\n\n"
            f"银行：{result.lender}\n总体：{result.overall}\n"
            f"替代银行建议（按风险从低到高）：{', '.join(result.alternative_lenders) or '无'}\n"
            f"问题：{structured or '暂无明显风险'}"
        )
        safe = desensitize(prompt, case_id, db)
        res = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe), prompt_template="", system_prompt=_SYSTEM_PROMPT
        )
        text = (res.response_text or "").strip()
        if not text:
            return _fallback_template(result)
        return rehydrate(text, case_id, db) or _fallback_template(result)
    except Exception as exc:  # noqa: BLE001 — 润色失败降级模板，不影响端点
        logger.warning("Policy text polish failed for %s: %s (fallback template)", case_id, exc)
        return _fallback_template(result)
