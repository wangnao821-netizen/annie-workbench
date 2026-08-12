"""Alembic 迁移环境 — Vera Workbench 应用表迁移。

target_metadata 绑定 core.models.orm.Base.metadata（唯一 ORM 元数据源），
autogenerate 覆盖全部 ORM 表。

数据库 URL 优先级：
1. 环境变量 ALEMBIC_DB_URL（测试 / 临时库）
2. alembic.ini 的 sqlalchemy.url（运行时可被 core/models/db.py set_main_option 覆盖）
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from core.models.orm import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _db_url() -> str:
    """返回生效的数据库 URL（环境变量优先）。"""
    return os.environ.get("ALEMBIC_DB_URL") or config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """Offline 模式：只生成 SQL，不连接数据库。"""
    context.configure(
        url=_db_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Online 模式：连接数据库并执行迁移。"""
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _db_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
