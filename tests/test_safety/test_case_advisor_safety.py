"""Red-line safety tests for case advisor (core/ai/advisor.py).

Tests ensure:
- AI is never called without a valid trigger (case exists + signal/action present)
- AI never directly modifies Case.stage (all suggestions → Action, Vera confirms)
- Context sent to LLM is desensitized (raw PII never appears)
- Advisor output creates Action cards, not direct case changes
- pii_map token↔value mapping never leaks into the AI payload

Test data uses synthetic placeholders — no real client PII.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from core.models.orm import Action, Case, CaseKnowledge, InboxMessage

_ADVISOR_MODULE = "core.ai.advisor"


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def advisor_case(test_db):
    """A case with client PII and a knowledge note."""
    case = Case(
        id="case_adv_safety_001",
        client_name="John Smith",
        stage="已递交(等银行)",
        loan_amount=500000.0,
        lender="CBA",
        purpose="refinance",
    )
    test_db.add(case)
    test_db.add(CaseKnowledge(
        case_id="case_adv_safety_001",
        content="客户 John Smith 说下周能提供最新工资单",
        source="vera_note",
    ))
    test_db.commit()
    return case


@pytest.fixture
def trigger_msg(test_db):
    """A trigger inbox message with PII and a stage signal."""
    msg = InboxMessage(
        id="INBOX-ADV-001",
        subject="RE: John Smith Loan Application #4521",
        sender_email="approvals@cba.com.au",
        sender_name="CBA Approvals",
        received_at=datetime(2026, 7, 13, 10, 0, 0, tzinfo=UTC),
        body_preview=(
            "Your loan of $500,000 is approved. TFN 123 456 789, "
            "phone 0412 345 678, email john.smith@example.com."
        ),
        ai_summary="贷款已批准",
        matched_case_id="case_adv_safety_001",
        stage_signal="approved",
        action_type="通知/告知",
    )
    test_db.add(msg)
    test_db.commit()
    return msg


# ── Test: No AI without valid trigger ────────────────────────────────


class TestNoTriggerWithoutSignal:
    """The advisor must not call the LLM without a valid trigger."""

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_empty_case_id_returns_none(self, mock_llm, test_db):
        """Empty case_id → None, no LLM call."""
        from core.ai.advisor import analyze_case

        result = analyze_case(case_id="", trigger_msg_id="INBOX-ADV-001", db=test_db)
        assert result is None
        mock_llm.assert_not_called()

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_case_not_found_returns_none(self, mock_llm, test_db, trigger_msg):
        """Unknown case → None, no LLM call."""
        from core.ai.advisor import analyze_case

        result = analyze_case(
            case_id="case_does_not_exist",
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )
        assert result is None
        mock_llm.assert_not_called()

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_trigger_msg_not_found_returns_none(self, mock_llm, test_db, advisor_case):
        """Unknown trigger message → None, no LLM call."""
        from core.ai.advisor import analyze_case

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id="NO_SUCH_MSG",
            db=test_db,
        )
        assert result is None
        mock_llm.assert_not_called()

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_msg_without_signal_or_action_skips(self, mock_llm, test_db, advisor_case):
        """A message with neither signal nor action_type → None, no LLM call."""
        from core.ai.advisor import analyze_case

        msg = InboxMessage(
            id="INBOX-ADV-003",
            subject="谢谢",
            sender_email="cba@cba.com.au",
            received_at=datetime(2026, 7, 13, 12, 0, 0, tzinfo=UTC),
            body_preview="Thanks.",
            matched_case_id=advisor_case.id,
            stage_signal=None,
            action_type=None,
        )
        test_db.add(msg)
        test_db.commit()

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=msg.id,
            db=test_db,
        )
        assert result is None
        mock_llm.assert_not_called()

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_msg_without_signal_still_analyzes(self, mock_llm, test_db, advisor_case):
        """A message with an action_type (not just signal) is still a valid trigger."""
        from core.ai.advisor import analyze_case

        msg = InboxMessage(
            id="INBOX-ADV-002",
            subject="文件要求",
            sender_email="cba@cba.com.au",
            received_at=datetime(2026, 7, 13, 11, 0, 0, tzinfo=UTC),
            body_preview="Please provide payslips.",
            matched_case_id=advisor_case.id,
            stage_signal=None,
            action_type="需提供文件",
        )
        test_db.add(msg)
        test_db.commit()

        mock_llm.return_value = {
            "stage_advice": None,
            "risk_alerts": None,
            "os_advice": None,
            "broker_notes_draft": None,
            "email_reply_draft": None,
            "checklist_update": None,
        }

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=msg.id,
            db=test_db,
        )
        assert result is not None
        mock_llm.assert_called_once()


# ── Test: AI never directly modifies Case.stage ──────────────────────


class TestStageNotModifiedDirectly:
    """AI output must go to Action cards — never directly to Case.stage."""

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_stage_not_modified_directly(self, mock_llm, test_db, advisor_case, trigger_msg):
        """Case.stage must remain unchanged after advisor analysis."""
        from core.ai.advisor import analyze_case

        mock_llm.return_value = {
            "stage_advice": "建议推进到『已批准』，银行已出正式批准信",
            "risk_alerts": None,
            "os_advice": None,
            "broker_notes_draft": None,
            "email_reply_draft": None,
            "checklist_update": None,
        }

        original_stage = advisor_case.stage

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert result is not None
        assert result.stage_advice is not None
        # Stage must NOT change — the advisor only creates Action cards
        test_db.refresh(advisor_case)
        assert advisor_case.stage == original_stage

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_advisor_output_creates_action_not_direct_change(
        self, mock_llm, test_db, advisor_case, trigger_msg
    ):
        """Advisor suggestions become Action records with status=pending."""
        from core.ai.advisor import analyze_case

        mock_llm.return_value = {
            "stage_advice": "推进到已批准",
            "risk_alerts": ["批准信未附", "settlement 时间紧"],
            "os_advice": None,
            "broker_notes_draft": None,
            "email_reply_draft": None,
            "checklist_update": None,
        }

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert result is not None
        actions = (
            test_db.query(Action)
            .filter(Action.case_id == advisor_case.id)
            .all()
        )
        assert len(actions) >= 1
        for action in actions:
            # All advisor outputs must be pending — Vera confirms before acting
            assert action.status == "pending"

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_idempotent_same_trigger(self, mock_llm, test_db, advisor_case, trigger_msg):
        """Same trigger message must not create duplicate actions."""
        from core.ai.advisor import analyze_case

        mock_llm.return_value = {
            "stage_advice": "推进到已批准",
            "risk_alerts": None,
            "os_advice": None,
            "broker_notes_draft": None,
            "email_reply_draft": None,
            "checklist_update": None,
        }

        first = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )
        second = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert first is not None
        assert second is None  # idempotency: already processed
        count = (
            test_db.query(Action)
            .filter(Action.case_id == advisor_case.id)
            .count()
        )
        assert count == 1


# ── Test: Context sent to LLM is desensitized ────────────────────────


class TestContextIsDesensitized:
    """The text passed to the LLM must never contain raw PII."""

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_no_raw_pii_in_llm_prompt(self, mock_llm, test_db, advisor_case, trigger_msg):
        """Raw PII values must not appear in the text sent to the LLM."""
        from core.ai.advisor import analyze_case

        # Capture what actually gets passed to the LLM
        captured: list[str] = []

        def _fake_llm(context_text, event_type):
            captured.append(context_text)
            return {
                "stage_advice": "建议推进到已批准",
                "risk_alerts": None,
                "os_advice": None,
                "broker_notes_draft": None,
                "email_reply_draft": None,
                "checklist_update": None,
            }

        mock_llm.side_effect = _fake_llm

        analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert len(captured) == 1
        prompt_text = captured[0]

        # Raw PII must NEVER reach the LLM
        pii_values = [
            "John Smith",
            "john.smith@example.com",
            "0412 345 678",
            "123 456 789",
        ]
        for pii in pii_values:
            assert pii not in prompt_text, f"PII leaked to LLM: {pii}"

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_pii_map_not_in_llm_prompt(self, mock_llm, test_db, advisor_case, trigger_msg):
        """The token↔real_value mapping must never appear in the LLM payload."""
        from core.ai.advisor import analyze_case

        captured: list[str] = []

        def _fake_llm(context_text, event_type):
            captured.append(context_text)
            return {
                "stage_advice": None,
                "risk_alerts": None,
                "os_advice": None,
                "broker_notes_draft": None,
                "email_reply_draft": None,
                "checklist_update": None,
            }

        mock_llm.side_effect = _fake_llm

        analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        prompt_text = captured[0]
        # If the pii_map leaked, we'd see "PERSON_1=John Smith" style pairs
        assert "PERSON_1=John" not in prompt_text
        assert "John Smith" not in prompt_text


# ── Test: LLM failure is non-blocking ────────────────────────────────


class TestLlmFailureNonBlocking:
    """Advisor must not crash when the LLM call fails."""

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_timeout_returns_fallback(self, mock_llm, test_db, advisor_case, trigger_msg):
        """API timeout → fallback result, no exception."""
        from core.ai.advisor import analyze_case

        mock_llm.side_effect = TimeoutError("API timeout")

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert result is not None
        assert result.is_fallback is True

    @patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
    def test_invalid_json_returns_fallback(self, mock_llm, test_db, advisor_case, trigger_msg):
        """Invalid JSON from LLM → fallback result, no exception."""
        import json as _json

        from core.ai.advisor import analyze_case
        mock_llm.side_effect = _json.JSONDecodeError("bad json", "doc", 0)

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert result is not None
        assert result.is_fallback is True


# ── Test: Rehydration restores PII for display only ──────────────────


@patch(f"{_ADVISOR_MODULE}._call_advisor_llm")
class TestRehydrateForDisplay:
    """Advisor output fields are rehydrated for Vera's display."""

    def test_stage_advice_rehydrated(self, mock_llm, test_db, advisor_case, trigger_msg):
        """PII tokens in advisor text are restored before display."""
        from core.ai.advisor import analyze_case

        mock_llm.return_value = {
            "stage_advice": "John Smith 的批准信已到，推进到已批准",
            "risk_alerts": None,
            "os_advice": None,
            "broker_notes_draft": None,
            "email_reply_draft": None,
            "checklist_update": None,
        }

        result = analyze_case(
            case_id=advisor_case.id,
            trigger_msg_id=trigger_msg.id,
            db=test_db,
        )

        assert result is not None
        # After rehydration, the real client name is back for display
        assert result.stage_advice is not None
        assert "John Smith" in result.stage_advice
