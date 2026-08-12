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
    """组装五层注入内容（按 LAYER_ORDER 缓存友好排序）。

    全局对话（case_id 为空）→ 只返回 role 层 + 用户消息（#2：不注入案件上下文）。
    对话追加区 = 最近 DIALOGUE_WINDOW_ROUNDS 轮 CaseChatMessage（追加式，旧→新）；
    超预算从头部截断——已确认内容已蒸馏进摘要（折叠），窗口外不注入原话。

    Returns:
        [{"layer": "role", "text": str}, ...]（按 LAYER_ORDER 排序）
    """
    if not case_id:
        return [
            {"layer": "role", "text": _build_role_prompt()},
            {"layer": "live", "text": message},
        ]

    ctx = assemble_context(case_id, "case_chat", db, extra_data=message)
    return [
        {"layer": "role", "text": _build_role_prompt()},
        {"layer": "case_brain", "text": ctx.case_brain},
        {"layer": "team", "text": ctx.team_experience},
        {"layer": "live", "text": ctx.live_data},
        {"layer": "dialogue", "text": _build_dialogue(case_id, db)},
    ]


def _build_dialogue(case_id: str, db: Session) -> str:
    """对话追加区：最近 DIALOGUE_WINDOW_ROUNDS 轮（旧→新），超预算从头部截断。"""
    rows = (
        db.query(CaseChatMessage)
        .filter(CaseChatMessage.case_id == case_id)
        .order_by(CaseChatMessage.id.desc())
        .limit(DIALOGUE_WINDOW_ROUNDS)
        .all()
    )
    blocks = [f"[{r.role}] {r.content}" for r in reversed(rows)]
    budget_chars = DIALOGUE_TOKEN_BUDGET * 2  # 1 token ≈ 2 字符
    text = "\n".join(blocks)
    while len(text) > budget_chars and len(blocks) > 1:
        blocks.pop(0)
        text = "\n".join(blocks)
    return text