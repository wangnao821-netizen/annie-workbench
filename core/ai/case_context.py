"""统一案件上下文服务 — AI 注入与客户全景共用唯一数据源。

复用 core.ai.context_builder 的案件大脑（_build_case_brain）与
清单/OS 统计口径（_build_live_data），输出结构化字典，
供 GET /api/cases/{case_id}/context 与 AI 上下文注入共同消费。
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from core.ai.case_summary import get_case_one_liner
from core.ai.context_builder import _build_case_brain
from core.holidays import is_working_day, load_holidays
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseTimelineEvent, OsCondition

logger = get_logger(__name__)

# 已收状态集合（与 _build_live_data / cases._COLLECTED 口径一致）
_COLLECTED = ("received", "collected", "waived", "deferred")

_EVENT_LIMIT = 5

_TRACKS = ("internal", "external")


def _build_facts(case: Case, track: str = "internal") -> dict:
    """案件基础事实字段。

    internal 视图额外含 internal_notes；external 视图严格剔除 internal_notes（红线 S4）。
    """
    facts = {
        "client_name": case.client_name,
        "lender": case.lender,
        "loan_amount": case.loan_amount,
        "property_value": case.property_value,
        "lvr": case.lvr,
        "purpose": case.purpose,
        "interest_rate": case.interest_rate,
        "stage": case.stage,
        "client_goal": case.client_goal,
        "special_circumstances": case.special_circumstances,
    }
    if track != "external":
        facts["internal_notes"] = case.internal_notes
    return facts


def _build_checklist(case_id: str, db: Session) -> dict:
    """清单统计 — missing = 状态不在已收集合。"""
    items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    done = sum(1 for i in items if i.status in _COLLECTED)
    missing = [i.item_name for i in items if i.status not in _COLLECTED]
    return {"done": done, "total": len(items), "missing": missing}


def _build_os(case_id: str, db: Session) -> dict:
    """OS 条件统计 — 口径与 _build_live_data 一致（列出全部带状态）。"""
    conditions = db.query(OsCondition).filter(OsCondition.case_id == case_id).all()
    pending_count = sum(1 for c in conditions if c.status == "pending")
    items = [{"raw_text": c.raw_text, "status": c.status} for c in conditions]
    return {"pending_count": pending_count, "items": items}


def _build_deadlines(case: Case) -> dict:
    """截止日期 — finance_due 为 ISO 字符串或 None。"""
    if not case.finance_deadline:
        return {"finance_due": None, "days_left": None}
    finance = case.finance_deadline
    if finance.tzinfo is None:
        finance = finance.replace(tzinfo=UTC)  # SQLite 存 naive，补 UTC 再比较
    days_left = (finance - datetime.now(UTC)).days
    return {"finance_due": case.finance_deadline.isoformat(), "days_left": days_left}


def _build_risk(
    checklist: dict,
    os: dict,
    deadlines: dict,
    lvr,
    finance_workday: tuple[bool, str | None] | None = None,
) -> list[str]:
    """风险推导：到期<7天 / OS 待处理 / 清单缺项 / LVR≥90 / 截止日银行休息日。

    finance_workday = is_working_day(finance_date, default_state) 结果；
    None（默认）时不注入，既有调用零影响。新风险仅追加在 LVR 之后。
    """
    risk: list[str] = []
    days_left = deadlines.get("days_left")
    if days_left is not None and days_left < 7:
        risk.append(f"Finance Clause 不足 7 天（剩 {days_left} 天）")
    if os["pending_count"] > 0:
        risk.append(f"有 {os['pending_count']} 条 OS 条件待处理")
    if checklist["missing"]:
        risk.append(f"清单缺 {len(checklist['missing'])} 项材料")
    if lvr is not None and lvr >= 90:
        risk.append(f"LVR 达 {lvr}%，接近 90% 红线")
    if finance_workday is not None and not finance_workday[0]:
        finance_due = deadlines.get("finance_due") or ""
        date_str = finance_due[:10] if finance_due else ""
        risk.append(f"Finance Clause 截止日（{date_str}）是银行休息日（{finance_workday[1] or '周末'}），建议提前")
    return risk


def _build_timeline(case_id: str, db: Session) -> list[dict]:
    """最新 N 条时间线事件。"""
    events = (
        db.query(CaseTimelineEvent)
        .filter(CaseTimelineEvent.case_id == case_id)
        .order_by(CaseTimelineEvent.created_at.desc(), CaseTimelineEvent.id.desc())
        .limit(_EVENT_LIMIT)
        .all()
    )
    return [
        {
            "event_type": e.event_type,
            "title": e.title,
            "description": e.description,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


def _build_track_memory(case: Case, db: Session, track: str) -> str:
    """按轨道取记忆：
    - external: 外线蒸馏 submission_summary（无则空串；绝不回退到内线记忆）
    - internal: 内线蒸馏 context_summary（无蒸馏时回退案件大脑，保持既有行为）
    """
    if track == "external":
        return case.submission_summary or ""
    return case.context_summary or _build_case_brain(case, db)


_SEMANTIC_BUDGET = 300


def _build_semantic_memory(case_id: str, db: Session, track: str) -> str:
    """语义召回（BrainFact 向量 top-5），并入 team_experience 槽；不可用返回空串。

    只做 internal 轨（external 轨不注入语义召回，防内线泄漏——红线）。
    响应字段不新增：语义片段合并进既有的 team_experience/memory 槽（≤300 字符预算）。
    """
    if track != "internal":
        return ""
    try:
        from core.knowledge.vector import semantic_search

        case = db.query(Case).filter(Case.id == case_id).first()
        if case is None:
            return ""
        seed = (case.context_summary or _build_case_brain(case, db))[:200] or "案件"
        hits = semantic_search(db, seed, case_id=case_id, track="internal", limit=5)
    except Exception:  # noqa: BLE001 — 语义层不可用不阻断上下文构建
        return ""
    if not hits:
        return ""
    lines: list[str] = []
    used = 0
    for hit in hits:
        line = f"[语义] {hit['key']}: {hit['value']}"
        if used + len(line) > _SEMANTIC_BUDGET:
            line = line[: max(0, _SEMANTIC_BUDGET - used)]
            if line:
                lines.append(line)
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines)


def build_case_context(case_id: str, db: Session, track: str = "internal") -> dict:
    """统一案件上下文：AI 注入与客户全景共用。

    tracks:
        - "internal": facts 含 internal_notes；memory 用内线蒸馏（context_summary）。
        - "external": facts 不含 internal_notes；memory 用外线蒸馏（submission_summary，无则空串）。

    Raises:
        ValueError: track 不是 "internal" / "external"。
    """
    if track not in _TRACKS:
        raise ValueError(f"track must be one of {_TRACKS}, got {track!r}")

    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        logger.warning("build_case_context: case %s not found", case_id)
        return {
            "case_id": case_id,
            "track": track,
            "facts": {},
            "checklist": {"done": 0, "total": 0, "missing": []},
            "os": {"pending_count": 0, "items": []},
            "deadlines": {"finance_due": None, "days_left": None},
            "risk": [],
            "timeline": [],
            "memory": "",
            "summary": "",
        }

    checklist = _build_checklist(case_id, db)
    os = _build_os(case_id, db)
    deadlines = _build_deadlines(case)

    finance_workday = None
    if case.finance_deadline:
        finance = case.finance_deadline
        if finance.tzinfo is None:
            finance = finance.replace(tzinfo=UTC)  # SQLite 存 naive，补 UTC 再取日期
        finance_date = finance.astimezone(UTC).date()
        finance_workday = is_working_day(finance_date, load_holidays()["default_state"])

    memory = _build_track_memory(case, db, track)
    if track == "internal":
        semantic_memory = _build_semantic_memory(case_id, db, track)
        if semantic_memory:
            memory = f"{memory}\n{semantic_memory}" if memory else semantic_memory

    result = {
        "case_id": case_id,
        "track": track,
        "facts": _build_facts(case, track),
        "checklist": checklist,
        "os": os,
        "deadlines": deadlines,
        "risk": _build_risk(checklist, os, deadlines, case.lvr, finance_workday),
        "timeline": _build_timeline(case_id, db),
        "memory": memory,
        # 外线视图的 summary 不得取自内线蒸馏（context_summary 与一句话摘要同列，
        # 直接复用会泄漏内线内容），红线 S4
        "summary": get_case_one_liner(case_id, db) if track != "external" else None,
    }
    if track == "external":
        result["submission_summary"] = case.submission_summary
    else:
        result["internal_notes"] = case.internal_notes
    return result