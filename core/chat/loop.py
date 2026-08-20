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

# 工具流式事件中文标签（tool_start 逐步下发展示用）
_TOOL_LABELS = {
    "declaration_check": "正在核对申报材料一致性",
    "calculator_assess": "正在计算贷款服务能力",
    "policy_check": "正在查询银行政策",
    "context_event_write": "正在记录案件上下文",
    "draft_email": "正在起草邮件",
    "folder_lookup": "正在检索案件文件夹",
    "gap_analysis": "正在分析材料缺口",
    "task_create": "正在创建任务",
    "checklist_query": "正在查询材料清单",
    "checklist_preview": "正在预选材料清单",
    "file_ops_open": "正在打开案件文件夹",
}

_SYSTEM_PROMPT = """你是一位资深澳洲贷款经纪人助理（Loan Processor Assistant），正在为高级经纪人 Vera 提供专业的案件分析、策略建议与文案协助。

【强制称呼与语气规范】
1. 你的专属服务对象是高级贷款经纪人 Vera。你的回复必须以亲切专业的称呼「Vera」开头（例如："Vera，我帮您核对了当前案件的基本情况与关键卡点："、"收到，Vera！"）。
2. 语气敏锐、干练、温暖且极具专业素养。只给精准建议与清晰依据，不做越权决定，由 Vera 最终拍板。
3. 回答要紧密结合当前客户画像与案卷材料，直击要害，绝不给空洞通用的套话。

【强制 Emoji 结构化排版规范】
回复请务必使用 Emoji 视觉图标作为各模块的小标题，层次分明：
- 📌 **案件全景 (已知画像)**：银行、方案、贷款金额、利率、客户画像与客户目标。
- 🚨 **核心卡点 (首要关注)**：估值阻断、暂停原因、政策冲突或紧急 Deadline。
- 📋 **材料缺口 (按阻断优先级)**：列出已收项与关键缺件，指明哪些缺件会卡住审批主线。
- 💡 **我的判断 & 实战建议**：给出清晰的先后顺序与破局思路。
【极速响应与精炼高效原则】
1. 回答必须言简意赅、直击要害，绝不拖泥带水，杜绝铺垫客套与长篇大论。
2. 每个模块仅列出最关键的 1~3 条核心干货要点，单次输出严格控制在 300~500 字以内，确保 Vera 能在 3 秒内扫读并决策。
3. 除非 Vera 明确要求长篇分析或完整外发邮件，默认以精悍利落的信贷要点呈现，显著提升响应速度！

请始终保持视觉结构精致、重点突出、极速高效！"""


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
    layer_names = [l["layer"] for l in layers]
    base_prompt = "\n\n".join(f"【{layer}】\n{text}" for layer, text in ((l["layer"], l["text"]) for l in layers))

    tool_choice = "auto" if case_id else "none"
    messages: list[dict] = []          # 追加轮次的对话消息（tool 回注）
    tool_cards: list[dict] = []
    recorded_facts: list[dict] = []
    gw = ApiGateway(get_config())
    prefer_provider = "gemini" if track == "external" else None   # 递交模式英文草稿 Gemini 优先
    from core.persona import build_system_prompt, get_runtime_persona

    rt = get_runtime_persona(db)
    system_prompt = build_system_prompt(
        key=rt.get("persona_key"),
        ai_name=rt.get("ai_name") or "Vera AI",
        user_address=rt.get("user_address") or "Vera",
    ) or _SYSTEM_PROMPT

    for _round in range(MAX_TOOL_ROUNDS):
        prompt = base_prompt + "\n\n" + _format_tool_round(messages)
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template=prompt,
            system_prompt=system_prompt,
            tools=TOOL_SCHEMAS if case_id else None,
            tool_choice=tool_choice,
            prefer_provider=prefer_provider,
            max_tokens=800,
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


def run_chat_with_tools_stream(
    case_id: str | None,
    message: str,
    track: str,
    db: Session,
):
    """流式工具循环生成器：逐步发送 step、tool_start、text_chunk 和 done 事件。"""
    from core.agents.router import route_flow
    from core.agents.runner import run_flow

    # 1. 意图分析阶段
    yield {"event": "step", "data": {"label": "正在分析当前案卷诉求与画像...", "status": "running"}}

    flow = route_flow(message, db, case_id=case_id)
    if flow is not None:
        yield {"event": "step", "data": {"label": f"已匹配业务流程包「{flow.get('name', '')}」", "status": "running"}}
        flow_res = run_flow(flow, case_id, {}, db, track=track)
        reply = flow_res.get("reply", "")
        if reply:
            yield {"event": "text_chunk", "data": {"chunk": reply}}
        yield {
            "event": "done",
            "data": {
                "reply": reply,
                "tool_cards": flow_res.get("tool_cards", []),
                "recorded_facts": flow_res.get("recorded_facts", []),
                "suggested_actions": [],
            },
        }
        return

    scope = case_id or "system"
    safe_message = desensitize(message, scope, db)
    layers = build_chat_layers(case_id, safe_message, track, db)
    layer_names = [l["layer"] for l in layers]
    base_prompt = "\n\n".join(f"【{layer}】\n{text}" for layer, text in ((l["layer"], l["text"]) for l in layers))

    gw = ApiGateway(get_config())
    prefer_provider = "gemini" if track == "external" else None
    from core.persona import build_system_prompt, get_runtime_persona

    rt = get_runtime_persona(db)
    system_prompt = build_system_prompt(
        key=rt.get("persona_key"),
        ai_name=rt.get("ai_name") or "Vera AI",
        user_address=rt.get("user_address") or "Vera",
    ) or _SYSTEM_PROMPT

    # 工具调用轮次（非流式决策，逐步下发 tool_start / tool_cards；无工具则直接进入文本流式）
    tool_cards: list[dict] = []
    recorded_facts: list[dict] = []
    messages: list[dict] = []
    tool_choice = "auto" if case_id else "none"
    for _round in range(MAX_TOOL_ROUNDS):
        round_prompt = base_prompt + "\n\n" + _format_tool_round(messages)
        try:
            result = gw.call_llm(
                text=DesensitizedText(round_prompt),
                prompt_template=round_prompt,
                system_prompt=system_prompt,
                tools=TOOL_SCHEMAS if case_id else None,
                tool_choice=tool_choice,
                prefer_provider=prefer_provider,
            )
        except Exception as e:  # noqa: BLE001 — 工具轮失败降级为纯文本流式
            logger.warning("Streaming tool round failed, continue with text: %s", e)
            break
        _log_usage(db, case_id, track, result, layer_names)
        if not result.tool_calls:
            break
        for call in result.tool_calls:
            name = str(call.get("name", ""))
            yield {
                "event": "tool_start",
                "data": {"tool": name, "label": _TOOL_LABELS.get(name, name)},
            }
            out = execute_tool(name, call.get("arguments") or {}, case_id or "", track, db)
            messages.append({"role": "tool", "name": name, "content": _tool_result_text(out)})
            _collect_cards(out, tool_cards, recorded_facts)
        yield {
            "event": "tool_cards",
            "data": {"tool_cards": tool_cards, "recorded_facts": recorded_facts},
        }
        if _round == MAX_TOOL_ROUNDS - 1:
            break

    # 文本流式生成最终回复（基于含工具回注的上下文）
    final_prompt = base_prompt + "\n\n" + _format_tool_round(messages)
    full_reply_parts: list[str] = []
    try:
        for token_chunk in gw.call_llm_stream(
            text=DesensitizedText(final_prompt),
            prompt_template=final_prompt,
            system_prompt=system_prompt,
            prefer_provider=prefer_provider,
            max_tokens=800,
        ):
            safe_token = rehydrate(token_chunk, scope, db)
            full_reply_parts.append(safe_token)
            yield {"event": "text_chunk", "data": {"chunk": safe_token}}
    except Exception as e:  # noqa: BLE001 — 流式失败降级为一次性文本
        logger.error("Live streaming failed, fallback to call_llm: %s", e)
        res = gw.call_llm(
            text=DesensitizedText(final_prompt),
            prompt_template=final_prompt,
            system_prompt=system_prompt,
            prefer_provider=prefer_provider,
            max_tokens=800,
        )
        safe_fallback = rehydrate(res.response_text, scope, db)
        full_reply_parts = [safe_fallback]
        yield {"event": "text_chunk", "data": {"chunk": safe_fallback}}

    final_reply = "".join(full_reply_parts)
    yield {
        "event": "done",
        "data": {
            "reply": final_reply,
            "tool_cards": tool_cards,
            "recorded_facts": recorded_facts,
            "suggested_actions": [],
        },
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
