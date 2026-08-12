"""FastAPI 依赖注入 — 提供 DB session 和配置。"""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy.orm import Session

from core.config import ConfigLoader, get_config, get_project_root
from core.models.db import get_sa_session


def get_db() -> Generator[Session, None, None]:
    """Yield a DB session for FastAPI Depends()."""
    yield from get_sa_session()


def get_settings() -> ConfigLoader:
    """获取全局配置单例。"""
    return get_config()


def get_root() -> Path:
    """获取项目根目录。"""
    return get_project_root()
