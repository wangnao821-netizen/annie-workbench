"""Safety tests for stage_progression_engine — Red Line compliance.

Tests ensure:
- Terminal cases cannot have stage_advance Actions created
- Backward progression signals are rejected
- Unmatched emails (no case_id) don't trigger progression
- Confirmed Actions cannot be re-confirmed (idempotent)
- AI never directly modifies case.stage (only via Vera confirmation)
"""

from __future__ import annotations

import pytest

from core.case_engine.progression import (
    confirm_stage_advance,
    evaluate_stage_signal,
)
from core.models.orm import Action, Case, CaseMilestone


@pytest.fixture
def case_terminal(db_session):
    """A case in terminal state (已结算)."""
    case = Case(id="case_001", client_name="Terminal", stage="已结算")
    db_session.add(case)
    db_session.commit()
    return case


@pytest.fixture
def case_active(db_session):
    """A case in active state (已递交(等银行))."""
    case = Case(id="case_002", client_name="Active", stage="已递交(等银行)")
    db_session.add(case)
    db_session.commit()
    return case


class TestStageProgressionSafety:
    """Red line safety tests for stage progression engine."""

    def test_terminal_case_no_action_created(self, db_session, case_terminal):
        """Terminal cases must NOT get stage_advance Actions."""
        result = evaluate_stage_signal(
            case_id="case_001",
            stage_signal="approved",
            inbox_msg_id="msg_001",
            db=db_session,
        )

        assert result is None
        # Verify no action was created
        actions = db_session.query(Action).all()
        assert len(actions) == 0

    def test_backward_progression_rejected(self, db_session, case_active):
        """Backward signals (e.g. submitted→gathering) must be rejected."""
        # Case is at 已递交(等银行) = submitted (index 3)
        # application_submitted maps to submitted (index 3) — same level
        result = evaluate_stage_signal(
            case_id="case_002",
            stage_signal="application_submitted",
            inbox_msg_id="msg_002",
            db=db_session,
        )

        assert result is None

    def test_no_case_id_no_progression(self, db_session):
        """Emails without matched case must not trigger progression."""
        result = evaluate_stage_signal(
            case_id="",
            stage_signal="approved",
            inbox_msg_id="msg_003",
            db=db_session,
        )

        assert result is None

    def test_case_not_found_no_crash(self, db_session):
        """If case doesn't exist in DB, engine must not crash."""
        result = evaluate_stage_signal(
            case_id="nonexistent",
            stage_signal="approved",
            inbox_msg_id="msg_004",
            db=db_session,
        )

        assert result is None

    def test_confirmed_action_cannot_reconfirm(self, db_session, case_active):
        """Already completed Actions must not be re-confirmed."""
        from core.case_engine.milestones import init_case_milestones

        # Create and confirm an action
        action = evaluate_stage_signal(
            case_id="case_002",
            stage_signal="bank_mir",
            inbox_msg_id="msg_005",
            db=db_session,
        )
        assert action is not None
        init_case_milestones("case_002", db_session)
        confirm_stage_advance(action.id, db_session)

        # Confirm wrote milestone records and advanced the stage
        milestones = (
            db_session.query(CaseMilestone)
            .filter(CaseMilestone.case_id == "case_002")
            .all()
        )
        assert len(milestones) == 9
        completed = {m.milestone_name for m in milestones if m.status == "completed"}
        assert {"gathering", "reviewing", "to_submit", "submitted", "os_requested"} <= completed
        db_session.refresh(case_active)
        assert case_active.stage == "银行补件"

        # Try to re-confirm
        with pytest.raises(ValueError, match="already completed"):
            confirm_stage_advance(action.id, db_session)

    def test_invalid_signal_ignored(self, db_session, case_active):
        """Unknown stage_signal values must be silently ignored."""
        result = evaluate_stage_signal(
            case_id="case_002",
            stage_signal="totally_invalid_signal",
            inbox_msg_id="msg_006",
            db=db_session,
        )

        assert result is None

    def test_ai_never_directly_modifies_stage(self, db_session, case_active):
        """evaluate_stage_signal must NEVER modify case.stage directly."""
        original_stage = case_active.stage

        evaluate_stage_signal(
            case_id="case_002",
            stage_signal="bank_mir",
            inbox_msg_id="msg_007",
            db=db_session,
        )

        # Refresh and verify stage unchanged
        db_session.refresh(case_active)
        assert case_active.stage == original_stage
