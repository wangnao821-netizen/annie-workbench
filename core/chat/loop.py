"""服务端工具循环 — 非流式对话协议（#12）。"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from core.ai.context_builder import assemble_context
from core.ai.gateway import ApiGateway
from core.chat.tools import TOOL_SCHEMAS, execute_tool
from core.config import get_config
from core.logger import get_logger
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
    scope = case_id or "system"
    safe_message = desensitize(message, scope, db)
    if case_id:
        ctx = assemble_context(case_id, "case_chat", db, extra_data=safe_message)
        base_prompt = (
            f"{ctx.role_prompt}\n\n【团队经验】\n{ctx.team_experience}\n\n"
            f"【案件大脑】\n{ctx.case_brain}\n\n【实时数据】\n{ctx.live_data}"
        )
    else:
        base_prompt = _SYSTEM_PROMPT

    tool_choice = "auto" if case_id else "none"
    messages: list[dict] = []          # 追加轮次的对话消息（tool 回注）
    tool_cards: list[dict] = []
    recorded_facts: list[dict] = []
    gw = ApiGateway(get_config())

    for _round in range(MAX_TOOL_ROUNDS):
        prompt = base_prompt + "\n\n" + _format_tool_round(messages)
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template=prompt,
            system_prompt=_SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS if case_id else None,
            tool_choice=tool_choice,
        )
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
    """record_fact low → record_confirm 卡；high → recorded_facts；suggest_submission → submission_suggest 卡。"""
    if out.get("suggest"):
        tool_cards.append({
            "type": "submission_suggest",
            "title": "进入递交模式？",
            "payload": {"message": "检测到递交/写银行内容意图，要进入递交模式吗？"},
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