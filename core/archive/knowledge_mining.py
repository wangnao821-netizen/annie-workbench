"""core/archive/knowledge_mining.py — WO-59 AI 知识萃取与审批官/先例图谱。

从历史案卷（Case + CaseContextEvent）聚合审批官画像、按多维条件检索实战
先例、提炼单个案卷的经验复盘卡。先例检索与复盘卡仅针对已归档案件
（stage == 'closed' 或 close_reason == 'settled'）。
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseContextEvent

logger = get_logger(__name__)

_COMMUNICATION_TIPS = "建议邮件提供清晰材料清单并一次性补齐"

# 关键词检索的目标字段
_KEYWORD_FIELDS = (
    Case.client_name,
    Case.broker_notes,
    Case.context_summary,
    Case.knowledge_summary,
    Case.ai_experience,
    Case.purpose,
    Case.close_note,
)


def _is_settled(case: Case) -> bool:
    """已归结案隔离：仅 stage == 'closed' 或 close_reason == 'settled' 生效。"""
    return bool(case.stage == "closed" or case.close_reason == "settled")


def _case_latest_time(case: Case) -> datetime | None:
    """取案件终态时间，缺失时回退到创建时间，用于最近案件排序。"""
    return case.closed_at or case.created_at


def _parse_event_content(content: str) -> dict[str, Any]:
    """解析 CaseContextEvent 内容，抽取审批官 / 案号 / 卡点 / 获批条件。"""
    parsed: dict[str, Any] = {
        "assessor": None,
        "lender_ref": None,
        "blockers": [],
        "approval_texts": [],
    }
    for line in (content or "").splitlines():
        if line.startswith("审批官："):
            parsed["assessor"] = line.split("：", 1)[1].strip() or None
        elif line.startswith("案号："):
            parsed["lender_ref"] = line.split("：", 1)[1].strip() or None
        elif line.startswith("卡点："):
            reason = line.split("：", 1)[1].strip()
            if reason:
                parsed["blockers"].append(reason)
        elif line.startswith(
            ("批准条件：", "条件：", "approved conditions", "Approved Conditions", "condition:", "Condition:")
        ):
            text = line.split("：", 1)[1].strip() if "：" in line else line.strip()
            if text:
                parsed["approval_texts"].append(text)
        else:
            m = re.match(r"\[([a-z_]+)\]\s*(.*)", line)
            if m and m.group(1) == "approval_issued":
                title = m.group(2).strip()
                if title:
                    parsed["approval_texts"].append(title)
    return parsed


def get_all_assessor_insights(db: Session) -> list[dict[str, Any]]:
    """从 CaseContextEvent 与 Case 聚合所有审批官画像与统计数据。

    返回列表项：
    {
        "assessor_name": str,
        "lender": str | None,
        "case_count": int,
        "latest_case_id": str | None,
        "latest_case_ref": str | None,
        "common_blockers": list[str],
        "communication_tips": str,
    }
    """
    events = db.query(CaseContextEvent).all()
    case_ids = {ev.case_id for ev in events}
    cases = db.query(Case).filter(Case.id.in_(case_ids)).all() if case_ids else []
    case_map = {c.id: c for c in cases}

    by_case: dict[str, list[CaseContextEvent]] = {}
    for ev in events:
        by_case.setdefault(ev.case_id, []).append(ev)

    insights: dict[tuple[str, str | None], dict[str, Any]] = {}
    latest: dict[tuple[str, str | None], tuple[datetime | None, str, str | None]] = {}
    for case_id, case_events in by_case.items():
        case = case_map.get(case_id)
        lender = case.lender if case else None
        assessors: set[str] = set()
        blockers: list[str] = []
        refs: list[str] = []
        for ev in case_events:
            parsed = _parse_event_content(ev.content)
            if parsed["assessor"]:
                assessors.add(parsed["assessor"])
            blockers.extend(parsed["blockers"])
            if parsed["lender_ref"]:
                refs.append(parsed["lender_ref"])
        for assessor in assessors:
            key = (assessor, lender)
            item = insights.get(key)
            if item is None:
                item = {
                    "assessor_name": assessor,
                    "lender": lender,
                    "case_count": 0,
                    "latest_case_id": None,
                    "latest_case_ref": None,
                    "common_blockers": [],
                    "communication_tips": _COMMUNICATION_TIPS,
                }
                insights[key] = item
            item["case_count"] += 1
            for blocker in blockers:
                if blocker not in item["common_blockers"]:
                    item["common_blockers"].append(blocker)
            ts = _case_latest_time(case)
            prev = latest.get(key)
            if prev is None or (ts is not None and (prev[0] is None or ts > prev[0])):
                latest[key] = (ts, case_id, refs[0] if refs else None)

    for key, (_, case_id, ref) in latest.items():
        insights[key]["latest_case_id"] = case_id
        insights[key]["latest_case_ref"] = ref

    items = list(insights.values())
    items.sort(key=lambda it: (-it["case_count"], it["assessor_name"].lower(), it["lender"] or ""))
    return items


def _highlight_for(case: Case) -> str | None:
    """从经验/摘要字段提炼先例高亮摘要。"""
    for text in (case.ai_experience, case.context_summary, case.knowledge_summary):
        if text and text.strip():
            return re.sub(r"\s+", " ", text).strip()[:200]
    return None


def _precedent_item(case: Case) -> dict[str, Any]:
    return {
        "case_id": case.id,
        "client_name": case.client_name,
        "property_address": getattr(case, "property_address", None),
        "lender": case.lender,
        "loan_amount": case.loan_amount,
        "doc_type": case.case_type,
        "interest_rate": case.interest_rate,
        "settlement_date": case.closed_at.date().isoformat() if case.closed_at else None,
        "summary_highlight": _highlight_for(case),
    }


def search_case_precedents(
    db: Session,
    lender: str | None = None,
    doc_type: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """从归档案件中按机构、方案类型、关键词检索实战先例。"""
    query = db.query(Case).filter(or_(Case.stage == "closed", Case.close_reason == "settled"))
    if lender:
        query = query.filter(Case.lender.ilike(f"%{lender}%"))
    if doc_type:
        query = query.filter(Case.case_type.ilike(f"%{doc_type}%"))
    if keyword:
        pattern = f"%{keyword}%"
        query = query.filter(or_(*(field.ilike(pattern) for field in _KEYWORD_FIELDS)))
    rows = (
        query.order_by(Case.closed_at.desc(), Case.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_precedent_item(c) for c in rows]


def _first_text(*texts: str | None) -> str:
    for text in texts:
        if text and text.strip():
            return text.strip()
    return ""


def generate_case_knowledge_card(case_id: str, db: Session) -> dict[str, Any] | None:
    """提取单个归档案件的结构化复盘知识卡片。

    返回：
    {
        "case_id": case_id,
        "client_name": str,
        "lender": str,
        "loan_amount": float,
        "strategy_summary": str,
        "key_challenges": list[str],
        "approved_conditions": str,
        "takeaway": str,
    }
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None or not _is_settled(case):
        return None

    events = (
        db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == case_id)
        .order_by(CaseContextEvent.created_at.asc(), CaseContextEvent.id.asc())
        .all()
    )
    key_challenges: list[str] = []
    approval_texts: list[str] = []
    for ev in events:
        parsed = _parse_event_content(ev.content)
        for blocker in parsed["blockers"]:
            if blocker not in key_challenges:
                key_challenges.append(blocker)
        approval_texts.extend(parsed["approval_texts"])

    strategy_summary = _first_text(
        case.strategy_report, case.submission_summary, case.ai_experience, case.broker_notes
    )
    takeaway = _first_text(case.ai_experience, case.knowledge_summary, case.close_note)
    approved_conditions = "; ".join(dict.fromkeys(approval_texts)) or takeaway or strategy_summary
    return {
        "case_id": case.id,
        "client_name": case.client_name,
        "lender": case.lender,
        "loan_amount": case.loan_amount,
        "strategy_summary": strategy_summary,
        "key_challenges": key_challenges,
        "approved_conditions": approved_conditions,
        "takeaway": takeaway,
    }