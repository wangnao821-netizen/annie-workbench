"""一句话摘要服务 — 懒刷新 + dirty 标记。

5 条 dirty 写路径（design §4.3）：
    1. AI 对话工具执行成功（chat.py）
    2. 邮件匹配/归案（core/inbox/matching.py）
    3. 清单状态变更（files.py confirm/revoke）
    4. 文件确认/清单关联（files.py confirm）
    5. 阶段推进（cases.py stage-advance）

缓存策略：进程内 _CACHE（30 分钟有效）+ Case.context_summary 持久化；
dirty 只清缓存与置空持久化，不调 LLM；打开时懒刷新。
"""

from __future__ import annotations

import time

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, OsCondition
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_MAX_LEN = 50
_STALE_SECONDS = 30 * 60
_COLLECTED = ("received", "collected", "waived", "deferred")

_CACHE: dict[str, tuple[str, float]] = {}


def _get_case(case_id: str, db: Session) -> Case | None:
    return db.query(Case).filter(Case.id == case_id).first()


def _truncate(text: str) -> str:
    return (text or "").strip()[: _MAX_LEN]


def _rule_fallback(case: Case, db: Session) -> str:
    """无 LLM 时的确定性一句话摘要（≤50 字）。"""
    checklist = (
        db.query(CaseChecklist).filter(CaseChecklist.case_id == case.id).all()
    )
    done = sum(1 for c in checklist if c.status in _COLLECTED)
    os_pending = (
        db.query(OsCondition)
        .filter(OsCondition.case_id == case.id, OsCondition.status == "pending")
        .count()
    )
    parts: list[str] = []
    if case.lender:
        parts.append(case.lender)
    if case.loan_amount:
        parts.append(f"${case.loan_amount:,.0f}")
    parts.append(case.stage or "收集资料")
    parts.append(f"清单 {done}/{len(checklist)}")
    if os_pending:
        parts.append(f"OS {os_pending}")
    if case.purpose:
        parts.append(case.purpose)
    return _truncate(" · ".join(parts))


def mark_case_summary_dirty(case_id: str, db: Session) -> None:
    """只标记 dirty（清缓存 + 置空持久化摘要），不调 LLM。"""
    _CACHE.pop(case_id, None)
    case = _get_case(case_id, db)
    if case is not None and case.context_summary:
        case.context_summary = None
        try:
            db.commit()
        except Exception as exc:  # noqa: BLE001 — 标记失败不影响主流程
            db.rollback()
            logger.warning("mark_case_summary_dirty commit failed for %s: %s", case_id, exc)


def refresh_case_summary(case_id: str, db: Session) -> str:
    """生成 ≤50 字中文一句话摘要（复用案件数据 + ApiGateway，输入脱敏）。"""
    case = _get_case(case_id, db)
    if case is None:
        return ""

    checklist = (
        db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    )
    done = sum(1 for c in checklist if c.status in _COLLECTED)
    os_pending = (
        db.query(OsCondition)
        .filter(OsCondition.case_id == case_id, OsCondition.status == "pending")
        .count()
    )
    loan = f"${case.loan_amount:,.0f}" if case.loan_amount else "待定"
    source = (
        f"客户:{case.client_name}; 银行:{case.lender or '待定'}; 金额:{loan}; "
        f"阶段:{case.stage or '待定'}; 目的:{case.purpose or '待定'}; "
        f"清单:{done}/{len(checklist)}; OS待处理:{os_pending}; "
        f"特殊情况:{case.special_circumstances or '无'}"
    )

    one_liner = ""
    try:
        safe = desensitize(source, case_id, db)
        prompt = (
            "根据以下案件信息生成一句话中文摘要（不超过50字），"
            "体现银行/金额/阶段/清单进度/当前卡点。只输出摘要，不要前后缀。\n"
            f"{safe}"
        )
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(prompt),
            prompt_template="Generate a one-line Chinese case summary.",
        )
        one_liner = rehydrate(result.response_text.strip(), case_id, db)
    except (Exception, SystemExit) as exc:  # noqa: BLE001 — 懒刷新失败一律回退规则摘要
        logger.warning("one-liner LLM failed for %s, fallback to rules: %s", case_id, exc)

    one_liner = _truncate(one_liner) or _rule_fallback(case, db)
    one_liner = _truncate(one_liner)

    case.context_summary = one_liner
    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("refresh_case_summary commit failed for %s: %s", case_id, exc)
    _CACHE[case_id] = (one_liner, time.time())
    return one_liner


def get_case_one_liner(case_id: str, db: Session) -> str:
    """优先取缓存（未超时 30min），否则取持久化；dirty/无值则懒刷新。"""
    cached = _CACHE.get(case_id)
    if cached and (time.time() - cached[1]) < _STALE_SECONDS:
        return cached[0]

    case = _get_case(case_id, db)
    if case is not None and case.context_summary:
        _CACHE[case_id] = (case.context_summary, time.time())
        return case.context_summary

    return refresh_case_summary(case_id, db)