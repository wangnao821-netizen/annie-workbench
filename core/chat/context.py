"""对话五层注入协议 — 缓存友好排序（#8 决策 2）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.ai.context_builder import _build_role_prompt, assemble_context
from core.logger import get_logger
from core.models.orm import CaseChatMessage

logger = get_logger(__name__)

# 缓存友好层序（#8 决策 2）：改排序 = 改施工单，不得静默调整
LAYER_ORDER = ["role", "case_brain", "team", "live", "dialogue"]

DIALOGUE_WINDOW_ROUNDS = 10    # 对话追加区：最近 10 轮
DIALOGUE_TOKEN_BUDGET = 500    # 超出预算从头部截断（折叠语义：#8）


def build_chat_layers(
    case_id: str | None,
    message: str,
    track: str,
    db: Session,
) -> list[dict]:
    """组装上下文层级（严格保证当前用户最新输入处于最末尾，历史对话紧随其上）。"""
    if not case_id:
        return [
            {"layer": "role", "text": _build_role_prompt(db)},
            {"layer": "current_user_message", "text": f"【Vera 当前最新指令/回复】\n{message}"},
        ]

    # extra_data 传空，避免将当前用户输入混入 live_data 中间层
    ctx = assemble_context(case_id, "case_chat", db, extra_data="")
    return [
        {"layer": "role", "text": _build_role_prompt(db)},
        {"layer": "case_brain", "text": ctx.case_brain},
        {"layer": "team", "text": ctx.team_experience},
        {"layer": "live", "text": ctx.live_data},
        {"layer": "dialogue", "text": _build_dialogue(case_id, db, track)},
        {"layer": "current_user_message", "text": f"【Vera 当前最新指令/回复（你必须针对此话直接对位作答）】\n{message}"},
    ]


def _build_dialogue(case_id: str, db: Session, track: str = "internal") -> str:
    """对话追加区：最近 DIALOGUE_WINDOW_ROUNDS 轮（旧→新），自动去重并控制预算。"""
    from core.chat.compression import ensure_session_compression

    summary = ensure_session_compression(case_id, db, track)
    rows = (
        db.query(CaseChatMessage)
        .filter(CaseChatMessage.case_id == case_id)
        .order_by(CaseChatMessage.id.desc())
        .limit(DIALOGUE_WINDOW_ROUNDS)
        .all()
    )
    # 反转为时间顺序
    ordered_rows = list(reversed(rows))
    
    # 智能去重：若连续出现高度相似的 assistant 消息，只保留最新一条，防止大模型陷入自注意力复读死循环
    deduped_rows = []
    last_assistant_content = ""
    for r in ordered_rows:
        if r.role == "assistant":
            prefix = r.content[:80] if r.content else ""
            if prefix and prefix == last_assistant_content:
                continue
            last_assistant_content = prefix
        else:
            last_assistant_content = ""
        deduped_rows.append(r)

    blocks = [f"[{r.role}] {r.content}" for r in deduped_rows]
    budget_chars = 3000  # 扩大对话预算到 3000 字符，确保多轮上下文不被腰斩
    text = "\n".join(blocks)
    while len(text) > budget_chars and len(blocks) > 1:
        blocks.pop(0)
        text = "\n".join(blocks)
    if summary:
        text = f"【历史对话摘要】\n{summary}\n\n{text}" if text else f"【历史对话摘要】\n{summary}"
    return text
