"""SQLAlchemy engine and session setup for loan-assistant V4.

Provides engine creation, session factory, and table initialization.
The database file lives at data/assistant.db (same as the raw sqlite3 layer).

Usage::

    from core.models.db import get_sa_session, init_sa_tables

    # FastAPI dependency
    @router.post("/api/example")
    def example(db: Session = Depends(get_sa_session)):
        ...

    # Startup
    init_sa_tables()
"""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from core.logger import get_logger
from core.models.orm import Base

logger = get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "assistant.db"

# 测试隔离：pytest 会话通过该环境变量把默认库指向临时文件，
# 确保任何未显式传 db_path 的 get_session()/TestClient 都不会触碰真实库。
_DB_PATH_ENV = "LOAN_ASSISTANT_DB_PATH"

# Module-level singletons (reset via reset_engine for testing)
_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None
_alembic_running: bool = False  # reentrancy guard


def _effective_db_path(db_path: Path | None) -> Path:
    """返回生效的数据库路径：显式参数优先，其次环境变量，最后项目默认库。"""
    if db_path is not None:
        return db_path
    env_path = os.environ.get(_DB_PATH_ENV)
    if env_path:
        return Path(env_path)
    return DB_PATH


def get_engine(db_path: Path | None = None) -> Engine:
    """Return the singleton SQLAlchemy engine.

    Args:
        db_path: Override database path (used in tests).
            Defaults to data/assistant.db.

    Returns:
        A configured SQLAlchemy Engine.
    """
    global _engine
    if _engine is None:
        path = _effective_db_path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            f"sqlite:///{path}",
            connect_args={"check_same_thread": False, "timeout": 30},
            echo=False,
        )
        # 审计修复 v1.16.4：SQLite 并发（watcher + API + 后台导入/深度扫描 多写者）。
        # WAL 允许读写并发；busy_timeout 30s 让写锁冲突时等待而不是直接 500。
        try:
            with _engine.connect() as conn:
                conn.execute(text("PRAGMA journal_mode=WAL"))
                conn.execute(text("PRAGMA busy_timeout=30000"))
                conn.execute(text("PRAGMA synchronous=NORMAL"))
                conn.commit()
        except Exception:  # noqa: BLE001 — WAL 设置失败非致命
            logger.warning("SQLite WAL pragma setup failed (non-fatal): continuing with defaults")
        # 确保新建列与表结构就绪
        try:
            init_sa_tables(path)
        except Exception:  # noqa: BLE001, S110
            pass
        # WO-24：vec0 虚拟表幂等挂载（受控例外：不进 Alembic，见 vector.py）
        try:
            from core.knowledge.vector import ensure_vector_schema

            ensure_vector_schema(_engine)
        except Exception:  # noqa: BLE001, S110
            pass
    return _engine


def get_session_factory(db_path: Path | None = None) -> sessionmaker[Session]:
    """Return the singleton session factory.

    Args:
        db_path: Override database path (used in tests).

    Returns:
        A configured sessionmaker.
    """
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(db_path),
            autoflush=False,
            autocommit=False,
        )
    return _session_factory


def get_sa_session() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a SQLAlchemy session per request."""
    factory = get_session_factory()
    session = factory()
    try:
        yield session
    finally:
        session.close()


def get_sa_session_direct(db_path: Path | None = None) -> Session:
    """Return a SQLAlchemy session directly (for scripts and tools, not FastAPI).

    Caller is responsible for calling session.close() when done.

    Args:
        db_path: Override database path. Defaults to data/assistant.db.

    Returns:
        A SQLAlchemy Session instance.
    """
    factory = get_session_factory(db_path)
    return factory()


from contextlib import contextmanager


@contextmanager
def get_session(db_path: Path | None = None) -> Generator[Session, None, None]:
    """Context manager for SQLAlchemy session. Usage: with get_session() as session: ..."""
    session = get_sa_session_direct(db_path)
    try:
        yield session
    finally:
        session.close()



def get_sa_session_factory(db_path: Path | None = None) -> sessionmaker[Session]:
    """Return the session factory callable (for background threads like watcher).

    Returns the same singleton as get_session_factory.
    This is a convenience alias with a more explicit name.

    Args:
        db_path: Override database path.

    Returns:
        A sessionmaker that can be called to create sessions.
    """
    return get_session_factory(db_path)



def _warn_on_dual_data_dirs(db_path: Path, legacy_path: Path | None = None) -> None:
    """启动自检：检测另一 data 目录的遗留库，防止读错库（#20）。

    仅当生效库为默认库（core/data/assistant.db）时检查；测试/显式 override
    路径跳过，避免误报。发现遗留库（非空）→ logger.warning，不阻断启动。

    Args:
        db_path: 已解析的生效数据库路径。
        legacy_path: 遗留库候选路径，默认 PROJECT_ROOT.parent/data/assistant.db。
    """
    if db_path != DB_PATH:
        return
    legacy = legacy_path or (PROJECT_ROOT.parent / "data" / "assistant.db")
    try:
        if legacy.exists() and legacy.stat().st_size > 0:
            logger.warning(
                "检测到遗留数据库 %s（%s 字节）；当前使用 %s。"
                "如确认无用，请归档到 core/data/backups/legacy/",
                legacy,
                legacy.stat().st_size,
                DB_PATH,
            )
    except OSError:
        logger.warning("无法检查遗留数据库路径 %s", legacy)


def init_sa_tables(db_path: Path | None = None) -> None:
    """Alembic 唯一建表路径（移除 create_all 兜底）。

    - 全新空库 → alembic upgrade head 建全表
    - 遗留库（已有应用表、无 alembic_version）→ stamp head（视为基线已应用）
      → upgrade（no-op）→ _sync_missing_columns（遗留列补齐）
    - 已迁移库 → upgrade head（增量）
    - alembic 失败 → raise RuntimeError（不再静默建表）

    Args:
        db_path: Override database path (used in tests).
    """
    global _alembic_running
    db_path = _effective_db_path(db_path)
    _warn_on_dual_data_dirs(db_path)
    if _alembic_running:
        return
    _alembic_running = True
    try:
        try:
            from alembic import command
            from alembic.config import Config
        except ImportError as e:
            raise RuntimeError(
                "alembic 未安装：请 pip install -e .[dev] 或 pip install alembic"
            ) from e

        alembic_cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
        # 让 alembic 也使用生效库路径，避免迁移链落到真实库（测试隔离的关键）
        alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

        engine = get_engine(db_path)
        with engine.connect() as conn:
            has_version = conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'"
            )).fetchone() is not None
            has_app_tables = conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='cases'"
            )).fetchone() is not None

        if not has_version and has_app_tables:
            # 遗留库：create_all 时代建的库无 alembic_version → 打基线戳
            command.stamp(alembic_cfg, "head")
            logger.info("Legacy DB detected: stamped alembic head")
        elif not has_version:
            # 全新空库：基线建全表
            pass

        command.upgrade(alembic_cfg, "head")
        # 通用 schema 同步：遗留库缺列时自动补列（审计修复 v1.16.7，数据兼容层）
        _sync_missing_columns(engine)
        logger.info("Alembic migration completed successfully")
        # 双保险已取消：create_all 兜底移除，alembic 为唯一建表路径
    except Exception as e:
        logger.error("Alembic migration failed: %s", e)
        raise RuntimeError(f"Alembic 建表失败，请检查迁移链: {e}") from e
    finally:
        _alembic_running = False


def _sync_missing_columns(engine: Engine) -> None:
    """对比 ORM 模型列与真实表，给旧库补齐缺失列。

    背景：`Base.metadata.create_all` 只建缺失的表、不改旧表；此前手动迁移
    清单漏了 `parse_route` / `preview_pdf_path`，导致旧库查询报
    "no such column: processed_files.preview_pdf_path"（导入、actions/history
    全线 500）。此函数按模型逐表逐列比对，缺失即 ALTER ADD COLUMN。
    """
    from sqlalchemy import inspect as _sa_inspect
    from sqlalchemy.dialects import sqlite as _sqlite_dialect

    try:
        inspector = _sa_inspect(engine)
        dialect = _sqlite_dialect.dialect()
        with engine.connect() as conn:
            for table_name, table in Base.metadata.tables.items():
                if not inspector.has_table(table_name):
                    continue
                existing = {c["name"] for c in inspector.get_columns(table_name)}
                for column in table.columns:
                    if column.name in existing:
                        continue
                    col_type = column.type.compile(dialect=dialect)
                    conn.execute(
                        text(f'ALTER TABLE "{table_name}" ADD COLUMN "{column.name}" {col_type}')
                    )
                    logger.info(
                        "Schema sync: added %s.%s (%s)", table_name, column.name, col_type
                    )
            conn.commit()
    except Exception as exc:  # noqa: BLE001 — 兼容层失败非致命
        logger.warning("Generic schema sync failed (non-fatal): %s", exc)


def reset_engine() -> None:
    """Reset engine and session factory (for testing only)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
