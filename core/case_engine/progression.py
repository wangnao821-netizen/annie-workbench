"""Stage progression engine — evaluates AI stage signals and creates Actions.

Core logic:
- Reads stage_signals.yaml for signal → target_stage mapping
- Validates progression legality (no backward, no skip > 3, no terminal)
- Creates Action(type="stage_advance") for Vera to confirm
- Confirmation triggers actual case.stage update via core.case_engine.milestones

Red Line compliance:
- AI NEVER directly modifies case.stage
- All progression requires Vera's explicit confirmation via Action Inbox
- Terminal cases are protected from any stage changes
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Action, Case

logger = get_logger(__name__)

# Load stage signals configuration
_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "stage_signals.yaml"

# Milestone sequence/stage map — single source of truth in milestones.py
from core.case_engine.milestones import (
    MILESTONE_SEQUENCE,
    MILESTONE_STAGE_MAP,
    update_case_stage_and_milestones,
)

# Terminal stages — unified from constants
from core.constants import TERMINAL_STAGES

# Max allowed jump steps before marking as high-risk
MAX_SAFE_JUMP = 2
# Absolute max jump — beyond this, signal is rejected
MAX_ABSOLUTE_JUMP = 5


def _load_signal_config() -> dict:
    """Load stage_signals.yaml configuration.

    Returns:
        Dict mapping signal_name → {target_stage, description, ...}
    """
    if not _CONFIG_PATH.exists():
        logger.warning("stage_signals.yaml not found at %s", _CONFIG_PATH)
        return {}

    with open(_CONFIG_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    return data.get("stage_signals", {})


def _get_stage_key(db_stage: str | None) -> str | None:
    """Map DB stage (Chinese label or English key) to English key.

    Args:
        db_stage: The current stage value from DB.

    Returns:
        English key or None if not mappable.
    """
    if not db_stage:
        return "gathering"
    for key, label in MILESTONE_STAGE_MAP.items():
        if label == db_stage or key == db_stage:
            return key
    return None


def _get_stage_index(stage_key: str) -> int:
    """Get index in MILESTONE_SEQUENCE. Returns -1 if not found."""
    try:
        return MILESTONE_SEQUENCE.index(stage_key)
    except ValueError:
        return -1


def evaluate_stage_signal(
    case_id: str,
    stage_signal: str,
    inbox_msg_id: str,
    db: Session,
) -> Action | None:
    """Evaluate a stage signal and potentially create a progression Action.

    This function NEVER modifies case.stage directly.

    Args:
        case_id: The case that received the signal.
        stage_signal: The AI-detected signal (e.g. "approved").
        inbox_msg_id: The inbox message that triggered this.
        db: SQLAlchemy session.

    Returns:
        The created Action if progression is valid, None otherwise.
    """
    # Guard: empty case_id
    if not case_id:
        logger.debug("No case_id provided, skipping stage evaluation")
        return None

    # Guard: empty signal
    if not stage_signal:
        logger.debug("No stage_signal provided, skipping")
        return None

    # Load config
    signals_config = _load_signal_config()
    signal_info = signals_config.get(stage_signal)
    if not signal_info:
        logger.debug(
            "Unknown stage_signal: %s (not in config)", stage_signal
        )
        return None

    # Look up the case
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        logger.warning("Case not found: %s", case_id)
        return None

    # Guard: terminal state
    current_stage = case.stage or ""
    if current_stage in TERMINAL_STAGES:
        logger.info(
            "Case %s is in terminal state (%s), ignoring signal %s",
            case_id, current_stage, stage_signal,
        )
        return None

    # Special handling for on_hold — not a normal milestone progression
    if stage_signal == "on_hold":
        if current_stage == "暂停中" or current_stage == "on_hold":
            logger.info("Case %s already on_hold, ignoring duplicate signal", case_id)
            return None

        # Check for duplicate pending action
        existing = (
            db.query(Action)
            .filter(
                Action.case_id == case_id,
                Action.type == "STAGE_ADVANCE",
                Action.status == "pending",
                Action.title.contains("暂停"),
            )
            .first()
        )
        if existing:
            logger.debug("Duplicate on_hold action exists for case %s", case_id)
            return None

        action = Action(
            case_id=case_id,
            type="STAGE_ADVANCE",
            title=f"AI建议暂停案件（当前：{current_stage}）",
            priority="medium",
            status="pending",
            ai_suggestion=json.dumps({
                "signal": "on_hold",
                "from_stage": current_stage,
                "target_stage": "暂停中",
                "description": signal_info.get("description", "检测到案件需暂停"),
                "inbox_msg_id": inbox_msg_id,
            }, ensure_ascii=False),
        )
        db.add(action)
        db.flush()
        logger.info(
            "on_hold Action created for case %s (action_id=%s)",
            case_id, action.id,
        )
        return action

    # Resolve current and target stage keys
    current_key = _get_stage_key(current_stage)
    # Config uses target_stage (Chinese label) — reverse-map to English key
    target_label_from_config = signal_info.get("target_stage", "")
    target_key = _get_stage_key(target_label_from_config)

    if current_key is None:
        logger.warning(
            "Cannot resolve current stage '%s' to key", current_stage
        )
        return None

    current_idx = _get_stage_index(current_key)
    target_idx = _get_stage_index(target_key)

    if target_idx < 0:
        logger.warning("Target key '%s' not in milestone sequence", target_key)
        return None

    # Guard: backward progression
    if target_idx <= current_idx:
        logger.info(
            "Backward/same signal rejected: case %s at %s (idx %d), "
            "signal wants %s (idx %d)",
            case_id, current_key, current_idx, target_key, target_idx,
        )
        return None

    # Guard: excessive jump
    jump = target_idx - current_idx
    if jump > MAX_ABSOLUTE_JUMP:
        logger.warning(
            "Jump too large (%d steps) for case %s, rejecting signal %s",
            jump, case_id, stage_signal,
        )
        return None

    # Check for duplicate pending action
    existing = (
        db.query(Action)
        .filter(
            Action.case_id == case_id,
            Action.type == "stage_advance",
            Action.status == "pending",
        )
        .first()
    )
    if existing:
        logger.info(
            "Case %s already has pending stage_advance action (id=%d)",
            case_id, existing.id,
        )
        return None

    # Build the Action
    target_label = MILESTONE_STAGE_MAP.get(target_key, target_key)
    is_high_risk = jump > MAX_SAFE_JUMP
    priority = "high" if is_high_risk else "medium"

    action = Action(
        case_id=case_id,
        type="stage_advance",
        title=f"阶段推进建议：{current_stage} → {target_label}",
        priority=priority,
        status="pending",
        assignee="vera",
        ai_suggestion=json.dumps({
            "signal": stage_signal,
            "current_stage": current_stage,
            "current_key": current_key,
            "target_stage": target_label,
            "target_key": target_key,
            "jump_steps": jump,
            "is_high_risk": is_high_risk,
            "trigger_msg_id": inbox_msg_id,
            "description": signal_info.get("description", ""),
        }, ensure_ascii=False),
    )
    db.add(action)
    db.commit()

    logger.info(
        "Created stage_advance Action for case %s: %s → %s (jump=%d, risk=%s)",
        case_id, current_stage, target_label, jump,
        "HIGH" if is_high_risk else "normal",
    )
    return action


def confirm_stage_advance(
    action_id: int,
    db: Session,
) -> dict:
    """Confirm a stage_advance Action — actually progress the case.

    Args:
        action_id: The Action ID to confirm.
        db: SQLAlchemy session.

    Returns:
        Dict with status, case_id, new_stage.

    Raises:
        ValueError: If action not found, wrong type, or already completed.
    """
    from core.events.timeline import record_event

    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError(f"Action not found: {action_id}")

    if action.type != "stage_advance":
        raise ValueError(
            f"Action {action_id} is type '{action.type}', "
            "not 'stage_advance'"
        )

    if action.status == "completed":
        raise ValueError(
            f"Action {action_id} already completed, cannot re-confirm"
        )

    # Parse the ai_suggestion to get target info
    suggestion = json.loads(action.ai_suggestion)
    target_key = suggestion["target_key"]
    target_label = suggestion["target_stage"]
    current_stage = suggestion["current_stage"]

    # Perform the actual stage update
    update_case_stage_and_milestones(action.case_id, target_key, db)

    # Mark action as completed
    action.status = "completed"
    db.commit()

    # Record timeline event
    record_event(
        case_id=action.case_id,
        event_type="stage_advanced",
        title=f"阶段推进：{current_stage} → {target_label}",
        db=db,
        description=f"由 Vera 确认推进（来源信号：{suggestion['signal']}）",
        source_ref=str(action_id),
        metadata={
            "from_stage": current_stage,
            "to_stage": target_label,
            "signal": suggestion["signal"],
            "trigger_msg_id": suggestion.get("trigger_msg_id"),
        },
    )

    logger.info(
        "Stage advance confirmed: case %s now at %s",
        action.case_id, target_label,
    )

    return {
        "status": "confirmed",
        "case_id": action.case_id,
        "new_stage": target_label,
        "from_stage": current_stage,
    }


def reject_stage_advance(
    action_id: int,
    reason: str,
    db: Session,
) -> dict:
    """Reject a stage_advance Action.

    Args:
        action_id: The Action ID to reject.
        reason: Vera's reason for rejection.
        db: SQLAlchemy session.

    Returns:
        Dict with status and action info.

    Raises:
        ValueError: If action not found or already completed.
    """
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError(f"Action not found: {action_id}")

    if action.status == "completed":
        raise ValueError(
            f"Action {action_id} already completed, cannot reject"
        )

    action.status = "completed"
    action.boss_decision = f"Rejected: {reason}"
    db.commit()

    logger.info(
        "Stage advance rejected: action %d, reason: %s",
        action_id, reason,
    )

    return {
        "status": "rejected",
        "action_id": action_id,
        "reason": reason,
    }
