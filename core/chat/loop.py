"""服务端工具循环 — 非流式对话协议（#12）。"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from core.ai.gateway import ApiCallResult, ApiGateway
from core.chat.context import build_chat_layers
from core.chat.tools import TOOL_SCHEMAS, execute_tool
from core.config import get_config
from core.logger import get_logger
from core.models.orm import AiUsageLog
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

MAX_TOOL_ROUNDS = 3

_SYSTEM_PROMPT = "你是澳洲贷款经纪团队的 AI 助手。回答要具体到这个客户，不要给通用建议。"


def run_chat_with_tools(
    case_id: str | None,
    message: str,
    track: str,
    db: Session,
) -> dict:
    """组装上下文 → 脱敏 → LLM（带工具）→ 白名单执行 → 回注 → 最终回复。

    全局对话（case_id 为空）→ tool_choice="none"（只读，#2 协议）。
    工具循环最多 MAX_TOOL_ROUNDS 轮，超限截断并提示。

    Returns:
        {"reply": str, "tool_cards": list[dict], "recorded_facts": list[dict]}
    """
    # ── Agent 流程包路由（WO-26 + WO-30）：命中 → 执行流程包；未命中 → 原工具循环 ──
    from core.agents.router import route_flow
    from core.agents.runner import run_flow

    flow = route_flow(message, db, case_id=case_id)
    if flow is not None:
        args = {}  # V1：参数由前端/对话补全，流程包先做触发与卡片壳
        return run_flow(flow, case_id, args, db, track=track)

    scope = case_id or "system"
    safe_message = desensitize(message, scope, db)
    layers = build_chat_layers(case_id, safe_message, track, db)
    base_prompt = "\n\n".join(f"【{layer}】\n{text}" for layer, text in ((l["layer"], l["text"]) for l in layers))

    tool_choice = "auto" if case_id else "none"
    messages: list[dict] = []          # 追加轮次的对话消息（tool 回注）
    tool_cards: list[dict] = []
    recorded_facts: list[dict] = []
    gw = ApiGateway(get_config())
    prefer_provider = "gemini" if track == "external" else None   # 递交模式英文草稿 Gemini 优先
    layer_names = [l["layer"] for l in layers]

    for _round in range(MAX_TOOL_ROUNDS):
        prompt = base_prompt + "\n\n" + _format_tool_round(messages)
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template=prompt,
            system_prompt=_SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS if case_id else None,
            tool_choice=tool_choice,
            prefer_provider=prefer_provider,
        )
        _log_usage(db, case_id, track, result, layer_names)
        if not result.tool_calls:
            reply = rehydrate(result.response_text, scope, db)
            return {"reply": reply, "tool_cards": tool_cards, "recorded_facts": recorded_facts}
        for call in result.tool_calls:
            out = execute_tool(call.get("name", ""), call.get("arguments") or {}, case_id or "", track, db)
            messages.append({"role": "tool", "name": call.get("name"), "content": _tool_result_text(out)})
            _collect_cards(out, tool_cards, recorded_facts)
        if _round == MAX_TOOL_ROUNDS - 1:
            break

    return {
        "reply": "本轮工具调用过多，已截断。请再说一次你的需求，或直接在右栏手动记录。",
        "tool_cards": tool_cards,
        "recorded_facts": recorded_facts,
    }


def _log_usage(db, case_id, track, result: ApiCallResult, layer_names: list[str]) -> None:
    """写 ai_usage_log（token/费用/延迟/缓存命中率）。失败仅 warning，不阻断对话。"""
    try:
        db.add(AiUsageLog(
            case_id=case_id,
            scope="case" if case_id else "global",
            track=track,
            provider=result.provider_used,
            model=getattr(result, "model_used", None),
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            prompt_cache_hit_tokens=result.prompt_cache_hit_tokens,
            prompt_cache_miss_tokens=result.prompt_cache_miss_tokens,
            cost_usd=result.cost_usd,
            latency_ms=result.latency_ms,
            layer_names=json.dumps(layer_names, ensure_ascii=False),
        ))
        db.commit()
    except Exception:  # 用量记录失败不阻断对话
        logger.warning("failed to write ai_usage_log", exc_info=True)


def _format_tool_round(messages: list[dict]) -> str:
    """把 tool 回注消息序列化为文本块（无 PII：只含 event_id/status/ok 等结构化字段）。"""
    if not messages:
        return ""
    blocks = []
    for m in messages:
        name = m.get("name", "tool")
        content = m.get("content", "")
        blocks.append(f"[工具 {name} 结果]\n{content}")
    return "\n\n".join(blocks)


def _tool_result_text(out: dict) -> str:
    """把 execute_tool 结果序列化为 JSON 字符串（不包含用户原文 content，只含结构化字段）。"""
    safe = {k: v for k, v in out.items() if k != "content"}
    return json.dumps(safe, ensure_ascii=False)


def _collect_cards(out: dict, tool_cards: list[dict], recorded_facts: list[dict]) -> None:
    """record_fact low → record_confirm 卡；high → recorded_facts；attribution → 防串案建议卡；
    suggest_submission → submission_suggest 卡。"""
    if out.get("suggest"):
        tool_cards.append({
            "type": "submission_suggest",
            "title": "进入递交模式？",
            "payload": {"message": "检测到递交/写银行内容意图，要进入递交模式吗？"},
        })
        return
    if out.get("attribution"):
        attr = out["attribution"]
        tool_cards.append({
            "type": "attribution_suggest",
            "title": "这条信息看起来属于其他客户",
            "payload": {
                "content": out.get("content", ""),
                "matched_client": attr.get("matched_client", ""),
                "matched_lender": attr.get("matched_lender", ""),
                "matched_case_id": attr.get("matched_case_id", ""),
                "track": out.get("track", "internal"),
            },
        })
        return
    if not out.get("ok"):
        return
    if out.get("status") == "pending":
        tool_cards.append({
            "type": "record_confirm",
            "title": "待确认事实",
            "payload": {
                "event_id": out.get("event_id"),
                "content": out.get("content", ""),
                "source_type": out.get("source_type", "manual_note"),
                "track": out.get("track", "internal"),
                "status": "pending",
            },
        })
    elif out.get("status") == "confirmed":
        recorded_facts.append({
            "event_id": out.get("event_id"),
            "content": out.get("content", ""),
            "status": "confirmed",
        })
