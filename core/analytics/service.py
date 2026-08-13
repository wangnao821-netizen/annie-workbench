"""统计分析服务 — 4 个聚合端点口径（复用 _base 帮手，全只读无副作用）。

- 时间取 DB 的 UTC；key 规则见 bucketing.period_key。
- 阶段变化取 CaseMilestone.actual_date（递交/获批/结算落库时间）。
- 任务完成时间取 timeline action_completed 事件，无事件不计入。
- commission 复用 core.commission.calculator（有阶段数据才计，否则 0）。
- 空库一律 0 / 0.0 / None，不报错。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.analytics._base import (
    active_cases,
    approval_days,
    avg_client_reply_days,
    commission_sum,
    completed_actions,
    milestone_counts_by_bucket,
    new_cases_by_bucket,
    normalize_bounds,
)
from core.analytics.bucketing import DEFAULT_BUCKETS, buckets_since
from core.bank_registry import display_name, resolve_lender_key
from core.commission.calculator import _fetch_milestone_dates, get_commission_rates
from core.models.orm import CaseChecklist, EmailDraft, OsCondition

_APPROVED_STAGES = frozenset({"已批准", "批准", "approved", "结算中", "settling", "已结算", "settled"})
_ADOPTED_DRAFT_STATUSES = frozenset({"confirmed", "approved", "sent"})


def _commission_context(db: Session) -> tuple[dict, dict, dict]:
    rates = get_commission_rates()
    return rates, _fetch_milestone_dates(db, "settled"), _fetch_milestone_dates(db, "approved")


def _overview_period(db: Session, granularity: str, bucket: tuple[datetime, datetime, str]) -> dict:
    start, end = normalize_bounds(bucket)
    key = bucket[2]
    new_cases = new_cases_by_bucket(db, granularity, [bucket])[key]
    milestones = {
        m: milestone_counts_by_bucket(db, granularity, [bucket], m)
        for m in ("submitted", "approved", "settled")
    }
    rates, settled_dates, approved_dates = _commission_context(db)
    return {
        "active_cases": len(active_cases(db, start, end)),
        "new_cases": len(new_cases),
        "submitted": milestones["submitted"].get(key, 0),
        "approved": milestones["approved"].get(key, 0),
        "settled": milestones["settled"].get(key, 0),
        "commission_estimate": commission_sum(new_cases, rates, settled_dates, approved_dates),
        "tasks_done": len(completed_actions(db, start, end)),
    }


def get_overview(db: Session, granularity: str) -> dict:
    """current = 最近完整周期；previous = 前一个周期。"""
    buckets = buckets_since(granularity, 2)
    return {
        "granularity": granularity,
        "current": _overview_period(db, granularity, buckets[-1]),
        "previous": _overview_period(db, granularity, buckets[-2]),
    }


def get_pipeline(db: Session, granularity: str, buckets: int | None = None) -> dict:
    """趋势序列：每个周期一条，旧 → 新。"""
    n = buckets if buckets else DEFAULT_BUCKETS[granularity]
    bins = buckets_since(granularity, n)
    new_by_key = new_cases_by_bucket(db, granularity, bins)
    submitted = milestone_counts_by_bucket(db, granularity, bins, "submitted")
    approved = milestone_counts_by_bucket(db, granularity, bins, "approved")
    settled = milestone_counts_by_bucket(db, granularity, bins, "settled")
    rates, settled_dates, approved_dates = _commission_context(db)

    series: list[dict] = []
    for _, _, key in bins:
        cases = new_by_key[key]
        series.append(
            {
                "period": key,
                "new_cases": len(cases),
                "submitted": submitted.get(key, 0),
                "approved": approved.get(key, 0),
                "settled": settled.get(key, 0),
                "amount": round(sum(c.loan_amount or 0 for c in cases), 2),
                "commission": commission_sum(cases, rates, settled_dates, approved_dates),
            }
        )
    return {"granularity": granularity, "series": series}


def get_lenders(db: Session, granularity: str) -> dict:
    """当前周期银行维度：案件数 / 平均审批天数 / OS 占比 / 获批占比。"""
    buckets = buckets_since(granularity, 1)
    start, end = normalize_bounds(buckets[0])
    groups: dict[str, dict] = {}
    for case in active_cases(db, start, end):
        key = case.lender_ref or resolve_lender_key(case.lender) or (case.lender or "").strip() or "未指定银行"
        group = groups.setdefault(key, {"n": 0, "with_os": 0, "approved": 0, "approval_days": []})
        group["n"] += 1
        if db.query(OsCondition).filter(OsCondition.case_id == case.id).count() > 0:
            group["with_os"] += 1
        if case.stage and case.stage.strip() in _APPROVED_STAGES:
            group["approved"] += 1
        days = approval_days(db, case)
        if days is not None:
            group["approval_days"].append(days)

    rows = []
    for key, g in sorted(groups.items(), key=lambda x: (-x[1]["n"], x[0])):
        name = display_name(key) or key
        n = g["n"]
        avg = round(sum(g["approval_days"]) / len(g["approval_days"]), 2) if g["approval_days"] else None
        rows.append(
            {
                "lender": name,
                "lender_key": key,
                "cases": n,
                "avg_approval_days": avg,
                "os_rate": round(g["with_os"] / n, 2) if n else 0.0,
                "approval_rate": round(g["approved"] / n, 2) if n else 0.0,
            }
        )
    return {"granularity": granularity, "lenders": rows}


def _efficiency_period(db: Session, bucket: tuple[datetime, datetime, str]) -> dict:
    start, end = normalize_bounds(bucket)
    completed = completed_actions(db, start, end)

    deadline_pairs = [
        (done, action.delegation_deadline) for action, done in completed if action.delegation_deadline is not None
    ]
    on_time = sum(1 for done, deadline in deadline_pairs if done <= deadline)
    on_time_rate = round(on_time / len(deadline_pairs), 2) if deadline_pairs else 0.0

    checklist_rows = (
        db.query(CaseChecklist).filter(CaseChecklist.updated_at >= start, CaseChecklist.updated_at < end).all()
    )
    checklist_total = len(checklist_rows)
    checklist_received = sum(1 for r in checklist_rows if r.status == "received")
    checklist_confirm_rate = round(checklist_received / checklist_total, 2) if checklist_total else 0.0

    drafts = db.query(EmailDraft).filter(EmailDraft.updated_at >= start, EmailDraft.updated_at < end).all()
    ai_adoption_count = sum(1 for d in drafts if d.status in _ADOPTED_DRAFT_STATUSES)
    for action, _done in completed:
        if action.routing_options:
            ai_adoption_count += 1

    return {
        "tasks_done": len(completed),
        "on_time_rate": on_time_rate,
        "checklist_confirm_rate": checklist_confirm_rate,
        "ai_adoption_count": ai_adoption_count,
        "avg_client_reply_days": avg_client_reply_days(db, start, end),
    }


def get_efficiency(db: Session, granularity: str) -> dict:
    """current vs previous 的作业效率对比。"""
    buckets = buckets_since(granularity, 2)
    return {
        "granularity": granularity,
        "current": _efficiency_period(db, buckets[-1]),
        "previous": _efficiency_period(db, buckets[-2]),
    }