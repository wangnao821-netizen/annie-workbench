"""#20 收口：DB 唯一真源 = core/data/assistant.db — 防路径漂移回归。"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def test_default_is_core_db() -> None:
    from core.models import db

    assert str(db.DB_PATH).endswith(os.path.join("core", "data", "assistant.db"))


def test_env_override_wins() -> None:
    from core.models import db

    tmp = Path("C:/tmp/test_db_override.db")
    os.environ[db._DB_PATH_ENV] = str(tmp)
    try:
        assert db._effective_db_path(None) == tmp
    finally:
        del os.environ[db._DB_PATH_ENV]


def test_settings_sync() -> None:
    import yaml

    raw = (PROJECT_ROOT / "config" / "settings.yaml").read_text(encoding="utf-8")
    cfg = yaml.safe_load(raw)
    assert cfg["database"]["path"] == "core/data/assistant.db"