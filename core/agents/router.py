"""意图路由 — LLM 选流程包 + 规则兜底（WO-30）。

两阶段：规则唯一命中 → 直接走（不调 LLM）；撞车（≥2 命中）→ LLM 从候选选一个；
零命中 → None（不调 LLM）。LLM 失败/未知 key → 回退规则首个命中。
红线：出站前脱敏、入站还原；缓存纪律：候选 prompt 纯函数、无时间戳。
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from core.agents.flows import load_flows, match_flows
from core.ai.gateway import ApiCallResult, ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import AiUsageLog
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_SYSTEM_PROMPT = "你是澳洲贷款经纪的流程路由。根据用户消息从流程包中选最匹配的一个；都不匹配返回 none。只输出 JSON。"


def _candidate_prompt(flows: dict[str, dict]) -> str:
    """稳定候选清单（缓存纪律：无动态内容）。"""
    lines = [f"- {key}：{f.get('name', key)} — {f.get('description', '')}" for key, f in flows.items()]
    return "\n".join(lines)


def _log_usage(db: Session, case_id: str | None, result: ApiCallResult) -> None:
    """路由调用用量（layer=router；失败仅 warning）。"""
    try:
        db.add(AiUsageLog(
            case_id=case_id,
            scope="case" if case_id else "global",
            track="internal",
            provider=result.provider_used,
            model=getattr(result, "model_used", None),
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            prompt_cache_hit_tokens=result.prompt_cache_hit_tokens,
            prompt_cache_miss_tokens=result.prompt_cache_miss_tokens,
            cost_usd=result.cost_usd,
            latency_ms=result.latency_ms,
            layer_names=json.dumps(["router"], ensure_ascii=False),
        ))
        db.commit()
    except Exception:  # 用量记录失败不阻断
        logger.warning("failed to write router usage", exc_info=True)


def _llm_pick(message: str, flows: dict[str, dict], db: Session, case_id: str | None) -> str | None:
    """脱敏 → LLM 分类 → 还原 → 返回 flow_key 或 None（任何失败 → None）。"""
    scope = case_id or "global"
    safe = desensitize(message, scope, db)
    prompt = f"流程包：\n{_candidate_prompt(flows)}\n\n用户消息：{safe}\n\n只输出 {{\"flow_key\": \"<key>\"}} 或 {{\"flow_key\": \"none\"}}"
    try:
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(prompt),
            prompt_template="请从流程包中选择最匹配的一个。",
            system_prompt=_SYSTEM_PROMPT,
            prefer_provider=None,
        )
        raw = rehydrate(result.response_text, scope, db).strip()
        start, end = raw.index("{"), raw.rindex("}")
        data = json.loads(raw[start:end + 1])
        key = str(data.get("flow_key", "none"))
        _log_usage(db, case_id, result)
        return key if key in flows else None
    except Exception:  # 路由失败回退规则
        logger.warning("intent router LLM failed, fallback to rules", exc_info=True)
        return None


def route_flow(message: str, db: Session, case_id: str | None = None) -> dict | None:
    """两阶段意图路由：规则唯一命中直接走；撞车走 LLM；失败/关闭回退规则；零命中 None。"""
    if not message:
        return None
    flows = load_flows()
    if not flows:
        return None
    hits = match_flows(message)
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        routing = getattr(get_config().settings.ai, "routing", None)
        if routing is not None and routing.intent_routing_enabled:
            try:
                key = _llm_pick(message, flows, db, case_id)
            except Exception:  # noqa: BLE001 — LLM 路由失败规则保底
                key = None
            if key in flows:
                return flows[key]
        return hits[0]  # LLM 不可用/失败 → 规则保底（首个命中）
    return None