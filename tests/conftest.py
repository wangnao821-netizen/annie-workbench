"""Vera Workbench 测试配置 — 兼容旧 test_env fixture。

提供：
- test_db: 内存 SQLite session
- test_env: 兼容旧项目的完整测试环境
- _no_test_pollution: 自动隔离环境变量
"""

import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from core.models.orm import Base


@pytest.fixture
def test_db(tmp_path) -> Session:
    """内存 DB fixture — 每个测试独立。"""
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def test_env(tmp_path, test_db, monkeypatch):
    """兼容旧项目的 test_env fixture。

    提供隔离的临时目录、环境变量、DB session。
    """
    client_root = tmp_path / "clients"
    client_root.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    monkeypatch.setenv("CLIENT_FILES_ROOT", str(client_root))
    monkeypatch.setenv("VERA_DATA_DIR", str(data_dir))
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key-12345")
    monkeypatch.setenv("LOAN_ASSISTANT_DB_PATH", str(tmp_path / "test.db"))

    yield {
        "tmp_path": tmp_path,
        "db": test_db,
        "client_root": client_root,
        "data_dir": data_dir,
    }


@pytest.fixture(autouse=True)
def _no_test_pollution(tmp_path, monkeypatch):
    """防止测试污染生产数据。

    - 强制 VERA_DATA_DIR 指向临时目录
    - 隔离任何文件写操作
    """
    monkeypatch.setenv("VERA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("VERA_ENV", "test")


@pytest.fixture
def mock_config(monkeypatch, tmp_path):
    """提供一个最小化的配置环境。"""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    # 创建最小 document_types.yaml
    (config_dir / "document_types.yaml").write_text(
        "categories:\n  - name: payslip\n    patterns: ['payslip', 'salary']\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("VERA_CONFIG_DIR", str(config_dir))
    return config_dir
