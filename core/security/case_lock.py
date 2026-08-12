"""Case Lock Guard — enforces field immutability on terminal-stage cases.

Red Line compliance:
    - Terminal cases (settled/withdrawn/declined/resubmitted) have core
      financial fields locked to prevent accidental or malicious modification.
    - Reopen requires explicit user action via POST /api/cases/{id}/reopen.

Usage::

    from core.security.case_lock import assert_not_locked

    @router.put("/api/cases/{case_id}")
    def update_case(case_id: str, updates: dict, db: Session = Depends(...)):
        case = db.query(Case).get(case_id)
        assert_not_locked(case, updates)
        ...
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)

# 终态阶段 — 统一从 constants 导入
from core.constants import TERMINAL_STAGES

# 锁定字段集合（snake_case，对应 DB 列名和 API 请求体 key）
LOCKED_FIELDS: set[str] = {
    "loan_amount",
    "lender",
    "loan_purpose",
    "purpose",       # SA model alias
    "lvr",
    "stage",
    "broker_notes",
    "property_value",
}


def is_terminal(stage: str | None) -> bool:
    """判断案件是否处于终态。

    Args:
        stage: 案件当前 stage 值（中文标签或英文 key 均可）。

    Returns:
        True if the case is in a terminal stage.
    """
    if not stage:
        return False
    return stage.lower() in {s.lower() for s in TERMINAL_STAGES}


def assert_not_locked(case: Case, updates: dict[str, Any]) -> None:
    """如果案件已终态且试图修改锁定字段，抛出 HTTP 403。

    Args:
        case: SQLAlchemy Case instance.
        updates: Dict of field names to new values being applied.

    Raises:
        HTTPException: 403 if locked fields are being modified.
    """
    if not is_terminal(case.stage):
        return

    locked_updates = set(updates.keys()) & LOCKED_FIELDS
    if locked_updates:
        logger.warning(
            "Blocked modification of locked fields %s on terminal case %s (stage=%s)",
            locked_updates, case.id, case.stage,
        )
        raise HTTPException(
            status_code=403,
            detail=(
                f"案件已{case.stage}，以下字段已锁定：{sorted(locked_updates)}。"
                f"如需修改请先「重新打开」案件。"
            ),
        )


def get_allowed_fields_for_terminal() -> set[str]:
    """返回终态案件仍允许修改的字段集合（供文档/前端参考）。

    Returns:
        Set of field names that are NOT locked even on terminal cases.
    """
    return {
        "close_note",       # 可追加备注
        "close_reason",     # 管理员修正
        "context_summary",  # AI 可更新摘要
    }
