"""Safety tests: no file write/move without user confirmation.

Verifies that the file archive flow refuses to execute any
file operation when user_confirmed is False or missing.
This is the last line of defense against AI-initiated file operations.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from core.security.path_guard import PathGuard, WriteNotAllowedError


class TestNoAutoWrite:
    """Ensure no code path can bypass user confirmation for file operations."""

    @pytest.fixture
    def case_setup(self, tmp_path: Path):
        """Create a case structure with a file in _Inbox."""
        project_root = tmp_path / "project"
        (project_root / "data").mkdir(parents=True)
        (project_root / "logs").mkdir(parents=True)

        client_root = tmp_path / "client_files"
        case_dir = client_root / "CASE-T3S7F1L2 - Test Client"
        (case_dir / "_Inbox").mkdir(parents=True)
        (case_dir / "Don't send").mkdir(parents=True)

        # File to be moved
        source = case_dir / "_Inbox" / "scan001.pdf"
        source.write_bytes(b"PDF content here")

        target = case_dir / "Don't send" / "Income Payslip Employer Jun 2026.pdf"

        return client_root, case_dir, source, target

    def test_false_confirmed_rejected(self, case_setup):
        """user_confirmed=False must raise."""
        client_root, _, source, target = case_setup

        with pytest.raises(WriteNotAllowedError):
            PathGuard.assert_user_action_allowed(
                source=source,
                target=target,
                user_confirmed=False,
                client_files_root=client_root,
            )

    def test_shutil_move_only_after_guard_passes(self, case_setup):
        """Simulate the full confirm_archive flow — move only happens after guard."""
        import shutil

        client_root, case_dir, source, target = case_setup

        # Step 1: Guard check (confirmed=True) — should pass
        PathGuard.assert_user_action_allowed(
            source=source,
            target=target,
            user_confirmed=True,
            client_files_root=client_root,
        )

        # Step 2: Only NOW do we move the file
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))

        assert target.exists()
        assert not source.exists()

    def test_move_never_happens_on_guard_failure(self, case_setup, tmp_path):
        """If guard raises, the file must stay in place."""
        client_root, case_dir, source, target = case_setup

        # Try with confirmed=False
        with pytest.raises(WriteNotAllowedError):
            PathGuard.assert_user_action_allowed(
                source=source,
                target=target,
                user_confirmed=False,
                client_files_root=client_root,
            )

        # File must still be at source
        assert source.exists()
        assert not target.exists()

    def test_api_layer_cannot_bypass_guard(self, case_setup):
        """Even if someone constructs a valid path, guard blocks without confirmation."""
        client_root, case_dir, source, target = case_setup

        # Construct perfectly valid paths but no confirmation
        valid_source = source
        valid_target = case_dir / "Don't send" / "Valid Name.pdf"

        with pytest.raises(WriteNotAllowedError):
            PathGuard.assert_user_action_allowed(
                source=valid_source,
                target=valid_target,
                user_confirmed=False,
                client_files_root=client_root,
            )

    def test_none_confirmed_treated_as_false(self, case_setup):
        """If user_confirmed is not explicitly True, reject."""
        client_root, _, source, target = case_setup

        # Passing None should fail (type mismatch treated as not confirmed)
        with pytest.raises((WriteNotAllowedError, TypeError)):
            PathGuard.assert_user_action_allowed(
                source=source,
                target=target,
                user_confirmed=None,  # type: ignore[arg-type]
                client_files_root=client_root,
            )
