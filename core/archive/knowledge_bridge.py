"""core/archive/knowledge_bridge.py — WO-61 档案库↔知识中心双向打通与工作台先例推荐。

归档先例自动沉淀入知识中心（KnowledgeEntry，source="archive_precedent"）、
知识条目反向溯源案卷（case_id）以及工作台在办案件的历史先例智能推荐。
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.archive.knowledge_mining import generate_case_knowledge_card
from core.logger import get_logger
from core.models.orm import Case, CaseContextEvent, KnowledgeEntry

logger = get_logger(__name__)

_TOKEN_RE = re.compile(r"[a-zA-Z0-9\u4e00-\u9fff]+")


def _load_card(content: str | None) -> dict[str, Any]:
    """解析 KnowledgeEntry.content 中 JSON 序列化的复盘卡，失败返回空 dict。"""
    try:
        data = json.loads(content or "{}")
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _parse_tags(raw: str | None) -> list[str]:
    """解析 KnowledgeEntry.tags（JSON 字符串数组），失败返回空列表。"""
    if not raw:
        return []
    try:
        tags = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return tags if isinstance(tags, list) else []


def _tokenize(text: str | None) -> set[str]:
    """将文本切分为检索 token（含 snake_case 拆词），用于卡点关键词匹配。"""
    tokens: set[str] = set()
    for match in _TOKEN_RE.findall(text or ""):
        tokens.add(match.lower())
        tokens.update(part for part in match.split("_") if part)
    return tokens


def _keyword_overlap(left: str | None, right: str | None) -> bool:
    """两个文本是否存在重叠的卡点关键词。"""
    return bool(_tokenize(left) & _tokenize(right))


def _latest_blocker(case_id: str, db: Session) -> str | None:
    """从 CaseContextEvent 中提取该案件最新的卡点描述（卡点：... 行）。"""
    events = (
        db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == case_id)
        .order_by(CaseContextEvent.created_at.desc(), CaseContextEvent.id.desc())
        .all()
    )
    for ev in events:
        for line in (ev.content or "").splitlines():
            if line.startswith("卡点："):
                reason = line.split("：", 1)[1].strip()
                if reason:
                    return reason
    return None


def _title_of(card: dict[str, Any]) -> str:
    """按契约重建先例标题：【实战先例】机构 · 客户 · $金额。"""
    lender = card.get("lender") or ""
    client = card.get("client_name") or ""
    try:
        amount = float(card.get("loan_amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    return f"【实战先例】{lender} · {client} · ${amount:,.0f}"


def _doc_type_of(entry: KnowledgeEntry, case_map: dict[str, Case]) -> str | None:
    """解析先例条目的方案类型：优先取关联案卷的 case_type，回退 tags 元数据。"""
    ref = case_map.get(entry.case_id)
    if ref is not None and ref.case_type:
        return ref.case_type
    for tag in _parse_tags(entry.tags):
        if tag:
            return tag
    return None


def sync_archive_to_knowledge_base(db: Session) -> dict[str, Any]:
    """遍历所有已结档案件，为尚未生成 KnowledgeEntry 的案卷提炼复盘卡并落库。

    落库规则：
    1. 仅针对 stage == 'closed' 或 close_reason == 'settled' 的 Case；
    2. 检查是否已存在 source == 'archive_precedent' 且 case_id == case.id 的条目（幂等）；
    3. 调用 generate_case_knowledge_card(case.id, db)；
    4. 写入 KnowledgeEntry:
       - layer = "global_experience"
       - category = "precedent_insight"
       - source = "archive_precedent"
       - lender = case.lender
       - case_id = case.id
       - title = f"【实战先例】{case.lender} · {case.client_name} · ${case.loan_amount:,.0f}"
       - content = json.dumps(card, ensure_ascii=False)
       - vera_confirmed = True
    5. 返回 {"ok": True, "synced_count": int, "total_precedents": int}。
    """
    cases = (
        db.query(Case)
        .filter(or_(Case.stage == "closed", Case.close_reason == "settled"))
        .all()
    )
    synced_count = 0
    for case in cases:
        existing = (
            db.query(KnowledgeEntry)
            .filter(
                KnowledgeEntry.source == "archive_precedent",
                KnowledgeEntry.case_id == case.id,
            )
            .first()
        )
        if existing is not None:
            continue
        card = generate_case_knowledge_card(case.id, db)
        if not card:
            continue
        db.add(
            KnowledgeEntry(
                id=f"ke_{uuid.uuid4().hex[:12]}",
                layer="global_experience",
                entry_type="precedent_insight",
                case_id=case.id,
                content=json.dumps(card, ensure_ascii=False),
                source="archive_precedent",
                vera_confirmed=True,
                lender=case.lender,
                tags=json.dumps([case.case_type], ensure_ascii=False) if case.case_type else None,
            )
        )
        synced_count += 1
    db.commit()
    total_precedents = (
        db.query(KnowledgeEntry)
        .filter(KnowledgeEntry.source == "archive_precedent")
        .count()
    )
    logger.info(
        "Archive knowledge sync done: synced=%d total_precedents=%d",
        synced_count,
        total_precedents,
    )
    return {"ok": True, "synced_count": synced_count, "total_precedents": total_precedents}


def get_recommended_precedents_for_case(
    case_id: str,
    db: Session,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """根据当前在办案件的机构、方案类型与卡点，智能匹配历史最相似的先例。

    匹配打分规则：
    1. 获取当前 case 的 lender, doc_type, 以及最新的 blocker（来自 CaseContextEvent）；
    2. 检索所有 source == 'archive_precedent' 且 case_id != case_id 的 KnowledgeEntry；
    3. 相似度打分：
       - 同机构 (lender 相同) +30 分
       - 相同卡点关键词 (blocker 相关) +40 分
       - 相同方案 (doc_type 相同) +20 分
    4. 按得分倒序返回前 limit 个最相关的先例与策略。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        return []
    lender = (case.lender or "").strip()
    doc_type = (case.case_type or "").strip()
    blocker = _latest_blocker(case_id, db)

    entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.source == "archive_precedent",
            KnowledgeEntry.case_id != case_id,
        )
        .all()
    )
    if not entries:
        return []

    case_ids = {e.case_id for e in entries if e.case_id}
    case_map: dict[str, Case] = {}
    if case_ids:
        for row in db.query(Case).filter(Case.id.in_(case_ids)).all():
            case_map[row.id] = row

    scored: list[dict[str, Any]] = []
    for entry in entries:
        card = _load_card(entry.content)
        score = 0
        reasons: list[str] = []
        if lender and entry.lender and entry.lender == lender:
            score += 30
            reasons.append("同机构")
        entry_doc_type = _doc_type_of(entry, case_map)
        if doc_type and entry_doc_type and entry_doc_type == doc_type:
            score += 20
            reasons.append("同方案")
        challenge_text = " ".join(card.get("key_challenges") or [])
        if blocker and _keyword_overlap(blocker, f"{entry.content or ''} {challenge_text}"):
            score += 40
            reasons.append("同卡点")
        if score <= 0:
            continue
        scored.append(
            {
                "precedent_id": entry.id,
                "case_id": entry.case_id,
                "title": _title_of(card),
                "lender": entry.lender,
                "client_name": card.get("client_name"),
                "strategy_summary": card.get("strategy_summary"),
                "takeaway": card.get("takeaway"),
                "relevance_score": score,
                "match_reasons": reasons,
            }
        )

    scored.sort(key=lambda item: item["relevance_score"], reverse=True)
    return scored[:limit]