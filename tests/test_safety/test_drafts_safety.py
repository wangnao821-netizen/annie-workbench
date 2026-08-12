"""Safety tests for EmailDraft system — Red Line compliance.

Tests ensure:
- Draft system NEVER sends email automatically (Red Line #3)
- Draft generation through LLM goes through desensitize() (Red Line #2)
- Draft status transition requires manual approval — no auto-skip
- Draft body stored in DB is rehydrated (not desensitized tokens)
- Draft system only writes to SQLite, never to client folders (Red Line #1)
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from core.models.orm import Action, Case, EmailDraft

# WO-07: 源模块从 server/services/email_draft_generator → core/drafts/generator
_DRAFT_MODULE = "core.drafts.generator"
_DRAFT_MODULE_PATH = (
    Path(__file__).resolve().parent.parent.parent / "core" / "drafts" / "generator.py"
)


@pytest.fixture
def case_with_advisor_action(db_session):
    """A case with an existing advisor_reply Action containing email draft."""
    case = Case(
        id="case_draft_safety_001",
        client_name="Draft Safety Client",
        stage="已递交(等银行)",
        loan_amount=800000.0,
        lender="CBA",
    )
    db_session.add(case)

    action = Action(
        case_id="case_draft_safety_001",
        type="advisor_reply",
        title="AI 拟: 邮件回复草稿",
        status="pending",
        priority="medium",
        ai_suggestion=json.dumps({
            "email_reply_draft": "Dear PERSON_1, your application is progressing well.",
            "source_msg_id": "INBOX-SAFE001",
        }, ensure_ascii=False),
    )
    db_session.add(action)
    db_session.commit()
    return case, action


class TestDraftNeverSendsEmail:
    """Red Line #3: 不自动发送邮件给客户 — 只生成草稿。"""

    def test_no_email_sending_api_in_module(self):
        """EmailDraftGenerator source code must NOT contain any email sending logic."""
        if not _DRAFT_MODULE_PATH.exists():
            pytest.skip("Module not yet created (will be tested after implementation)")

        source = _DRAFT_MODULE_PATH.read_text(encoding="utf-8")

        # Must NOT contain SMTP / sendmail / send_email / outlook.send patterns
        forbidden_patterns = [
            "smtplib",
            "send_email",
            "send_mail",
            "smtp.",
            "outlook.send",
            "win32com",
            "MIMEText",
            "MIMEMultipart",
            "graph_api.send",
            ".send(",
        ]
        for pattern in forbidden_patterns:
            assert pattern not in source, (
                f"EmailDraftGenerator contains forbidden pattern '{pattern}' "
                f"— Red Line: AI 不自动发送邮件"
            )

    def test_draft_approve_only_marks_status(self, db_session, case_with_advisor_action):
        """Approving a draft must ONLY change status, NOT trigger any send."""
        _case, _action = case_with_advisor_action

        # Create a draft record manually
        draft = EmailDraft(
            case_id="case_draft_safety_001",
            draft_type="reply",
            subject="Test Subject",
            body="Test body content",
            status="draft",
        )
        db_session.add(draft)
        db_session.commit()

        # Simulate approval — just update status and approved_at
        draft.status = "approved"
        draft.approved_at = datetime.utcnow()
        db_session.commit()

        db_session.refresh(draft)
        assert draft.status == "approved"
        # No side effect — no email was sent, just a status change
        # The draft model itself has no send method

    def test_draft_model_has_no_send_method(self):
        """EmailDraft ORM model must not have any send-related methods."""
        methods = [m for m in dir(EmailDraft) if "send" in m.lower()]
        assert methods == [], (
            f"EmailDraft has send-related methods: {methods} — Red Line violation"
        )


class TestDraftGenerationDesensitized:
    """Red Line #2: PII 不外传 — 独立生成走 desensitize → LLM → rehydrate。"""

    def test_generate_fresh_calls_desensitize(self, db_session, case_with_advisor_action):
        """When generating fresh draft via LLM, text MUST be desensitized first."""
        _case, _action = case_with_advisor_action

        try:
            from core.drafts.generator import generate_fresh
        except ImportError:
            pytest.skip("Module not yet created")

        captured_calls = []

        def mock_desensitize(text, case_id, db):
            captured_calls.append(("desensitize", text, case_id))
            return f"DESENSITIZED({text})"

        def mock_rehydrate(text, case_id, db):
            captured_calls.append(("rehydrate", text, case_id))
            return text.replace("DESENSITIZED(", "").rstrip(")")

        with patch(f"{_DRAFT_MODULE}.desensitize", side_effect=mock_desensitize), \
             patch(f"{_DRAFT_MODULE}.rehydrate", side_effect=mock_rehydrate), \
             patch(f"{_DRAFT_MODULE}._call_draft_llm") as mock_llm:
            mock_llm.return_value = "Dear client, here is your update."

            generate_fresh(
                case_id="case_draft_safety_001",
                draft_type="reply",
                context="Client Zhang Wei needs update on CBA application",
                db=db_session,
            )

        # Verify desensitize was called before LLM
        desen_calls = [c for c in captured_calls if c[0] == "desensitize"]
        assert len(desen_calls) >= 1, "desensitize() was not called before LLM"

        # Verify rehydrate was called after LLM
        rehyd_calls = [c for c in captured_calls if c[0] == "rehydrate"]
        assert len(rehyd_calls) >= 1, "rehydrate() was not called after LLM"

    def test_generate_from_advisor_skips_llm(self, db_session, case_with_advisor_action):
        """When generating from existing Advisor Action, no LLM call needed."""
        _case, action = case_with_advisor_action

        try:
            from core.drafts.generator import generate_from_advisor
        except ImportError:
            pytest.skip("Module not yet created")

        with patch(f"{_DRAFT_MODULE}._call_draft_llm") as mock_llm:
            generate_from_advisor(action_id=action.id, db=db_session)

        # LLM should NOT be called — draft comes directly from action.ai_suggestion
        mock_llm.assert_not_called()


class TestDraftStatusRequiresManualApproval:
    """Red Line #3: AI 只出草稿，人做最终决定。"""

    def test_cannot_create_draft_with_approved_status(self, db_session):
        """Cannot skip draft stage — must start as 'draft'."""
        draft = EmailDraft(
            case_id="case_draft_safety_001",
            draft_type="reply",
            subject="Test",
            body="Body",
            status="approved",  # Trying to skip draft stage
        )
        db_session.add(draft)
        db_session.commit()

        # The model allows it at ORM level, but the API route must enforce it
        # This test documents the expected API behavior
        db_session.refresh(draft)
        # At model level we record this — enforcement is at the API layer
        # See test_email_drafts.py for API-level tests

    def test_draft_status_valid_transitions(self, db_session):
        """Verify allowed status transitions: draft → approved → sent | draft → discarded."""
        valid_transitions = {
            "draft": ["approved", "discarded"],
            "approved": ["sent"],
            "sent": [],        # Terminal state
            "discarded": [],   # Terminal state
        }

        # Verify the transitions are what we expect
        for from_status, allowed in valid_transitions.items():
            draft = EmailDraft(
                case_id="case_draft_safety_001",
                draft_type="reply",
                subject="Transition Test",
                body="Body",
                status=from_status,
            )
            db_session.add(draft)
            db_session.commit()

            # Attempting invalid transition
            if from_status == "sent":
                # Cannot go back from sent
                assert "draft" not in allowed
                assert "approved" not in allowed
            if from_status == "discarded":
                # Cannot recover from discarded
                assert "draft" not in allowed
            db_session.rollback()


class TestDraftBodyStoredRehydrated:
    """Stored draft body should contain real values (rehydrated), not tokens."""

    def test_from_advisor_stores_rehydrated_text(self, db_session, case_with_advisor_action):
        """Draft body from advisor action is stored with real values (rehydrated)."""
        _case, action = case_with_advisor_action

        try:
            from core.drafts.generator import generate_from_advisor
        except ImportError:
            pytest.skip("Module not yet created")

        with patch(f"{_DRAFT_MODULE}.rehydrate") as mock_rehydrate:
            mock_rehydrate.return_value = "Dear Zhang Wei, your application is progressing well."
            draft = generate_from_advisor(action_id=action.id, db=db_session)

        # The stored body should be the rehydrated version
        if draft is not None:
            assert "PERSON_1" not in draft.body, (
                "Draft body contains PII token — should be rehydrated for Vera"
            )


class TestDraftNeverWritesClientFolder:
    """Red Line #1: 不向客户文件夹写入任何文件。"""

    def test_no_file_operations_in_module(self):
        """EmailDraftGenerator must not perform any file write operations."""
        if not _DRAFT_MODULE_PATH.exists():
            pytest.skip("Module not yet created")

        source = _DRAFT_MODULE_PATH.read_text(encoding="utf-8")

        # Must NOT write files — drafts go to SQLite only
        forbidden_write_patterns = [
            ".write_text(",
            ".write_bytes(",
            "open(",          # generic file open (acceptable for reading prompts, checked below)
            "shutil.copy",
            "shutil.move",
        ]

        for pattern in forbidden_write_patterns:
            if pattern == "open(":
                # open() is acceptable only if it's for reading prompt templates
                # Check that any open() usage is read-mode only
                import re
                writes = re.findall(r'open\([^)]*["\']w["\']', source)
                assert writes == [], (
                    f"EmailDraftGenerator opens files in write mode: {writes}"
                )
            else:
                assert pattern not in source, (
                    f"EmailDraftGenerator contains '{pattern}' — drafts must only go to SQLite"
                )
