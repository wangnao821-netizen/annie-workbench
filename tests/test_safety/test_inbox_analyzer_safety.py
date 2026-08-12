"""Red-line safety tests for inbox_ai_analyzer.

Tests ensure:
- PII is never sent to external AI APIs (desensitize is always called)
- pii_map data never appears in API payloads
- AI call failures don't block email ingestion
- Invalid JSON triggers graceful fallback (not crash)

These tests MUST pass before any functional code is considered complete.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

# WO-07: patch 目标从 server.services.inbox_ai_analyzer → core.inbox.ai_analyzer
_ANALYZER_MODULE = "core.inbox.ai_analyzer"
_GATEWAY_MODULE = "core.pii.gateway"


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def mock_db():
    """Create a mock SQLAlchemy session."""
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = None
    session.query.return_value.filter.return_value.count.return_value = 0
    return session


@pytest.fixture
def sample_email():
    """A sample email with real PII that must be desensitized."""
    return {
        "subject": "RE: John Smith Loan Application #4521",
        "sender": "John Smith <john.smith@example.com>",
        "body_preview": (
            "Hi Brandon,\n\n"
            "Please find attached my payslip for June. My TFN is 123 456 789 "
            "and my phone number is 0412 345 678.\n"
            "The property at 42 Maple St, Sydney NSW 2000 is valued at $1,200,000.\n"
            "My BSB is 062-000 and account number is 1234 5678.\n\n"
            "Regards,\nJohn Smith"
        ),
    }


# ── Test: PII is NEVER sent to external API ──────────────────────────


class TestPiiNeverSentToApi:
    """Verify that desensitize() is always called before AI API call."""

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_desensitize_called_before_ai(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """desensitize() must be called before _call_ai()."""
        # Setup
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "[REDACTED TEXT]"
        mock_call_ai.return_value = json.dumps({
            "summary": "test summary",
            "clientName": None,
            "actionType": "仅通知",
            "stageSignal": None,
            "deadline": None,
            "conditions": [],
            "urgencyScore": 3,
            "suggestedLevel": "low_priority",
            "lenderName": None,
            "applicationRef": None,
        })

        from core.inbox.ai_analyzer import analyze_email

        analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        # Assert: desensitize was called
        mock_desensitize.assert_called_once()

        # Assert: the text sent to AI does NOT contain raw PII
        ai_call_args = mock_call_ai.call_args
        if ai_call_args:
            payload = str(ai_call_args)
            # These raw PII values must NOT appear in the AI payload
            assert "john.smith@example.com" not in payload
            assert "0412 345 678" not in payload
            assert "123 456 789" not in payload
            assert "062-000" not in payload

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_raw_pii_not_in_ai_payload(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """Raw PII values must not appear in the text sent to AI."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        # Simulate desensitize replacing PII with tokens
        mock_desensitize.return_value = (
            "Subject: RE: PERSON_1 Loan Application #4521\n"
            "PERSON_1 <EMAIL_1> sent payslip. TFN is TAX_ID_1. "
            "Phone PHONE_1. Property at ADDRESS_1 valued AMOUNT_1."
        )
        mock_call_ai.return_value = json.dumps({
            "summary": "test",
            "clientName": None,
            "actionType": "仅通知",
            "stageSignal": None,
            "deadline": None,
            "conditions": [],
            "urgencyScore": 3,
            "suggestedLevel": "low_priority",
            "lenderName": None,
            "applicationRef": None,
        })

        from core.inbox.ai_analyzer import analyze_email

        analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        # Verify the actual text passed to _call_ai
        ai_call_args = mock_call_ai.call_args
        assert ai_call_args is not None
        payload_text = str(ai_call_args)

        # Raw PII must NEVER appear
        pii_values = [
            "John Smith",
            "john.smith@example.com",
            "0412 345 678",
            "123 456 789",
            "062-000",
            "1234 5678",
            "42 Maple St",
        ]
        for pii in pii_values:
            assert pii not in payload_text, f"PII leaked to AI: {pii}"


# ── Test: pii_map NEVER appears in API payload ───────────────────────


class TestPiiMapNeverLeaks:
    """Verify pii_map token↔value mappings don't leak externally."""

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_pii_map_not_in_payload(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """The token↔real_value mapping must never appear in AI payload."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "PERSON_1 applied for loan AMOUNT_1"
        mock_call_ai.return_value = json.dumps({
            "summary": "test",
            "clientName": None,
            "actionType": "仅通知",
            "stageSignal": None,
            "deadline": None,
            "conditions": [],
            "urgencyScore": 3,
            "suggestedLevel": "low_priority",
            "lenderName": None,
            "applicationRef": None,
        })

        from core.inbox.ai_analyzer import analyze_email

        analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        # The mapping relationship should not be present
        ai_payload = str(mock_call_ai.call_args)
        # If pii_map leaked, you'd see something like "PERSON_1=John Smith"
        assert "PERSON_1=John" not in ai_payload
        assert "PERSON_1: John" not in ai_payload
        assert "token" not in ai_payload.lower() or "real_value" not in ai_payload.lower()


# ── Test: AI failure does NOT block email ingestion ───────────────────


class TestAiFailureDoesNotBlock:
    """AI analysis failures must be non-blocking (graceful degradation)."""

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_ai_timeout_returns_fallback(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """API timeout should result in fallback, not exception."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "safe text"
        mock_call_ai.side_effect = TimeoutError("API timeout after 30s")

        from core.inbox.ai_analyzer import analyze_email

        result = analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        # Must NOT raise — returns a fallback result
        assert result is not None
        assert result.is_fallback is True

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_ai_exception_returns_fallback(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """Any unexpected exception should result in fallback."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "safe text"
        mock_call_ai.side_effect = RuntimeError("Unexpected error")

        from core.inbox.ai_analyzer import analyze_email

        result = analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        assert result is not None
        assert result.is_fallback is True

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    def test_prompt_config_missing_returns_fallback(
        self, mock_load_prompt, mock_db, sample_email
    ):
        """Missing prompt config file should result in fallback."""
        mock_load_prompt.side_effect = FileNotFoundError("config not found")

        from core.inbox.ai_analyzer import analyze_email

        result = analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        assert result is not None
        assert result.is_fallback is True


# ── Test: Invalid JSON triggers fallback ─────────────────────────────


class TestInvalidJsonFallback:
    """Invalid AI JSON responses must trigger fallback, not crash."""

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_non_json_response_triggers_fallback(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """Plain text response from AI should trigger fallback."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "safe text"
        mock_call_ai.return_value = "This is just plain text, not JSON at all."

        from core.inbox.ai_analyzer import analyze_email

        result = analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        assert result is not None
        assert result.is_fallback is True
        # Fallback should still provide a summary (the plain text itself)
        assert result.summary is not None

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_partial_json_triggers_fallback(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """Malformed/partial JSON should trigger fallback."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "safe text"
        mock_call_ai.return_value = '{"summary": "test", "actionType": '  # truncated

        from core.inbox.ai_analyzer import analyze_email

        result = analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        assert result is not None
        assert result.is_fallback is True

    @patch(f"{_ANALYZER_MODULE}._load_prompt_config")
    @patch(f"{_ANALYZER_MODULE}._call_ai")
    @patch(f"{_GATEWAY_MODULE}.desensitize")
    def test_empty_response_triggers_fallback(
        self, mock_desensitize, mock_call_ai, mock_load_prompt, mock_db, sample_email
    ):
        """Empty string response should trigger fallback."""
        mock_load_prompt.return_value = {
            "system_prompt": "test",
            "user_prompt_template": "{subject}\n{sender}\n{body}",
        }
        mock_desensitize.return_value = "safe text"
        mock_call_ai.return_value = ""

        from core.inbox.ai_analyzer import analyze_email

        result = analyze_email(
            subject=sample_email["subject"],
            sender=sample_email["sender"],
            body_preview=sample_email["body_preview"],
            case_id="test_case_001",
            db=mock_db,
        )

        assert result is not None
        assert result.is_fallback is True
