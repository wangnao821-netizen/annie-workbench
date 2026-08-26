"""服务端工具循环 — 非流式对话协议（#12）。"""

from __future__ import annotations

import json
import re

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

_SYSTEM_PROMPT = (
    "你是一位资深澳洲贷款经纪人助理（Loan Processor Assistant），"
    "正在为高级经纪人 Vera 提供专业的案件分析、策略建议与文案协助。\n\n"
    "【按需排版法则（最高优先级）】\n"
    "回复复杂度必须匹配问题复杂度，严禁所有问题套同一个模板：\n\n"
    "■ 秒答档（≤2 句话）：\n"
    "  适用：事实查询、是非判断、确认收尾、简单状态、闲聊礼貌\n"
    "  要求：直接给答案 + 最多一句关键补充。不用 emoji 标题、不分段。\n\n"
    "■ 聚焦档（3~8 行）：\n"
    "  适用：单项查验、单个政策查询、文件核对、下一步建议、能力咨询\n"
    "  要求：结论先行，列关键数据，有风险就提，没风险不凑。不套固定模板。\n\n"
    "■ 结构化档（表格/多段）：\n"
    "  适用：多银行对比、综合策略推演、完整材料审计、复杂案件诊断\n"
    "  要求：可用表格和 emoji 标题分区，但每段必须有实质内容，不凑段落。\n\n"
    "通用约束：\n"
    "- 结论先行：先给答案/判断，再给理由，不铺垫客套。\n"
    "- emoji 标题只用于需要视觉分区的长回复（结构化档），短回复禁用。\n"
    "- 若 Vera 切换了话题，立即跟进新话题，严禁复读上一轮。\n"
    "- 材料查验直接给事实与风险点，严禁反问推诿。\n"
    "- 槽位澄清立即锁定为最新事实并推进，严禁重复询问已回答的问题。\n"
    "- 草稿类输出（邮件/Notes）直接给正文，不在前面加分析段落。\n\n"
    "【强制 Markdown 表格排版规范】\n"
    "当输出对比数据时，请务必输出合法的 Markdown 表格格式，"
    "表头、分隔线与每一行之间必须有独立的换行符，确保前端完美渲染表格组件！\n\n"
    "请始终保持视觉结构精致、重点突出、极速高效！"
)


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
    prefer_provider = "gemini" if track == "external" else None
    from core.persona import build_system_prompt, get_runtime_persona

    gw = ApiGateway(get_config())
    rt = get_runtime_persona(db)
    system_prompt = build_system_prompt(
        key=rt.get("persona_key"),
        ai_name=rt.get("ai_name") or "Annie",
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
    base_prompt = "\n\n".join(f"【{layer}】\n{text}" for layer, text in ((l["layer"], l["text"]) for l in layers))

    gw = ApiGateway(get_config())
    prefer_provider = "gemini" if track == "external" else None
    from core.persona import build_system_prompt, get_runtime_persona

    rt = get_runtime_persona(db)
    system_prompt = build_system_prompt(
        key=rt.get("persona_key"),
        ai_name=rt.get("ai_name") or "Annie",
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
        yield {"event": "tool_start", "data": {"tool": "folder_lookup", "label": _TOOL_LABELS.get("folder_lookup", "正在检索案件文件夹")}}
        lookup_res = execute_tool("folder_lookup", {"query": message}, case_id, track, db)
        if lookup_res.get("ok") and lookup_res.get("files_found"):
            parsed_docs = lookup_res.get("parsed_documents", [])
            docs_summary_blocks = []
            for doc in parsed_docs:
                if doc.get("summary"):
                    docs_summary_blocks.append(f"【文件路径: {doc['rel_path']} (类型: {doc.get('doc_type', '未知')})】\n{doc['summary']}")
            if docs_summary_blocks:
                injected_docs_text = "\n\n".join(docs_summary_blocks)
                base_prompt += f"\n\n【JIT 案卷本地文件扫描与内容提取结果】\n{injected_docs_text}\n(请直接基于上述提取出的白纸黑字真实数据进行总结和风险点分析，无需再说明未提取数据)"
        _collect_cards(lookup_res, tool_cards, recorded_facts)
        if tool_cards:
            yield {"event": "tool_cards", "data": tool_cards}

    elif intent == ChatIntent.CALCULATOR_ASSESS and case_id:
        try:
            from core.chat.slot_extractor import (
                extract_financial_slots,
                llm_extract_slots,
            )
            from core.chat.tools import _calculator_assess
            from core.facts.slots import set_slot_fact

            slots = extract_financial_slots(message, db, case_id)
            if slots.get("confidence") != "high":
                llm_slots = llm_extract_slots(message, "calculator_assess", case_id, db)
                if llm_slots:
                    for k in ("target_loan", "spouse_income", "interest_rate", "employment_income"):
                        if llm_slots.get(k) is not None:
                            slots[k] = llm_slots[k]

            # 关键槽位写入 BrainFact（P3 持久化落库）
            if slots.get("spouse_income") is not None:
                set_slot_fact(case_id, "applicant.spouse_income", slots["spouse_income"], db, category="applicant")
            if slots.get("target_loan") is not None:
                set_slot_fact(case_id, "loan.target_amount", slots["target_loan"], db, category="loan")

            res = _calculator_assess({**slots, "request": message}, case_id, db)
            if res.get("card"):
                tool_cards.append(res["card"])
                yield {"event": "tool_cards", "data": [res["card"]]}
            if res.get("summary"):
                base_prompt += f"\n\n【贷款额度测算结果】\n{res['summary']}"
        except Exception as te:  # noqa: BLE001
            logger.warning("calculator_assess branch failed (non-fatal): %s", te)
            base_prompt += f"\n\n【贷款额度测算提示】工具调用暂不可用: {te}"

    elif intent == ChatIntent.TASK_CREATE and case_id:
        try:
            from core.chat.slot_extractor import extract_task_slots
            from core.chat.tools import TOOL_SCHEMAS, _create_task

            # 1. 轨道 A：先尝试规则快路径 (0 延迟)
            slots = extract_task_slots(message)
            task_args = None

            if slots.get("confidence") == "high":
                task_args = {
                    "title": slots["title"],
                    "deadline": slots.get("deadline"),
                    "priority": slots.get("priority", "normal"),
                    "context": {"source": "chat", "mode": "fast_path", "raw_time": slots.get("raw_time")},
                }
            else:
                # 2. 轨道 B：复杂口语走精准 Tool Calling (语义理解，无废话)
                yield {"event": "step", "data": {"label": "正在解析任务事项与排期...", "status": "running"}}

                create_task_schema = next((t for t in TOOL_SCHEMAS if t.get("function", {}).get("name") == "create_task"), None)
                task_prompt = f"请根据用户的对话内容创建待办任务，提取清晰的事项标题、截止时间与优先级：\n{safe_message}"

                result = gw.call_llm(
                    text=DesensitizedText(task_prompt),
                    prompt_template="",
                    system_prompt="你是一个专业的信贷助手，负责将口语指令提取为严谨利落的任务事项（去除‘好的把’、‘也安排’等口语废话）。",
                    tools=[create_task_schema] if create_task_schema else None,
                    tool_choice="required",
                    max_tokens=100,
                )

                if result.tool_calls:
                    call_args = result.tool_calls[0].get("arguments", {})
                    task_args = {
                        "title": call_args.get("title") or slots.get("title") or message[:30],
                        "deadline": call_args.get("deadline") or slots.get("deadline"),
                        "priority": call_args.get("priority") or slots.get("priority", "normal"),
                        "context": {"source": "chat", "mode": "tool_calling", "raw_time": slots.get("raw_time")},
                    }
                else:
                    task_args = {
                        "title": slots.get("title") or message[:30],
                        "deadline": slots.get("deadline"),
                        "priority": slots.get("priority", "normal"),
                        "context": {"source": "chat", "mode": "fallback"},
                    }

            # 3. 执行任务创建并回填系统提示
            res = _create_task(task_args, case_id, db)

            if res.get("ok"):
                dl_display = task_args.get("deadline") or "未设期限"
                tool_cards.append({
                    "type": "task_created",
                    "title": f"📋 任务已创建：{task_args['title']}（{dl_display}，{task_args['priority']}）",
                    "payload": {
                        "task_id": res.get("task_id"),
                        "title": task_args["title"],
                        "deadline": task_args.get("deadline"),
                        "priority": task_args.get("priority"),
                    },
                })
                base_prompt += f"\n\n【系统通知】已成功为 Vera 创建任务: {task_args['title']}，截止时间: {dl_display}。"
            else:
                tool_cards.append({
                    "type": "task_create_failed",
                    "title": "⚠️ 任务创建失败",
                    "payload": {"reason": res.get("error") or res.get("summary") or "未知原因"},
                })
            if tool_cards:
                yield {"event": "tool_cards", "data": tool_cards}
            if res.get("summary"):
                base_prompt += f"\n\n【任务创建结果】\n{res['summary']}"
        except Exception as te:  # noqa: BLE001
            logger.warning("task_create branch failed (non-fatal): %s", te)
            base_prompt += f"\n\n【任务创建提示】工具调用暂不可用: {te}"

    elif intent == ChatIntent.TASK_CREATE and not case_id:
        # WO-65：全局对话下建任务不静默退化，产出引导卡片
        tool_cards.append({
            "type": "needs_case",
            "title": "📌 请选择关联案件",
            "payload": {"hint": "在右栏选择案件后再记任务，任务会归到该案件"},
        })
        yield {"event": "tool_cards", "data": tool_cards}
        base_prompt = f"【用户回复】\n{safe_message}\n\n【指令】检测到用户意在创建待办任务，但当前处于全局对话模式。请简短提示用户在左侧或列表中选择对应案件，以便将任务精准归档。"

    elif intent == ChatIntent.CHECKLIST_GAP and case_id:
        try:
            from core.chat.tools import _checklist_query, _gap_analysis
            q = _checklist_query({"query": "missing"}, case_id, db)
            g = _gap_analysis({}, case_id, db)
            cards = []
            if q.get("card"):
                cards.append(q["card"])
            if g.get("card"):
                cards.append(g["card"])
            if cards:
                tool_cards.extend(cards)
                yield {"event": "tool_cards", "data": cards}
            summary_parts = [p for p in [q.get("summary"), g.get("summary")] if p]
            if summary_parts:
                base_prompt += "\n\n【材料缺口与清单现状】\n" + "\n".join(summary_parts)
        except Exception as te:  # noqa: BLE001
            logger.warning("checklist_gap branch failed (non-fatal): %s", te)
            base_prompt += f"\n\n【材料缺口核对提示】工具调用暂不可用: {te}"

    elif intent == ChatIntent.DECLARATION_CHECK and case_id:
        try:
            from core.chat.tools import _declaration_check
            res = _declaration_check({}, case_id, db)
            if res.get("card"):
                tool_cards.append(res["card"])
                yield {"event": "tool_cards", "data": [res["card"]]}
            if res.get("summary"):
                base_prompt += f"\n\n【申报材料一致性比对结果】\n{res['summary']}"
        except Exception as te:  # noqa: BLE001
            logger.warning("declaration_check branch failed (non-fatal): %s", te)
            base_prompt += f"\n\n【申报一致性核对提示】工具调用暂不可用: {te}"

    elif intent == ChatIntent.DRAFT_EMAIL and case_id:
        try:
            from core.chat.tools import _draft_email
            res = _draft_email({"message": message}, case_id, db, track=track)
            if res.get("card"):
                tool_cards.append(res["card"])
                yield {"event": "tool_cards", "data": [res["card"]]}
            card_payload = res.get("card", {}).get("payload", {})
            version_tag = card_payload.get("version", "V1")
            subject_tag = card_payload.get("subject", "邮件草稿")
            base_prompt += (
                f"\n\n【邮件起草完成通知】已在下方卡片成功生成并挂载邮件草稿 [{version_tag}]（主题：{subject_tag}）。"
                f"请以利落专业的信贷助手口吻向 Vera 说明本次起草/微调的核心要点、覆盖的缺口材料与跟进建议。"
            )
        except Exception as te:  # noqa: BLE001
            logger.warning("draft_email branch failed (non-fatal): %s", te)
            base_prompt += f"\n\n【邮件起草提示】工具调用暂不可用: {te}"

    elif intent == ChatIntent.POLICY_QUERY and case_id:
        try:
            from core.chat.tools import _policy_check
            res = _policy_check({"query": message}, case_id, db)
            if res.get("card"):
                tool_cards.append(res["card"])
                yield {"event": "tool_cards", "data": [res["card"]]}
            if res.get("summary"):
                base_prompt += f"\n\n【银行政策核对结果】\n{res['summary']}"
        except Exception as te:  # noqa: BLE001
            logger.warning("policy_query branch failed (non-fatal): %s", te)
            base_prompt += f"\n\n【政策查询提示】工具调用暂不可用: {te}"

    # 2. 若为能力问答/闲聊状态意图：注入针对性极简响应指引
    elif intent == ChatIntent.META_HELP:
        base_prompt = f"【用户提问】\n{safe_message}\n\n【指令】请条理分明、清晰专业地向 Vera 介绍你作为信贷 AI 助手的实战核心能力（如案卷诊断、材料查验与 OCR 提取、贷款额度精算、政策匹配、催件与复议策略等），保持自信利落风格。"
    elif intent == ChatIntent.STATUS_ACK:
        base_prompt = f"【用户回复】\n{safe_message}\n\n【指令】这是简短状态/闲聊/确认指令。请用 1 句话利落回应（如确认收到指示、随时待命），绝不展开任何无关的长篇分析。"

        yield {"event": "step", "data": {"label": "Annie 正在生成实战建议与分析...", "status": "generating"}}

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
    except Exception as e:  # noqa: BLE001
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
    if out.get("files_found") is not None or out.get("files") is not None:
        files = out.get("files_found") if out.get("files_found") is not None else out.get("files", [])
        tool_cards.append({
            "type": "folder_lookup",
            "title": f"案卷文件夹检索: {out.get('query', '')}",
            "payload": {
                "files": files,
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


def _extract_task_title(message: str) -> str:
    """从口语中提取任务标题：去前缀（帮我记一下/建一个任务/创建任务/提醒我/记一笔等），
    去尾标点，长度 ≤ 40 字；剩余为空时用整句。"""
    cleaned = re.sub(r"^(帮我|请)?(记一下|记一笔|帮我记|建(一个)?任务|创建任务|安排一下|提醒我|设一个提醒)[:：\s]*", "", message.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"[!！。.\s]+$", "", cleaned)
    return cleaned[:40] if cleaned else message[:40]
