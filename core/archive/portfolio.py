"""core/archive/portfolio.py — WO-60 档案中心全景：客户终生资产聚合与大盘指标。

基于已归结案（stage == 'closed' 或 close_reason == 'settled'），按客户主体
（client_name）聚合其名下所有房产案卷，生成客户终生资产卡片；并计算档案
中心全局资产大盘指标（归档客户总数、案件总数、贷款总规模、商机总数、先例数）。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.archive.retention import compute_case_retention_opportunities
from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)

# 判定案卷是否沉淀出可检索知识（先例）的文本字段
_KNOWLEDGE_FIELDS = (
    "ai_experience",
    "context_summary",
    "knowledge_summary",
    "strategy_report",
    "broker_notes",
)


def _is_settled(case: Case) -> bool:
    """已归结案隔离：仅 stage == 'closed' 或 close_reason == 'settled' 生效。"""
    return bool(case.stage == "closed" or case.close_reason == "settled")


def _settled_filter():
    """归档案卷筛选条件（与 WO-58/WO-59 保持一致）。"""
    return or_(Case.stage == "closed", Case.close_reason == "settled")


def _case_settlement_date(case: Case) -> str | None:
    """案件终态结算日期（ISO 字符串）。"""
    if case.closed_at is None:
        return None
    return case.closed_at.date().isoformat()


def _case_has_knowledge(case: Case) -> bool:
    """案卷是否具备可收录为实战先例的知识沉淀。"""
    return any(getattr(case, field, None) for field in _KNOWLEDGE_FIELDS)


def _case_opportunities(case: Case) -> list[dict[str, Any]]:
    """计算单个归档案件的二次经营商机。"""
    if not _is_settled(case):
        return []
    return compute_case_retention_opportunities(case)


def _primary_lender(cases: list[Case]) -> str | None:
    """主力银行：案卷数最多，平手时取贷款总额更大者。"""
    lenders: dict[str, dict[str, Any]] = {}
    for case in cases:
        if not case.lender:
            continue
        entry = lenders.setdefault(case.lender, {"count": 0, "amount": 0.0})
        entry["count"] += 1
        entry["amount"] += case.loan_amount or 0.0
    if not lenders:
        return None
    return max(lenders.items(), key=lambda kv: (kv[1]["count"], kv[1]["amount"], kv[0]))[0]


def _case_summary_item(case: Case) -> dict[str, Any]:
    """构造单个案件在客户卡片中的摘要条目。"""
    return {
        "case_id": case.id,
        "property_address": getattr(case, "property_address", None),
        "lender": case.lender,
        "loan_amount": case.loan_amount,
        "stage": case.stage,
        "close_reason": case.close_reason,
        "settlement_date": _case_settlement_date(case),
    }


def get_archive_hub_stats(db: Session) -> dict[str, Any]:
    """计算档案中心全局资产大盘指标。

    返回：
    {
        "total_archived_clients": int,
        "total_cases_count": int,
        "total_loan_volume": float,
        "total_opportunities_count": int,
        "total_precedents_count": int,
    }
    """
    settled = _settled_filter()
    total_cases_count = db.query(func.count(Case.id)).filter(settled).scalar() or 0
    total_archived_clients = (
        db.query(func.count(func.distinct(Case.client_name))).filter(settled).scalar() or 0
    )
    total_loan_volume = (
        db.query(func.coalesce(func.sum(Case.loan_amount), 0.0)).filter(settled).scalar() or 0.0
    )
    cases = db.query(Case).filter(settled).all()
    total_opportunities_count = sum(len(_case_opportunities(c)) for c in cases)
    total_precedents_count = sum(1 for c in cases if _case_has_knowledge(c))
    stats = {
        "total_archived_clients": int(total_archived_clients),
        "total_cases_count": int(total_cases_count),
        "total_loan_volume": float(total_loan_volume),
        "total_opportunities_count": int(total_opportunities_count),
        "total_precedents_count": int(total_precedents_count),
    }
    logger.info("Archive hub stats: %s", stats)
    return stats


def get_client_portfolios(
    db: Session,
    query: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """按客户姓名聚合所有房产案卷，生成客户终生资产卡片列表。

    返回列表项：
    {
        "client_name": str,
        "total_properties_count": int,
        "total_loan_amount": float,
        "primary_lender": str | None,
        "latest_settlement_date": str | None,
        "cases_summary": list[dict],
        "active_opportunities_count": int,
        "latest_opportunity_title": str | None,
    }
    """
    q = db.query(Case).filter(_settled_filter())
    if query:
        q = q.filter(Case.client_name.ilike(f"%{query}%"))
    cases = q.order_by(Case.client_name.asc(), Case.closed_at.desc(), Case.id.asc()).all()

    by_client: dict[str, list[Case]] = {}
    for case in cases:
        if not case.client_name:
            continue
        by_client.setdefault(case.client_name, []).append(case)

    portfolios: list[dict[str, Any]] = []
    for client_name, client_cases in by_client.items():
        latest_case = client_cases[0]
        active_opportunities_count = 0
        latest_opportunity_title: str | None = None
        for case in client_cases:
            opps = _case_opportunities(case)
            active_opportunities_count += len(opps)
            if latest_opportunity_title is None and opps:
                latest_opportunity_title = opps[0]["title"]
        portfolios.append({
            "client_name": client_name,
            "total_properties_count": len(client_cases),
            "total_loan_amount": sum(c.loan_amount or 0.0 for c in client_cases),
            "primary_lender": _primary_lender(client_cases),
            "latest_settlement_date": _case_settlement_date(latest_case),
            "cases_summary": [_case_summary_item(c) for c in client_cases],
            "active_opportunities_count": active_opportunities_count,
            "latest_opportunity_title": latest_opportunity_title,
        })
    portfolios.sort(key=lambda p: (-p["total_loan_amount"], p["client_name"]))
    return portfolios[:limit]
