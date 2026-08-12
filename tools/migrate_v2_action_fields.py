"""给 actions 和 case_checklist 表添加 V2（WO-08）字段 — 幂等迁移。

用法：
    python tools/migrate_v2_action_fields.py

幂等保证：
    - 每次执行前先 PRAGMA table_info 检查列是否已存在，存在则跳过
    - 表不存在时用 SQLAlchemy create_all 建表（含全部新列），重复执行安全

兼容两个库路径：
    - core/data/assistant.db   应用实际使用的库（core.models.db 解析）
    - data/assistant.db        验收脚本检查的项目根目录库
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import create_engine

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.models.orm import Base

# actions 表新增列：列名 → 建列 SQL（不含 ADD COLUMN 前缀）
ACTION_COLUMNS: dict[str, str] = {
    "source_channel": "TEXT DEFAULT 'email'",
    "routing_options": "TEXT",
    "delegated_to": "TEXT",
    "delegated_at": "TIMESTAMP",
    "delegation_deadline": "TIMESTAMP",
    "delegation_feedback": "TEXT",
    "boss_decision": "TEXT",
}

# case_checklist 表新增列
CHECKLIST_COLUMNS: dict[str, str] = {
    "received_file_ids": "TEXT DEFAULT '[]'",
}


def candidate_db_paths() -> list[Path]:
    """返回待迁移的数据库文件路径列表（去重）。"""
    env_path = os.environ.get("LOAN_ASSISTANT_DB_PATH")
    paths: list[Path] = []
    if env_path:
        paths.append(Path(env_path))
    paths.append(PROJECT_ROOT / "core" / "data" / "assistant.db")
    paths.append(PROJECT_ROOT / "data" / "assistant.db")

    unique: list[Path] = []
    for p in paths:
        if p.resolve() not in {q.resolve() for q in unique}:
            unique.append(p)
    return unique


def _ensure_tables(db_path: Path) -> None:
    """缺失的表（actions / case_checklist）用 create_all 补齐（含新列）。"""
    engine = create_engine(f"sqlite:///{db_path}")
    try:
        Base.metadata.create_all(
            engine,
            tables=[
                Base.metadata.tables["actions"],
                Base.metadata.tables["case_checklist"],
            ],
        )
    finally:
        engine.dispose()


def migrate_db(db_path: Path) -> int:
    """对单个库执行幂等迁移，返回新增列数量。

    Args:
        db_path: SQLite 数据库文件路径。

    Returns:
        本次实际新增的列数量（已存在则跳过不计数）。
    """
    _ensure_tables(db_path)
    con = sqlite3.connect(str(db_path))
    added = 0
    try:
        for table, columns in (("actions", ACTION_COLUMNS), ("case_checklist", CHECKLIST_COLUMNS)):
            existing = {row[1] for row in con.execute(f"PRAGMA table_info({table})")}
            for col_name, col_ddl in columns.items():
                if col_name in existing:
                    continue
                con.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_ddl}")
                added += 1
        con.commit()
    finally:
        con.close()
    return added


def main() -> None:
    """执行迁移并打印结果。"""
    paths = candidate_db_paths()
    if not paths:
        print("未找到数据库路径，跳过。")
        return
    for db_path in paths:
        added = migrate_db(db_path)
        print(f"migrated {db_path}: {added} column(s) added")


if __name__ == "__main__":
    main()
