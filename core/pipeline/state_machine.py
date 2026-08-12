"""State-machine driven file processing pipeline.

Orchestrates the full flow: discover → parse → classify → check →
report. Every step records events in the database and validates
state transitions.
"""

from __future__ import annotations

import hashlib
import json
import signal
import sys
import time
from datetime import datetime, UTC
from pathlib import Path
from types import FrameType
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from core.checklist.matcher import check_completeness
from core.pipeline.classifier import classify_and_extract
from core.pipeline.parser import ParseError, parse_file
from core.pipeline.state import FileState, InvalidTransitionError, can_retry, transition
from core.pipeline.watcher import InboxWatcher
from core.ai.gateway import ApiGateway
from core.ai.knowledge_base import CaseKnowledgeBase
from core.config import ConfigLoader
from core.logger import get_logger
from core.events.notifier import Notifier
from core.security.path_guard import PathGuard
from core.pii.gateway import desensitize, rehydrate
from core.models.orm import Action, Case, CaseFile, FileEvent

logger = get_logger(__name__)

_MODULE = "pipeline"


def _make_file_id(path: Path) -> str:
    """Deterministic file ID from the absolute path."""
    return hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:16]


def _advance(
    session: Session,
    file_id: str,
    current: FileState,
    target: FileState,
    details: str | None = None,
) -> FileState:
    """Transition state, update DB, log event."""
    new_state = transition(current, target)
    case_file = session.get(CaseFile, file_id)
    if case_file:
        case_file.status = new_state.value
        case_file.updated_at = datetime.now(UTC)
    event = FileEvent(
        id=uuid4().hex,
        file_id=file_id,
        event_type=new_state.value,
        module=_MODULE,
        details=details,
        timestamp=datetime.now(UTC).isoformat(),
    )
    session.add(event)
    session.commit()
    return new_state


# ---------------------------------------------------------------------------
# Per-stage handlers (each stage is independent, enabling mid-pipeline resume)
# ---------------------------------------------------------------------------


def _handle_discovered(
    file_path: Path,
    file_id: str,
    session: Session,
    config: ConfigLoader,
    pii_manager: PiiManager,
    gateway: ApiGateway,
) -> FileState:
    """DISCOVERED → PARSED: parse the file."""
    # Preview PDF generation (non-blocking — failure is OK)
    from core.pipeline.preview import needs_conversion, convert_to_preview_pdf
    if needs_conversion(file_path):
        try:
            preview_path = convert_to_preview_pdf(file_path, file_id)
            if preview_path:
                case_file = session.get(CaseFile, file_id)
                if case_file:
                    case_file.preview_pdf_path = str(preview_path)
                    session.commit()
        except Exception as e:
            logger.warning("Preview conversion failed (non-critical): %s", e)

    parsed = parse_file(file_path)
    current = _advance(
        session, file_id, FileState.DISCOVERED, FileState.PARSED,
        details=f"route={parsed.parse_route}",
    )
    case_file = session.get(CaseFile, file_id)
    if case_file:
        case_file.status = current.value
        case_file.updated_at = datetime.now(UTC)
        session.commit()
    return current


def _handle_parsed(
    file_path: Path,
    file_id: str,
    session: Session,
    config: ConfigLoader,
    pii_manager: PiiManager,
    gateway: ApiGateway,
) -> FileState:
    """PARSED → EXTRACTED or NEEDS_MANUAL_REVIEW: unified via DocumentProcessingCenter.

    P0 Fix: Delegates to DocumentProcessingCenter which provides:
    - AI classification + regex fallback when AI fails/returns empty fields
    - Quality scoring (compute_quality_score)
    - Field fill rate calculation
    This ensures batch pipeline quality matches manual single-file reparse.
    """
    from core.pipeline.processing_center import DocumentProcessingCenter

    # Get case_id from CaseFile record
    cf = session.get(CaseFile, file_id)
    case_id = cf.case_id if cf else ""

    # Use DocumentProcessingCenter — same path as manual reparse button
    center = DocumentProcessingCenter(
        config=config,
        pii_manager=pii_manager,
        gateway=gateway,
    )
    result = center.process(file_path, file_id, case_id, session)

    # Safety net: ensure CaseFile fields are populated even if DPC didn't persist
    # (DPC normally persists in its own commit, but this guards against edge cases)
    cf = session.get(CaseFile, file_id)
    if cf:
        cf.assigned_type = result.document_type
        cf.confidence = result.confidence
        cf.suggested_name = result.suggested_name
        cf.extracted_data = json.dumps(result.extracted_fields, ensure_ascii=False) if result.extracted_fields else cf.extracted_data
        session.commit()

    # Determine state transition based on result quality
    threshold = config.settings.ai.confidence_threshold
    if result.confidence < threshold or result.document_type == "Unknown":
        current = _advance(
            session, file_id, FileState.PARSED, FileState.NEEDS_MANUAL_REVIEW,
            details=f"DPC: type={result.document_type} conf={result.confidence:.2f} "
                    f"quality={result.quality_score} method={result.processing_method}",
        )
        return current

    # High confidence → EXTRACTED
    current = _advance(
        session, file_id, FileState.PARSED, FileState.EXTRACTED,
        details=f"DPC: type={result.document_type} conf={result.confidence:.2f} "
                f"quality={result.quality_score} method={result.processing_method}",
    )
    return current


def _handle_extracted(
    file_id: str,
    case_id: str,
    session: Session,
    config: ConfigLoader,
) -> FileState:
    """EXTRACTED → ANALYZED: run checklist check."""
    check_completeness(case_id, session, config)
    current = _advance(
        session, file_id, FileState.EXTRACTED, FileState.ANALYZED,
        details="Checklist checked",
    )
    return current


def _handle_analyzed(
    file_id: str,
    session: Session,
) -> FileState:
    """ANALYZED → APPROVED/NEEDS_REVIEW based on confidence threshold."""
    cf = session.get(CaseFile, file_id)
    confidence = cf.confidence if cf else 0.0
    doc_type = cf.assigned_type if cf else "Unknown"

    # Auto-approve if high confidence and not Unknown
    if confidence >= 0.85 and doc_type != "Unknown":
        current = _advance(
            session, file_id, FileState.ANALYZED, FileState.REPORTED,
            details=f"Auto-approved (conf={confidence:.2f})",
        )
        cf2 = session.get(CaseFile, file_id)
        if cf2:
            cf2.status = "APPROVED"
            cf2.updated_at = datetime.now(UTC)
            session.commit()
    else:
        current = _advance(
            session, file_id, FileState.ANALYZED, FileState.REPORTED,
            details=f"Needs review (conf={confidence:.2f}, type={doc_type})",
        )
        cf2 = session.get(CaseFile, file_id)
        if cf2:
            cf2.status = "NEEDS_MANUAL_REVIEW"
            cf2.updated_at = datetime.now(UTC)
            session.commit()

        # If case has no pending classify Action, insert one
        if cf:
            case_id = cf.case_id
            existing_action = (
                session.query(Action)
                .filter_by(case_id=case_id, type="classify", status="pending")
                .first()
            )
            if not existing_action:
                case_obj = session.get(Case, case_id)
                client_name = case_obj.client_name if case_obj else "未知客户"
                new_action = Action(
                    case_id=case_id,
                    type="classify",
                    title=f"上传文件待确认分类 ({client_name})",
                    priority="medium",
                    status="pending",
                    assignee="vera",
                    ai_suggestion="系统检测到置信度较低的上传文件，请人工确认分类。",
                    created_at=datetime.now(UTC),
                )
                session.add(new_action)
                session.commit()
                logger.info("Created classify action for case %s", case_id)

    return current


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------


def process_file(
    file_path: Path,
    case_id: str,
    config: ConfigLoader,
    session: Session,
    pii_manager: PiiManager,
    gateway: ApiGateway,
) -> None:
    """Process a single file through the pipeline.

    State machine driven — each step transitions the file to the next
    state. On failure the file is marked FAILED (and can be retried).
    The original file is NEVER moved, renamed, or deleted.

    Each stage is an independent handler, enabling resume from any
    intermediate state after a crash or failure.

    Args:
        file_path: Path to the file (inside ``_Inbox/``).
        case_id: Case identifier.
        config: Configuration loader.
        session: SQLAlchemy Session.
        pii_manager: Shared PiiManager instance (reuses spaCy model).
        gateway: Shared ApiGateway instance (reuses HTTP client).
    """
    file_id = _make_file_id(file_path)
    existing = session.get(CaseFile, file_id)
    current_status = existing.status if existing else None

    # Determine starting state
    if current_status is None:
        current = FileState.DISCOVERED
        try:
            size = file_path.stat().st_size
        except OSError:
            size = 0
        new_file = CaseFile(
            id=file_id,
            case_id=case_id,
            nas_path=str(file_path),
            original_name=file_path.name,
            file_extension=file_path.suffix.lower(),
            file_size=size,
            status=current.value,
        )
        session.merge(new_file)
        event = FileEvent(
            id=uuid4().hex,
            file_id=file_id,
            event_type=current.value,
            module="pipeline",
            details=f"Auto-registered file: {file_path.name}",
            timestamp=datetime.now(UTC).isoformat(),
        )
        session.add(event)
        session.commit()
    else:
        current = FileState(current_status)

    # If FAILED, retry → reset to DISCOVERED
    if can_retry(current):
        current = _advance(session, file_id, current, FileState.DISCOVERED,
                           details="Retrying")

    try:
        # Each stage is independent — pipeline can resume from any state
        if current == FileState.DISCOVERED:
            current = _handle_discovered(
                file_path, file_id, session, config, pii_manager, gateway,
            )

        if current == FileState.PARSED:
            current = _handle_parsed(
                file_path, file_id, session, config, pii_manager, gateway,
            )

        if current == FileState.EXTRACTED:
            current = _handle_extracted(file_id, case_id, session, config)

        if current == FileState.ANALYZED:
            current = _handle_analyzed(file_id, session)
            # Auto-refresh case knowledge base after classification
            try:
                kb = CaseKnowledgeBase(session)
                kb.build_knowledge(case_id)
            except Exception as kb_err:
                logger.warning("Knowledge base refresh failed: %s", kb_err)

    except (ParseError, InvalidTransitionError, Exception) as exc:
        # Mark FAILED — original file untouched
        logger.error("Pipeline error for %s: %s", file_path.name, exc)
        try:
            _advance(session, file_id, current, FileState.FAILED,
                     details=str(exc))
        except InvalidTransitionError:
            already = FileEvent(
                id=uuid4().hex,
                file_id=file_id,
                event_type="ERROR",
                module=_MODULE,
                error=str(exc),
                timestamp=datetime.now(UTC).isoformat(),
            )
            session.add(already)
            session.commit()


def run_pipeline(config: ConfigLoader) -> None:
    """Main loop: watch for files and process them.

    Creates shared instances of PiiManager and ApiGateway once, then
    reuses them for all file processing (avoiding repeated spaCy model
    loads and HTTP client creation).

    Args:
        config: Loaded project configuration.
    """
    project_root = config.project_root
    guard = PathGuard(project_root, config.client_files_root)

    # Create shared instances once
    pii_manager = PiiManager()
    gateway = ApiGateway(config)

    # SA session factory for watcher and pipeline
    from core.models.db import get_sa_session, get_sa_session_factory
    session_factory = get_sa_session_factory()

    pipeline_session = next(get_sa_session())
    notifier = Notifier(config, pipeline_session, guard)
    watcher = InboxWatcher(config, session_factory, guard)

    # Graceful shutdown
    def _signal_handler(sig: int, frame: FrameType | None) -> None:
        logger.info("Received signal %s — shutting down", sig)
        watcher.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)

    logger.info("Pipeline started — watching for files")
    watcher.start()

    try:
        while True:
            new_files = watcher.discover_files()
            processed_cases: set[str] = set()
            for fpath in new_files:
                case_id = fpath.parent.parent.name
                process_file(fpath, case_id, config, pipeline_session, pii_manager, gateway)
                processed_cases.add(case_id)

            # Generate reports for cases that had new files
            for cid in processed_cases:
                try:
                    notifier.generate_report(cid)
                except Exception:
                    logger.exception("Report generation failed for %s", cid)

            time.sleep(config.settings.watch.poll_interval_seconds)
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt — stopping")
    finally:
        pipeline_session.close()
        watcher.stop()