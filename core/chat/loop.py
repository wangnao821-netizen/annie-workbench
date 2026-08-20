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
【按需排版与意图自适应法则 (最高优先级)】
你的回复必须严格根据 Vera 当前的最新输入类型对位作答，严禁无脑堆砌模版：
1. 【最新指令绝对焦点法则 (严禁话题滞后)】：
   - 每一轮回复必须以【Vera 当前最新指令】为 100% 绝对核心！
   - 若 Vera 切换了查询对象（例如从上一轮的“工资单”切换到本轮的“现有贷款对账单”），你必须立刻丢弃上一轮已结束的讨论焦点，直接精准对准本轮最新对象作答，严禁在开头复读上一轮的话题！
2. 【材料查验指令实事求是输出准则 (严禁反问推诿)】：
   - 当 Vera 要求“查一下文件夹里的某文件/对账单/工资单”时，直接列出已查验的事实与信贷核心风险点；
   - 严禁向 Vera 提出“要不要我现在动手”、“对账单是哪个银行的”等反问推诿式废话！直接给出专业利落的结论与核查清单即可！
3. 【能力咨询类】（如：“你能帮我做什么”、“你有什么功能”）：
   - 严禁输出任何案卷全景、卡点或配偶复议长文！直接精炼要点列出 5 大实战信贷技能。
4. 【状态/闲聊/礼貌确认类】（如：“不需要了”、“暂停”、“好的”、“收到”）：
   - 控制在 1~2 句话内干脆收尾，严禁倾泻案件卡点长文。
5. 【案卷业务深度分析类】（如：查政策、算借贷能力、下一步建议、材料核对）：
   - 采用结构化 Emoji 模块排版（📌 已查档案、📋 核查结果、🚨 核心卡点/异常点、💡 实战建议）。
6. 【多轮槽位澄清对位锁定】（如：“工资”、“PAYG”、“接受”）：
   - 立即将该答案锁定为最新事实，直接推进并输出最终对比表与复议清单，严禁再次重复询问已被回答的问题！

【强制 Markdown 表格排版规范】
当输出对比数据时，请务必输出合法的 Markdown 表格格式，表头、分隔线与每一行之间必须有独立的换行符 `\n`，确保前端完美渲染表格组件！

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
    prefer_provider = "gemini" if track == "external" else None
    from core.persona import build_system_prompt, get_runtime_persona

    rt = get_runtime_persona(db)
    system_prompt = build_system_prompt(
        key=rt.get("persona_key"),
        ai_name=rt.get("ai_name") or "Vera AI",
        user_address=rt.get("user_address") or "Vera",
    ) or _SYSTEM_PROMPT

    for _round in range(MAX_TOOL_ROUNDS):
        prompt = base_prompt + ("\n\n" + _format_tool_round(messages) if messages else "")
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template="",
            system_prompt=system_prompt,
            tools=TOOL_SCHEMAS if case_id else None,
            tool_choice=tool_choice,
            prefer_provider=prefer_provider,
            max_tokens=2500,
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
    """极速 0.8s 原生直出流式状态机：
    1. 组装五层纯净案卷上下文
    2. 原生 0.8s 首字流式涌现
    3. 支持自然语言智能分析与业务建议
    """
    yield {"event": "step", "data": {"label": "正在分析当前案卷画像与诉求...", "status": "running"}}

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

    # P2 阶段：意图前置分流器（Fast-Path + 语义分流）
    from core.chat.intent_router import ChatIntent, classify_chat_intent

    intent, intent_meta = classify_chat_intent(message, case_id, db)
    logger.info("Chat intent classified: %s (reason: %s)", intent.value, intent_meta.get("reason"))

    tool_cards: list[dict] = []
    recorded_facts: list[dict] = []
    full_reply_parts: list[str] = []

    # 1. 若为查阅文件夹/材料意图：触发 JIT 文件穿透扫描与内容提取
    if intent == ChatIntent.FOLDER_LOOKUP and case_id:
        from core.chat.tools import _folder_lookup
        lookup_res = _folder_lookup({"query": message}, case_id, db)
        if lookup_res.get("ok") and lookup_res.get("files_found"):
            yield {"event": "tool_start", "data": {"tool": "folder_lookup", "label": f"正在扫描本地文件夹并提取 {len(lookup_res['files_found'])} 份文件内容..."}}
            parsed_docs = lookup_res.get("parsed_documents", [])
            docs_summary_blocks = []
            for doc in parsed_docs:
                if doc.get("summary"):
                    docs_summary_blocks.append(f"【文件路径: {doc['rel_path']} (类型: {doc.get('doc_type', '未知')})】\n{doc['summary']}")
            if docs_summary_blocks:
                injected_docs_text = "\n\n".join(docs_summary_blocks)
                base_prompt += f"\n\n【JIT 案卷本地文件扫描与内容提取结果】\n{injected_docs_text}\n(请直接基于上述提取出的白纸黑字真实数据进行总结和风险点分析，无需再说明未提取数据)"
            _collect_cards(lookup_res, tool_cards, recorded_facts)

    # 2. 若为能力问答/闲聊状态意图：注入针对性极简响应指引
    elif intent == ChatIntent.META_HELP:
        base_prompt = f"【用户提问】\n{safe_message}\n\n【指令】请条理分明、清晰专业地向 Vera 介绍你作为信贷 AI 助手的实战核心能力（如案卷诊断、材料查验与 OCR 提取、贷款额度精算、政策匹配、催件与复议策略等），保持自信利落风格。"
    elif intent == ChatIntent.STATUS_ACK:
        base_prompt = f"【用户回复】\n{safe_message}\n\n【指令】这是简短状态/闲聊/确认指令。请用 1 句话利落回应（如确认收到指示、随时待命），绝不展开任何无关的长篇分析。"

    yield {"event": "step", "data": {"label": "Vera AI 正在生成实战建议与分析...", "status": "generating"}}

    try:
        for token_chunk in gw.call_llm_stream(
            text=DesensitizedText(base_prompt),
            prompt_template="",
            system_prompt=system_prompt,
            prefer_provider=prefer_provider,
            max_tokens=2500,
        ):
            safe_token = rehydrate(token_chunk, scope, db)
            full_reply_parts.append(safe_token)
            yield {"event": "text_chunk", "data": {"chunk": safe_token}}
    except Exception as e:
        logger.error("Live streaming failed, fallback to call_llm: %s", e)
        res = gw.call_llm(
            text=DesensitizedText(base_prompt),
            prompt_template="",
            system_prompt=system_prompt,
            prefer_provider=prefer_provider,
            max_tokens=2500,
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
    if out.get("files_found") is not None:
        tool_cards.append({
            "type": "folder_lookup",
            "title": f"案卷文件夹检索: {out.get('query', '')}",
            "payload": {
                "files": out.get("files_found", []),
                "folder_path": out.get("folder_path", ""),
                "query": out.get("query", ""),
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
