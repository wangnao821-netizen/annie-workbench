"""Red-line tests for PathGuard — file write protection.

These tests verify that the AI cannot write to client folders or any
location outside the designated safe zones (data/ and logs/).

This is the project's most critical safety invariant. If any of these
tests fail, the system is unsafe to run.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from core.security.path_guard import PathGuard, WriteNotAllowedError

# ---------------------------------------------------------------------------
# Allowed writes
# ---------------------------------------------------------------------------


class TestAllowedWrites:
    """Verify that writes to allowed directories succeed."""

    @pytest.mark.safety
    def test_write_to_data_allowed(self, path_guard: PathGuard) -> None:
        """Writing to data/ must succeed."""
        path_guard.assert_write_allowed(Path("data") / "reports" / "output.json")

    @pytest.mark.safety
    def test_write_to_logs_allowed(self, path_guard: PathGuard) -> None:
        """Writing to logs/ must succeed."""
        path_guard.assert_write_allowed(Path("logs") / "app.log")

    @pytest.mark.safety
    def test_write_to_data_nested_allowed(self, path_guard: PathGuard) -> None:
        """Writing to deeply nested paths under data/ must succeed."""
        path_guard.assert_write_allowed(
            Path("data") / "reports" / "2026" / "07" / "case_001.json"
        )

    @pytest.mark.safety
    def test_is_write_allowed_true_for_data(self, path_guard: PathGuard) -> None:
        """is_write_allowed returns True for data/ paths."""
        assert path_guard.is_write_allowed(Path("data") / "test.db")

    @pytest.mark.safety
    def test_is_write_allowed_true_for_logs(self, path_guard: PathGuard) -> None:
        """is_write_allowed returns True for logs/ paths."""
        assert path_guard.is_write_allowed(Path("logs") / "test.log")


# ---------------------------------------------------------------------------
# Forbidden writes — client files area
# ---------------------------------------------------------------------------


class TestClientFilesProtection:
    """Verify that writes to client folders are blocked."""

    @pytest.mark.safety
    def test_write_to_client_root_blocked(
        self, path_guard: PathGuard, client_files_root: Path
    ) -> None:
        """Writing directly to client files root must fail."""
        with pytest.raises(WriteNotAllowedError, match="client files"):
            path_guard.assert_write_allowed(client_files_root / "test.txt")

    @pytest.mark.safety
    @pytest.mark.parametrize(
        "subfolder",
        [
            "_Inbox",
            "Send to Lender",
            "Don't send",
            "Send to Infynity",
            "Valuation",
            "Approval",
            "Loan Documents",
        ],
    )
    def test_write_to_client_subfolder_blocked(
        self,
        path_guard: PathGuard,
        client_files_root: Path,
        subfolder: str,
    ) -> None:
        """Writing to any client subfolder must fail."""
        target = client_files_root / subfolder / "file.txt"
        with pytest.raises(WriteNotAllowedError, match="client files"):
            path_guard.assert_write_allowed(target)

    @pytest.mark.safety
    def test_write_to_inbox_blocked(
        self, path_guard: PathGuard, client_files_root: Path
    ) -> None:
        """Writing to _Inbox/ must fail (AI never writes to client folders)."""
        with pytest.raises(WriteNotAllowedError):
            path_guard.assert_write_allowed(client_files_root / "_Inbox" / "new.pdf")

    @pytest.mark.safety
    def test_is_write_allowed_false_for_client(
        self, path_guard: PathGuard, client_files_root: Path
    ) -> None:
        """is_write_allowed returns False for client paths."""
        assert not path_guard.is_write_allowed(
            client_files_root / "Send to Lender" / "doc.pdf"
        )


# ---------------------------------------------------------------------------
# Path traversal
# ---------------------------------------------------------------------------


class TestPathTraversal:
    """Verify that path traversal attacks are blocked."""

    @pytest.mark.safety
    def test_dotdot_traversal_blocked(self, path_guard: PathGuard) -> None:
        """Path with '..' must be rejected before resolution."""
        with pytest.raises(WriteNotAllowedError, match="traversal"):
            path_guard.assert_write_allowed(Path("data") / ".." / "secret.txt")

    @pytest.mark.safety
    def test_multiple_dotdot_blocked(self, path_guard: PathGuard) -> None:
        """Multiple '../' must be rejected."""
        with pytest.raises(WriteNotAllowedError, match="traversal"):
            path_guard.assert_write_allowed(
                Path("data") / ".." / ".." / ".." / "etc" / "passwd"
            )

    @pytest.mark.safety
    def test_dotdot_in_middle_blocked(self, path_guard: PathGuard) -> None:
        """'../' in the middle of a path must be rejected."""
        with pytest.raises(WriteNotAllowedError, match="traversal"):
            path_guard.assert_write_allowed(
                Path("data") / "reports" / ".." / ".." / "evil.txt"
            )


# ---------------------------------------------------------------------------
# Outside allowed directories
# ---------------------------------------------------------------------------


class TestOutsideAllowed:
    """Verify that writes outside data/ and logs/ are blocked."""

    @pytest.mark.safety
    def test_write_to_project_root_blocked(
        self, path_guard: PathGuard, project_root: Path
    ) -> None:
        """Writing to project root (not data/ or logs/) must fail."""
        with pytest.raises(WriteNotAllowedError):
            path_guard.assert_write_allowed(project_root / "config.yaml")

    @pytest.mark.safety
    def test_write_to_arbitrary_path_blocked(
        self, path_guard: PathGuard, tmp_path: Path
    ) -> None:
        """Writing to an arbitrary temp path must fail."""
        with pytest.raises(WriteNotAllowedError):
            path_guard.assert_write_allowed(tmp_path / "evil.txt")

    @pytest.mark.safety
    def test_write_to_source_dir_blocked(
        self, path_guard: PathGuard, project_root: Path
    ) -> None:
        """Writing to core/ source directory must fail."""
        with pytest.raises(WriteNotAllowedError):
            path_guard.assert_write_allowed(project_root / "core" / "evil.py")

    @pytest.mark.safety
    def test_is_write_allowed_false_for_outside(
        self, path_guard: PathGuard, tmp_path: Path
    ) -> None:
        """is_write_allowed returns False for paths outside allowed dirs."""
        assert not path_guard.is_write_allowed(tmp_path / "outside.txt")


# ---------------------------------------------------------------------------
# Cross-platform paths
# ---------------------------------------------------------------------------


class TestCrossPlatform:
    """Verify that path checks work with Windows-style paths."""

    @pytest.mark.safety
    def test_windows_drive_path_blocked(
        self, path_guard: PathGuard
    ) -> None:
        """Windows-style absolute path to client area must fail."""
        with patch("pathlib.Path.exists", return_value=False), \
             patch("pathlib.Path.is_symlink", return_value=False):
            with pytest.raises(WriteNotAllowedError):
                path_guard.assert_write_allowed("Z:\\Yingkun CHEN\\file.txt")

    @pytest.mark.safety
    def test_windows_data_path_allowed(
        self, path_guard: PathGuard
    ) -> None:
        """Windows-style path to data/ must succeed."""
        path_guard.assert_write_allowed("data\\reports\\output.json")

    @pytest.mark.safety
    def test_windows_traversal_blocked(
        self, path_guard: PathGuard
    ) -> None:
        """Windows-style path with '..' must fail."""
        with pytest.raises(WriteNotAllowedError, match="traversal"):
            path_guard.assert_write_allowed("data\\..\\evil.txt")
