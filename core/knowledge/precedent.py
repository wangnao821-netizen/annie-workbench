"""决策先例检索 — 同客户 + 同类场景（WO-37，借鉴 Semantica find_precedents）。"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Action, Case

logger = get_logger(__name__)

_LVR_TOLERANCE = 5.0  # |lvr 差| ≤ 5 视为同类场景
_FALLBACK_DT = datetime.min.replace(tzinfo=UTC).replace(tzinfo=None)


def _is_similar(current: Case, other: Case) -> bool:
    """同类场景判定：lender 相同 / purpose 相同 / |lvr 差| ≤ _LVR_TOLERANCE。"""
    return (
        (bool(current.lender and other.lender and current.lender == other.lender))
        or (bool(current.purpose and other.purpose and current.purpose == other.purpose))
        or (
            current.lvr is not None
            and other.lvr is not None
            and abs(current.lvr - other.lvr) <= _LVR_TOLERANCE
        )
    )


def _to_record(action: Action, case: Case | None) -> dict:
    """把已确认执行的 Action 结构化为先例记录。"""
    decision = action.title
    if action.ai_suggestion:
        decision = f"{action.title}：{action.ai_suggestion}"
    outcome = action.vera_note or action.boss_decision or "已确认执行"
    return {
        "case_id": action.case_id,
        "action_id": action.id,
        "title": action.title,
        "type": action.type,
        "decision": decision,
        "outcome": outcome,
        "lender": case.lender if case else None,
        "purpose": case.purpose if case else None,
        "lvr": case.lvr if case else None,
        "created_at": action.created_at,
    }


def find_precedents(case_id: str, db: Session, limit: int = 5) -> list[dict]:
    """检索决策先例：同客户（同 case 已完成 Action）+ 同类场景（lender 相同 /
    purpose 相同 / |lvr 差| ≤ _LVR_TOLERANCE 的其他 case 已完成 Action），
    按 created_at 倒序，去重后最多 limit 条。

    Args:
        case_id: 当前案件 ID
        db: SQLAlchemy session
        limit: 返回条数上限（默认 5）

    Returns:
        [{"case_id", "action_id", "title", "type", "decision", "outcome",
          "lender", "purpose", "lvr", "created_at"}]；无先例返回 []。
    """
    current = db.query(Case).filter(Case.id == case_id).first()
    results: dict[int, dict] = {}

    # 1. 同客户：同 case 已完成 Action（优先保留）
    same_actions = (
        db.query(Action)
        .filter(Action.case_id == case_id, Action.status == "completed")
        .all()
    )
    for action in same_actions:
        results[action.id] = _to_record(action, current)

    # 2. 同类场景：其他 case 已完成 Action（lender / purpose / lvr 命中任一）
    if current is not None:
        rows = (
            db.query(Action, Case)
            .join(Case, Case.id == Action.case_id)
            .filter(Action.case_id != case_id, Action.status == "completed")
            .all()
        )
        for action, case in rows:
            if action.id in results:
                continue
            if _is_similar(current, case):
                results[action.id] = _to_record(action, case)

    precedents = sorted(
        results.values(),
        key=lambda r: r["created_at"] or _FALLBACK_DT,
        reverse=True,
    )
    return precedents[:limit]


def build_precedent_block(precedents: list[dict], max_chars: int = 800) -> str:
    """把先例列表格式化为注入文本块；无先例返回空串。每行：
    [同类先例] {title}（{lender} · {purpose}）→ 决策：{decision}；结果：{outcome}
    超 max_chars 截断（保留头部）。
    """
    if not precedents:
        return ""
    lines = []
    for p in precedents:
        lender = p.get("lender") or "未知"
        purpose = p.get("purpose") or "未知"
        lines.append(
            f"[同类先例] {p['title']}（{lender} · {purpose}）→ 决策：{p['decision']}；结果：{p['outcome']}"
        )
    block = "\n".join(lines)
    if len(block) > max_chars:
        block = block[:max_chars]
    return block