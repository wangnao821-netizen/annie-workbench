"""Shared fixtures for red-line safety tests (WO-07 迁移).

These fixtures create isolated temporary directories for testing
PathGuard and ConfigLoader without touching real client data.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from core.config import ConfigLoader
from core.security.path_guard import PathGuard

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
def db_session(test_db):
    """数据库 session（兼容旧项目 db_session 命名，实际用 root conftest 的 test_db）。"""
    return test_db


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """Create a temporary project root with data/ and logs/ subdirs."""
    root = tmp_path / "project"
    (root / "data").mkdir(parents=True)
    (root / "logs").mkdir(parents=True)
    return root


@pytest.fixture
def client_files_root(tmp_path: Path) -> Path:
    """Create a temporary client files root with case subfolders."""
    root = tmp_path / "client_files"
    root.mkdir()
    for subfolder in [
        "_Inbox",
        "Send to Lender",
        "Send to Infynity",
        "Don't send",
        "Valuation",
        "Approval",
    ]:
        (root / subfolder).mkdir()
    return root


@pytest.fixture
def path_guard(project_root: Path, client_files_root: Path) -> PathGuard:
    """Create a PathGuard instance with temp directories."""
    return PathGuard(
        project_root=project_root,
        client_files_root=client_files_root,
    )


@pytest.fixture
def config_loader(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ConfigLoader:
    """Create a ConfigLoader with mocked env vars.

    Uses the actual project config files but with a temp CLIENT_FILES_ROOT
    and fake API keys, so tests don't depend on NAS or real credentials.
    """
    client_root = tmp_path / "client_files"
    client_root.mkdir()
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(client_root))
    monkeypatch.setenv("GEMINI_API_KEY", "test_key_for_testing_only")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test_key_for_testing_only")
    monkeypatch.setenv("OPENAI_API_KEY", "test_key_for_testing_only")
    monkeypatch.setenv("ENV", "development")

    return ConfigLoader(project_root=_PROJECT_ROOT)
