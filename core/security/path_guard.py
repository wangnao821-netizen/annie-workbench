"""Path write protection for loan-assistant.

This module enforces the project's most critical safety rule:
**the AI never writes to client folders**.

``PathGuard`` ensures that all write operations are restricted to the
project's ``data/`` and ``logs/`` directories. Any attempt to write
to client files, system directories, or paths outside the allowed
zones is blocked.

Safety layers:
    1. Path traversal detection — ``..`` in path components is rejected
       before resolution (defense in depth).
    2. Symlink detection — symlinks that could redirect writes outside
       allowed directories are rejected.
    3. Client files root check — any path under ``CLIENT_FILES_ROOT``
       is absolutely forbidden, even if it happens to also be under
       an allowed directory.
    4. Allow-list check — the resolved path must be within ``data/``
       or ``logs/`` under the project root.

All path operations use ``pathlib.Path`` for cross-platform
compatibility (Windows / macOS / Linux).
"""

from __future__ import annotations

from pathlib import Path

from core.logger import get_logger

logger = get_logger(__name__)


class WriteNotAllowedError(Exception):
    """Raised when a write operation targets a forbidden path.

    This is a safety violation — the calling code attempted to write
    outside the designated safe zones (``data/`` and ``logs/``).
    The error message describes which rule was violated.
    """


class PathGuard:
    """Enforces file write safety invariants.

    This class ensures that the AI never writes to client folders or
    any location outside the designated project data directories.

    Allowed write destinations (within ``project_root``):
        - ``data/`` — database, reports, runtime data
        - ``logs/`` — application logs

    Forbidden destinations:
        - Any path under ``client_files_root`` (absolute prohibition)
        - Any path outside the allowed directories
        - Paths containing ``..`` (path traversal)
        - Symlinks pointing outside allowed directories

    Usage::

        guard = PathGuard(
            project_root=Path("/path/to/loan-assistant"),
            client_files_root=Path("Z:/Yingkun CHEN"),
        )
        guard.assert_write_allowed(Path("data/reports/output.json"))  # OK
        guard.assert_write_allowed(Path("Z:/Yingkun CHEN/file.txt"))  # raises

    Args:
        project_root: Project root directory.
        client_files_root: Client files root directory (from
            ``CLIENT_FILES_ROOT`` env var). If ``None``, the client
            files check is skipped (but all other checks still apply).
    """

    def __init__(
        self,
        project_root: Path,
        client_files_root: Path | None = None,
    ) -> None:
        """Initialize PathGuard with project and client paths.

        Args:
            project_root: Project root directory.
            client_files_root: Client files root directory, or ``None``
                if not configured.
        """
        self.project_root = project_root.resolve()
        self.client_files_root = (
            client_files_root.resolve() if client_files_root else None
        )
        self._allowed_dirs: list[Path] = [
            (self.project_root / "data").resolve(),
            (self.project_root / "logs").resolve(),
        ]

    def assert_write_allowed(self, path: Path | str) -> None:
        """Assert that writing to the given path is allowed.

        This is the main gate for all write operations. If the path
        is not within an allowed directory, or is within the client
        files root, or contains path traversal, an exception is raised.

        Args:
            path: The target path to check. Can be relative or absolute.

        Raises:
            WriteNotAllowedError: If the path is not within an allowed
                directory, is within the client files root, contains
                path traversal, or is a suspicious symlink.
        """
        target = Path(path)

        # Layer 1: Path traversal detection (before resolution)
        if ".." in target.parts:
            raise WriteNotAllowedError(
                f"Path traversal detected in '{path}' — '..' is not allowed"
            )

        # Relative paths are resolved against the project root
        if not target.is_absolute():
            target = self.project_root / target

        # Layer 2: Symlink detection (if path exists)
        if target.exists() and target.is_symlink():
            raise WriteNotAllowedError(
                f"Symlink detected at '{path}' — "
                f"symlinks are not allowed for write operations"
            )

        # Resolve the path (follows symlinks for parent directories)
        try:
            resolved = target.resolve()
        except (OSError, RuntimeError) as e:
            raise WriteNotAllowedError(
                f"Cannot resolve path '{path}': {e}"
            ) from e

        # Layer 3: Client files root check (absolute prohibition)
        if self.client_files_root is not None:
            try:
                resolved.relative_to(self.client_files_root)
                # Path is under client files root — absolutely forbidden
                raise WriteNotAllowedError(
                    f"Cannot write to client files area: '{path}' "
                    f"(under CLIENT_FILES_ROOT)"
                )
            except ValueError:
                pass  # Not under client files root — good

        # Layer 4: Allow-list check
        for allowed_dir in self._allowed_dirs:
            try:
                resolved.relative_to(allowed_dir)
                return  # Path is within an allowed directory
            except ValueError:
                continue

        # Not within any allowed directory
        allowed_names = ", ".join(d.name for d in self._allowed_dirs)
        raise WriteNotAllowedError(
            f"Write not allowed to '{path}' — "
            f"only {allowed_names} directories are writable"
        )

    def is_write_allowed(self, path: Path | str) -> bool:
        """Check if writing to the given path is allowed.

        Non-raising version of ``assert_write_allowed``.

        Args:
            path: The target path to check.

        Returns:
            ``True`` if write is allowed, ``False`` otherwise.
        """
        try:
            self.assert_write_allowed(path)
            return True
        except WriteNotAllowedError:
            return False

    @property
    def allowed_directories(self) -> list[Path]:
        """Return the list of directories where writes are allowed."""
        return list(self._allowed_dirs)

    # ── Vera-confirmed file operations ────────────────────────────────

    @staticmethod
    def assert_user_action_allowed(
        source: Path,
        target: Path,
        user_confirmed: bool,
        client_files_root: Path,
        case_dir: Path | None = None,
    ) -> None:
        """Assert that a user-confirmed file move is allowed.

        This guards the file rename/move operations that Vera triggers
        after reviewing AI classification suggestions. It is separate
        from ``assert_write_allowed`` because the destination is within
        CLIENT_FILES_ROOT (normally forbidden for AI writes).

        Rules:
            1. ``user_confirmed`` must be explicitly ``True``.
            2. Source must be under ``client_files_root``.
            3. Target must be under ``client_files_root``.
            4. Source and target must be within the same case directory
               (first-level child of ``client_files_root``).
            5. Target path must not contain ``..`` (path traversal).
            6. Target file must not already exist (no accidental overwrite).

        ``case_dir``（2026-08-17 无总根模式）：提供时以 case 文件夹为边界，源/目标
        必须都在其中（root 仅作兼容；无总根时 root 即 case 文件夹本身）。

        Args:
            source: Path to the source file.
            target: Path to the target location (including new filename).
            user_confirmed: Must be True. API layer guarantees this comes
                from Vera's explicit click.
            client_files_root: The CLIENT_FILES_ROOT path.

        Raises:
            WriteNotAllowedError: If any rule is violated.
        """
        # Rule 1: Must be explicitly confirmed
        if user_confirmed is not True:
            raise WriteNotAllowedError(
                "File operations require explicit user confirmation"
            )

        # Rule 5: No path traversal in target (check before resolution)
        if ".." in target.parts:
            raise WriteNotAllowedError(
                f"Path traversal detected in target '{target}' — "
                f"'..' is not allowed"
            )

        # Resolve paths for comparison
        resolved_source = source.resolve()
        resolved_target = target.resolve()
        resolved_root = client_files_root.resolve()
        resolved_case = case_dir.resolve() if case_dir is not None else None
        boundary = resolved_case or resolved_root

        # Rule 2/3: Source & target must be under boundary (case dir or root)
        try:
            resolved_source.relative_to(boundary)
        except ValueError:
            raise WriteNotAllowedError(
                f"Source '{source}' is not under CLIENT_FILES_ROOT"
            )

        try:
            resolved_target.relative_to(boundary)
        except ValueError:
            raise WriteNotAllowedError(
                f"Target '{target}' is not under CLIENT_FILES_ROOT"
            )

        if resolved_case is not None:
            # 无总根模式：case_dir 即边界，源/目标同在其内即同一案件
            if target.exists():
                raise WriteNotAllowedError(
                    f"Target file already exists: '{target}'. "
                    f"Cannot overwrite existing files."
                )
            return

        # Rule 4 (总根模式): Same case directory (first-level child of root)
        source_relative = resolved_source.relative_to(resolved_root)
        target_relative = resolved_target.relative_to(resolved_root)

        source_case_dir = source_relative.parts[0] if source_relative.parts else ""
        target_case_dir = target_relative.parts[0] if target_relative.parts else ""

        if source_case_dir != target_case_dir:
            raise WriteNotAllowedError(
                f"Cross-case move not allowed: source is in '{source_case_dir}' "
                f"but target is in '{target_case_dir}'. "
                f"Files must stay within the same case directory."
            )

        # Rule 6: Target must not already exist
        if target.exists():
            raise WriteNotAllowedError(
                f"Target file already exists: '{target}'. "
                f"Cannot overwrite existing files."
            )

