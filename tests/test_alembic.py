"""Alembic 应用表迁移测试 — 临时库 upgrade head 后 ORM 应用表全部存在。

验证：
1. alembic.ini + migrations/env.py 绑定 core.models.orm.Base.metadata
2. 空库 alembic upgrade head → Base.metadata.tables 全部创建
"""

from pathlib import Path

import pytest
import sqlalchemy
from alembic import command
from alembic.config import Config

from core.models.db import init_sa_tables, reset_engine
from core.models.orm import Base

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = PROJECT_ROOT / "core" / "alembic.ini"
MIGRATIONS_DIR = PROJECT_ROOT / "core" / "migrations"


def _upgrade_head(db_path: Path) -> None:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "head")


def test_upgrade_head_creates_all_orm_tables(tmp_path):
    db_path = tmp_path / "alembic_test.db"
    _upgrade_head(db_path)

    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    try:
        inspector = sqlalchemy.inspect(engine)
        actual = set(inspector.get_table_names())
        expected = set(Base.metadata.tables.keys())
        assert expected <= actual, f"alembic upgrade head 后缺失表: {sorted(expected - actual)}"
    finally:
        engine.dispose()


def test_alembic_env_binds_core_orm_metadata():
    assert ALEMBIC_INI.exists(), "alembic.ini 应位于 core/alembic.ini（db.py Config 解析路径）"
    env_src = (MIGRATIONS_DIR / "env.py").read_text(encoding="utf-8")
    assert "from core.models.orm import Base" in env_src
    assert "target_metadata = Base.metadata" in env_src


def test_baseline_migration_covers_required_tables(tmp_path):
    db_path = tmp_path / "baseline.db"
    _upgrade_head(db_path)

    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    try:
        inspector = sqlalchemy.inspect(engine)
        tables = set(inspector.get_table_names())
        required = {
            "actions", "cases", "processed_files", "case_checklist",
            "os_conditions", "case_knowledge", "case_timeline_events",
            "import_records", "case_milestones",
        }
        assert required <= tables, f"基线迁移缺应用表: {sorted(required - tables)}"
    finally:
        engine.dispose()


def _head_revision() -> str:
    from alembic.script import ScriptDirectory

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    return ScriptDirectory.from_config(cfg).get_current_head()


def test_legacy_db_no_alembic_version_stamp_and_upgrade(tmp_path):
    """遗留库：无 alembic_version 的 create_all 旧库 → stamp head + upgrade 不报 table already exists、数据保留。"""
    db_path = tmp_path / "legacy.db"
    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            sqlalchemy.text(
                "INSERT INTO cases (case_id, client_name) VALUES (:cid, :name)"
            ),
            {"cid": "case_legacy_001", "name": "遗留客户"},
        )
    engine.dispose()

    reset_engine()
    try:
        init_sa_tables(db_path)  # 不应抛 "table already exists"
    finally:
        reset_engine()

    engine2 = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    try:
        inspector = sqlalchemy.inspect(engine2)
        tables = set(inspector.get_table_names())
        assert "alembic_version" in tables, "遗留库升级后应有 alembic_version 表"
        with engine2.connect() as conn:
            version = conn.execute(
                sqlalchemy.text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            name = conn.execute(
                sqlalchemy.text(
                    "SELECT client_name FROM cases WHERE case_id = 'case_legacy_001'"
                )
            ).scalar_one()
        assert version == _head_revision(), f"alembic_version 应为 head {_head_revision()}"
        assert name == "遗留客户", "遗留库数据不应丢失"
    finally:
        engine2.dispose()


def test_create_all_fallback_removed(tmp_path, monkeypatch):
    """create_all 兜底已移除：全新库 init_sa_tables 不再调用 create_all 且表齐全。"""
    def _fail(*args, **kwargs):
        pytest.fail("create_all 不应再被调用")

    monkeypatch.setattr(Base.metadata, "create_all", _fail)

    db_path = tmp_path / "fresh.db"
    reset_engine()
    try:
        init_sa_tables(db_path)
    finally:
        reset_engine()

    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    try:
        inspector = sqlalchemy.inspect(engine)
        actual = set(inspector.get_table_names())
        expected = set(Base.metadata.tables.keys())
        assert expected <= actual, f"全新库建表缺失: {sorted(expected - actual)}"
    finally:
        engine.dispose()


def test_alembic_failure_raises_runtime_error(tmp_path, monkeypatch):
    """alembic 失败：command.upgrade 抛异常 → init_sa_tables raise RuntimeError（不再静默建表）。"""
    def _boom(*args, **kwargs):
        raise RuntimeError("mock upgrade failure")

    monkeypatch.setattr(command, "upgrade", _boom)

    db_path = tmp_path / "fail.db"
    reset_engine()
    try:
        with pytest.raises(RuntimeError, match="Alembic 建表失败"):
            init_sa_tables(db_path)
    finally:
        reset_engine()


def test_alembic_ini_urls_resolve_to_core_db():
    import configparser

    def url(p: Path) -> str:
        cp = configparser.ConfigParser(
            interpolation=configparser.BasicInterpolation(),
            defaults={"here": str(p.parent)},
        )
        cp.read(p, encoding="utf-8")
        return cp.get("alembic", "sqlalchemy.url").replace("\\", "/")

    assert url(PROJECT_ROOT / "alembic.ini").endswith("core/data/assistant.db")
    assert url(PROJECT_ROOT / "core" / "alembic.ini").endswith("core/data/assistant.db")


def test_dual_data_dir_warning_when_legacy_exists(tmp_path, caplog):
    from core.models.db import DB_PATH, _warn_on_dual_data_dirs

    legacy = tmp_path / "legacy.db"
    legacy.write_bytes(b"x" * 128)
    with caplog.at_level("WARNING", logger="core.models.db"):
        _warn_on_dual_data_dirs(DB_PATH, legacy_path=legacy)
    assert any("遗留数据库" in r.message for r in caplog.records)


def test_dual_data_dir_no_warning_on_override_path(tmp_path, caplog):
    from core.models.db import _warn_on_dual_data_dirs

    legacy = tmp_path / "legacy.db"
    legacy.write_bytes(b"x" * 128)
    with caplog.at_level("WARNING", logger="core.models.db"):
        _warn_on_dual_data_dirs(tmp_path / "other.db", legacy_path=legacy)
    assert not any("遗留数据库" in r.message for r in caplog.records)
