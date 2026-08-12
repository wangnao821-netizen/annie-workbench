"""Checklist completeness checker for loan cases.

Compares documents received against the YAML-defined requirements
for a given case type (full_doc / alt_doc / lite_doc) and produces
a ``ChecklistReport`` with received / missing / expired / pending items.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from core.config import ConfigLoader
from core.logger import get_logger
from core.models.orm import Case, CaseFile

logger = get_logger(__name__)


@dataclass
class ChecklistItem:
    """A single checklist requirement."""

    doc_type: str
    status: str  # "received" | "missing" | "expired" | "expiring" | "pending_confirm"
    file_id: str | None = None
    description: str = ""
    min_count: int = 1
    actual_count: int = 0
    conditional: bool = False


@dataclass
class ChecklistReport:
    """Complete checklist evaluation for a case."""

    case_id: str
    case_type: str
    items: list[ChecklistItem] = field(default_factory=list)
    summary: dict[str, int] = field(default_factory=dict)


class CaseNotFoundError(Exception):
    """Raised when the case does not exist in the database."""


def check_completeness(
    case_id: str,
    session: Session,
    config: ConfigLoader,
) -> ChecklistReport:
    """Check document completeness for a loan case.

    Steps:
        1. Look up the case_type from the ``cases`` table.
        2. Load the matching checklist YAML from config.
        3. Query ``processed_files`` to see what has been received.
        4. Compare and produce the report.

    Args:
        case_id: The identifier of the case to check.
        session: SQLAlchemy Session.
        config: Configuration loader.

    Returns:
        A ``ChecklistReport`` with per-item status and summary counts.

    Raises:
        CaseNotFoundError: If the case is not in the database.
    """
    # 1. Get case type
    case = session.get(Case, case_id)
    if case is None:
        raise CaseNotFoundError(f"Case not found: {case_id}")
    case_type = case.case_type

    # 2. Load checklist definition
    checklist_def = config.checklists.get(case_type, {})
    required: dict[str, list[dict[str, Any]]] = checklist_def.get("required", {})

    # 3. Query processed files for this case (APPROVED + REPORTED + MANUALLY_CLASSIFIED)
    processed = (
        session.query(CaseFile).filter_by(case_id=case_id, status="APPROVED").all()
        + session.query(CaseFile).filter_by(case_id=case_id, status="REPORTED").all()
        + session.query(CaseFile).filter_by(case_id=case_id, status="MANUALLY_CLASSIFIED").all()
    )
    received_types: dict[str, list[CaseFile]] = {}
    for pf in processed:
        dt = pf.assigned_type or ""
        if dt:
            received_types.setdefault(dt, []).append(pf)

    # 4. Build items
    items: list[ChecklistItem] = []
    for _category, reqs in required.items():
        for req in reqs:
            doc_type = req.get("type", "")
            desc = req.get("description", "")
            is_conditional = req.get("conditional", False)
            min_count = req.get("min_count", 1)
            max_age_days = req.get("max_age_days")

            if is_conditional:
                items.append(
                    ChecklistItem(
                        doc_type=doc_type,
                        status="pending_confirm",
                        description=desc,
                        min_count=min_count,
                        conditional=True,
                    )
                )
                continue

            matches = received_types.get(doc_type, [])
            actual_count = len(matches)

            if actual_count == 0:
                items.append(
                    ChecklistItem(
                        doc_type=doc_type,
                        status="missing",
                        description=desc,
                        min_count=min_count,
                        actual_count=0,
                    )
                )
                continue

            # Check expiry if max_age_days is set
            status = "received"
            first_file_id = matches[0].id
            if max_age_days is not None:
                created_dt = matches[0].created_at
                if created_dt is not None:
                    if created_dt.tzinfo is None:
                        created_dt = created_dt.replace(tzinfo=UTC)
                    age = (datetime.now(UTC) - created_dt).days
                    if age > max_age_days:
                        status = "expired"
                    elif age > max_age_days - 7:
                        status = "expiring"

            items.append(
                ChecklistItem(
                    doc_type=doc_type,
                    status=status,
                    file_id=first_file_id,
                    description=desc,
                    min_count=min_count,
                    actual_count=actual_count,
                )
            )

    # 5. Summary
    summary: dict[str, int] = {}
    for item in items:
        summary[item.status] = summary.get(item.status, 0) + 1

    report = ChecklistReport(
        case_id=case_id,
        case_type=case_type,
        items=items,
        summary=summary,
    )
    logger.info(
        "Checklist for %s (%s): %s", case_id, case_type, summary
    )
    return report
