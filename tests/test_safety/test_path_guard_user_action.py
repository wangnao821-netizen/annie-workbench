"""Safety tests for PathGuard.assert_user_action_allowed().

Tests the method that guards Vera-confirmed file operations.
All file moves within client folders require:
1. user_confirmed = True
2. source under CLIENT_FILES_ROOT
3. target under CLIENT_FILES_ROOT
4. source and target in the SAME case directory
5. no path traversal in target
6. target file does not already exist
"""

from __future__ import annotations

from pathlib import Path

import pytest

from core.security.path_guard import PathGuard, WriteNotAllowedError


@pytest.fixture
def case_env(tmp_path: Path):
    """Create a realistic case folder structure for testing."""
    project_root = tmp_path / "project"
    (project_root / "data").mkdir(parents=True)
    (project_root / "logs").mkdir(parents=True)

    client_root = tmp_path / "client_files"
    client_root.mkdir()

    # Case folder with standard subdirs
    case_dir = client_root / "CASE-A1B2C3D4 - Lucas Baker"
    (case_dir / "_Inbox").mkdir(parents=True)
    (case_dir / "Don't send").mkdir(parents=True)
    (case_dir / "Send to Lender").mkdir(parents=True)
    (case_dir / "Valuation").mkdir(parents=True)

    # Another case folder (for cross-case tests)
    other_case = client_root / "CASE-X9Y8Z7W6 - David Wong"
    (other_case / "_Inbox").mkdir(parents=True)
    (other_case / "Don't send").mkdir(parents=True)

    # Create a sample file in _Inbox
    sample_file = case_dir / "_Inbox" / "IMG_0847.jpg"
    sample_file.write_bytes(b"fake image content")

    guard = PathGuard(
        project_root=project_root,
        client_files_root=client_root,
    )

    return guard, client_root, case_dir, other_case, sample_file


class TestUserConfirmedRequired:
    """user_confirmed=False must always be rejected."""

    def test_reject_when_not_confirmed(self, case_env):
        guard, client_root, case_dir, _, sample_file = case_env
        target = case_dir / "Don't send" / "Income Bank Statement.pdf"

        with pytest.raises(WriteNotAllowedError, match="user confirmation"):
            PathGuard.assert_user_action_allowed(
                source=sample_file,
                target=target,
                user_confirmed=False,
                client_files_root=client_root,
            )

    def test_accept_when_confirmed(self, case_env):
        guard, client_root, case_dir, _, sample_file = case_env
        target = case_dir / "Don't send" / "Income Bank Statement.pdf"

        # Should not raise
        PathGuard.assert_user_action_allowed(
            source=sample_file,
            target=target,
            user_confirmed=True,
            client_files_root=client_root,
        )


class TestSourceMustBeUnderClientRoot:
    """Source file must be within CLIENT_FILES_ROOT."""

    def test_reject_source_outside_client_root(self, case_env, tmp_path):
        guard, client_root, case_dir, _, _ = case_env
        outside_file = tmp_path / "random" / "file.pdf"
        outside_file.parent.mkdir(parents=True)
        outside_file.write_bytes(b"data")

        target = case_dir / "Don't send" / "file.pdf"

        with pytest.raises(WriteNotAllowedError):
            PathGuard.assert_user_action_allowed(
                source=outside_file,
                target=target,
                user_confirmed=True,
                client_files_root=client_root,
            )


class TestTargetMustBeUnderClientRoot:
    """Target path must be within CLIENT_FILES_ROOT."""

    def test_reject_target_outside_client_root(self, case_env, tmp_path):
        guard, client_root, case_dir, _, sample_file = case_env
        outside_target = tmp_path / "elsewhere" / "file.pdf"

        with pytest.raises(WriteNotAllowedError):
            PathGuard.assert_user_action_allowed(
                source=sample_file,
                target=outside_target,
                user_confirmed=True,
                client_files_root=client_root,
            )


class TestNoCrossCaseMove:
    """Source and target must be in the same case directory."""

    def test_reject_cross_case_move(self, case_env):
        guard, client_root, case_dir, other_case, sample_file = case_env
        cross_target = other_case / "Don't send" / "Income Statement.pdf"

        with pytest.raises(WriteNotAllowedError, match="same case"):
            PathGuard.assert_user_action_allowed(
                source=sample_file,
                target=cross_target,
                user_confirmed=True,
                client_files_root=client_root,
            )


class TestNoPathTraversal:
    """Target path must not contain '..' components."""

    def test_reject_traversal_in_target(self, case_env):
        guard, client_root, case_dir, _, sample_file = case_env
        # Try to escape via ..
        evil_target = case_dir / "Don't send" / ".." / ".." / "evil.pdf"

        with pytest.raises(WriteNotAllowedError, match="[Tt]raversal"):
            PathGuard.assert_user_action_allowed(
                source=sample_file,
                target=evil_target,
                user_confirmed=True,
                client_files_root=client_root,
            )


class TestNoOverwrite:
    """Target file must not already exist (prevent accidental overwrite)."""

    def test_reject_overwrite_existing(self, case_env):
        guard, client_root, case_dir, _, sample_file = case_env
        # Create an existing file at target
        existing = case_dir / "Don't send" / "existing.pdf"
        existing.write_bytes(b"already here")

        with pytest.raises(WriteNotAllowedError, match="[Ee]xist"):
            PathGuard.assert_user_action_allowed(
                source=sample_file,
                target=existing,
                user_confirmed=True,
                client_files_root=client_root,
            )


class TestValidMovesPass:
    """Legitimate moves within the same case should succeed."""

    def test_inbox_to_dont_send(self, case_env):
        guard, client_root, case_dir, _, sample_file = case_env
        target = case_dir / "Don't send" / "Income Bank Statement Westpac Jul 2026.pdf"

        # Should not raise
        PathGuard.assert_user_action_allowed(
            source=sample_file,
            target=target,
            user_confirmed=True,
            client_files_root=client_root,
        )

    def test_inbox_to_valuation(self, case_env):
        guard, client_root, case_dir, _, sample_file = case_env
        target = case_dir / "Valuation" / "Property Valuation result - CBA.pdf"

        PathGuard.assert_user_action_allowed(
            source=sample_file,
            target=target,
            user_confirmed=True,
            client_files_root=client_root,
        )

    def test_inbox_to_new_subdir(self, case_env):
        """Target in a new subdirectory (e.g. Approval/) that doesn't exist yet."""
        guard, client_root, case_dir, _, sample_file = case_env
        # Settlement/ doesn't exist yet but is within the case dir
        target = case_dir / "Settlement" / "Settlement Statement.pdf"

        PathGuard.assert_user_action_allowed(
            source=sample_file,
            target=target,
            user_confirmed=True,
            client_files_root=client_root,
        )
