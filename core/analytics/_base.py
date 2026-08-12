"""analytics 内部聚合助手（_base）— 仅供 core/analytics/service 复用。

包含：时间归一化、案件/里程碑/任务完成事件的周期归桶、佣金复用、
银行审批天数估算、催件回复平均响应时长。全部只读不写。
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from core.analytics.bucketing import period_key
from core.commission.calculator import calculate_case_commission
from core.models.orm import (
    Action,
    Case,
    CaseMilestone,
    CaseTimelineEvent,
    EmailDraft,
    EmailDraftReply,
)

_ADOPTED_DRAFT_STATUSES = frozenset({"confirmed", "approved", "sent"})


def _to_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def _db_naive(dt: datetime) -> datetime:
    """转成 DB 存量的 naive UTC，保证 SQLite 比较/边界一致。"""
    return dt.astimezone(UTC).replace(tzinfo=None)


def normalize_bounds(bucket: tuple[datetime, datetime, str]) -> tuple[datetime, datetime]:
    """把 bucket 的 aware 边界转成 naive（DB 内时间均为 naive UTC）。"""
    return _db_naive(bucket[0]), _db_naive(bucket[1])


def new_cases_by_bucket(
    db: Session, granularity: str, buckets: list[tuple[datetime, datetime, str]]
) -> dict[str, list[Case]]:
    by_key: dict[str, list[Case]] = {key: [] for _, _, key in buckets}
    for case in db.query(Case).all():
        if case.created_at is None:
            continue
        key = period_key(case.created_at, granularity)
        if key in by_key:
            by_key[key].append(case)
    return by_key


def milestone_counts_by_bucket(
    db: Session, granularity: str, buckets: list[tuple[datetime, datetime, str]], milestone: str
) -> dict[str, int]:
    """每周期某里程碑落库的去重案件数（一次推进计一次）。"""
    counts = {key: 0 for _, _, key in buckets}
    seen: set[tuple[str, str]] = set()
    rows = (
        db.query(CaseMilestone.case_id, CaseMilestone.actual_date)
        .filter(CaseMilestone.milestone_name == milestone, CaseMilestone.actual_date.isnot(None))
        .all()
    )
    for case_id, actual in rows:
        if actual is None:
            continue
        key = period_key(actual, granularity)
        if key in counts and (case_id, key) not in seen:
            seen.add((case_id, key))
            counts[key] += 1
    return counts


def active_cases(db: Session, start: datetime, end: datetime) -> list[Case]:
    """周期内存活案件：创建早于周期末，且（未关闭 或 关闭晚于周期初）。"""
    start, end = _db_naive(start), _db_naive(end)
    active: list[Case] = []
    for case in db.query(Case).all():
        created = _db_naive(case.created_at) if case.created_at is not None else None
        if created is None or not created < end:
            continue
        closed = _db_naive(case.closed_at) if case.closed_at is not None else None
        if closed is not None and closed < start:
            continue
        active.append(case)
    return active


def action_completed_at(db: Session) -> dict[str, datetime]:
    """action_id(str) → 完成时间（timeline action_completed 事件 created_at）。"""
    result: dict[str, datetime] = {}
    events = (
        db.query(CaseTimelineEvent)
        .filter(CaseTimelineEvent.event_type == "action_completed")
        .order_by(CaseTimelineEvent.created_at.desc())
        .all()
    )
    for evt in events:
        if evt.source_ref and evt.created_at and evt.source_ref not in result:
            result[evt.source_ref] = evt.created_at
    return result


def completed_actions(db: Session, start: datetime, end: datetime) -> list[tuple[Action, datetime]]:
    """周期内完成的任务：状态 completed 且有 timeline 完成事件；无事件不硬算。"""
    start, end = _db_naive(start), _db_naive(end)
    completed_at = action_completed_at(db)
    result: list[tuple[Action, datetime]] = []
    for action in db.query(Action).filter(Action.status == "completed").all():
        done = completed_at.get(str(action.id))
        if done is not None and start <= done < end:
            result.append((action, done))
    return result


def commission_sum(cases: list[Case], rates, settled_dates, approved_dates) -> float:
    """复用 calculator 估算首期佣金；无阶段数据/无费率/终止态 → 0。"""
    total = 0.0
    for case in cases:
        row = calculate_case_commission(case, rates, settled_dates, approved_dates)
        if row is not None and row.get("upfront") is not None:
            total += row["upfront"]
    return round(total, 2)


def approval_days(db: Session, case: Case) -> float | None:
    """submitted → approved 里程碑实际日期差（天）；缺里程碑 → None。"""
    dates = {
        m.milestone_name: m.actual_date
        for m in db.query(CaseMilestone)
        .filter(CaseMilestone.case_id == case.id, CaseMilestone.actual_date.isnot(None))
        .all()
    }
    submitted, approved = dates.get("submitted"), dates.get("approved")
    if not submitted or not approved:
        return None
    days = (_to_utc(approved) - _to_utc(submitted)).total_seconds() / 86400.0
    return days if days >= 0 else None


def avg_client_reply_days(db: Session, start: datetime, end: datetime) -> float | None:
    """催件邮件发送（follow_up 确认）→ 客户回复平均天数；无数据 → None。"""
    start, end = _db_naive(start), _db_naive(end)
    follow_ups = (
        db.query(EmailDraft)
        .filter(
            EmailDraft.draft_type == "follow_up",
            EmailDraft.approved_at.isnot(None),
            EmailDraft.approved_at >= start,
            EmailDraft.approved_at < end,
        )
        .all()
    )
    diffs: list[float] = []
    for draft in follow_ups:
        sent_at = _to_utc(draft.approved_at)
        for reply in (
            db.query(EmailDraftReply)
            .filter(EmailDraftReply.draft_id == draft.id, EmailDraftReply.received_at.isnot(None))
            .all()
        ):
            days = (_to_utc(reply.received_at) - sent_at).total_seconds() / 86400.0
            if days >= 0:
                diffs.append(days)
    if not diffs:
        return None
    return round(sum(diffs) / len(diffs), 2)