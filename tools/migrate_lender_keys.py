"""WO-22 建案银行/平台规范 key 回填 — 幂等。

逐行扫描 cases：
    - lender → resolve_lender_key → 更新 lender_ref（仅当解析成功且现值不同）
    - submission_platform → resolve_platform_key → 更新 submission_platform_ref
    - 解析失败保持原值（不置空）
只会写 cases.lender_ref / cases.submission_platform_ref 两列，不碰其他字段。

用法：
    python tools/migrate_lender_keys.py --dry-run
    python tools/migrate_lender_keys.py
    python tools/migrate_lender_keys.py --db data/assistant.db --db core/data/assistant.db

幂等：同库跑两次，第二次 lender_updated=0、platform_updated=0。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.bank_registry import resolve_lender_key, resolve_platform_key


def _table_exists(con: sqlite3.Connection, table: str) -> bool:
    cur = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cur.fetchone() is not None


def backfill(db_path: Path, dry_run: bool = False) -> dict:
    """逐行扫描 cases 回填规范 key，返回 {"cases", "lender_updated", "platform_updated", "unresolved"}。"""
    db_path = Path(db_path)
    if not db_path.exists():
        raise FileNotFoundError(f"数据库不存在: {db_path}")
    con = sqlite3.connect(str(db_path))
    try:
        if not _table_exists(con, "cases"):
            return {"cases": 0, "lender_updated": 0, "platform_updated": 0, "unresolved": 0}
        columns = {row[1] for row in con.execute("PRAGMA table_info(cases)")}
        missing = {"lender_ref", "submission_platform_ref"} - columns
        if missing:
            raise RuntimeError(f"cases 表缺少列 {sorted(missing)}，请先执行 alembic upgrade head")

        rows = con.execute("SELECT case_id, lender, submission_platform FROM cases").fetchall()
        lender_updated = 0
        platform_updated = 0
        unresolved = 0

        for case_id, lender, platform in rows:
            lender_key = resolve_lender_key(lender) if lender else None
            if lender_key:
                current = con.execute("SELECT lender_ref FROM cases WHERE case_id=?", (case_id,)).fetchone()
                if current is not None and current[0] != lender_key:
                    if not dry_run:
                        con.execute("UPDATE cases SET lender_ref=? WHERE case_id=?", (lender_key, case_id))
                    lender_updated += 1
            elif lender:
                unresolved += 1

            platform_key = resolve_platform_key(platform) if platform else None
            if platform_key:
                current = con.execute(
                    "SELECT submission_platform_ref FROM cases WHERE case_id=?", (case_id,)
                ).fetchone()
                if current is not None and current[0] != platform_key:
                    if not dry_run:
                        con.execute(
                            "UPDATE cases SET submission_platform_ref=? WHERE case_id=?",
                            (platform_key, case_id),
                        )
                    platform_updated += 1

        if not dry_run:
            con.commit()
        return {
            "cases": len(rows),
            "lender_updated": lender_updated,
            "platform_updated": platform_updated,
            "unresolved": unresolved,
        }
    finally:
        con.close()


def main() -> None:
    """CLI 入口：--dry-run 演练，--db 可重复指定；默认处理 data 与 core/data 两个库。"""
    parser = argparse.ArgumentParser(description="回填 cases.lender_ref / submission_platform_ref")
    parser.add_argument("--dry-run", action="store_true", help="只演练不写库")
    parser.add_argument("--db", action="append", default=None, help="数据库路径（可重复）；默认两个助手库")
    args = parser.parse_args()

    if args.db:
        paths = [Path(p) for p in args.db]
    else:
        paths = [PROJECT_ROOT / "data" / "assistant.db", PROJECT_ROOT / "core" / "data" / "assistant.db"]

    for db_path in paths:
        if not db_path.exists():
            print(f"跳过（不存在）: {db_path}")
            continue
        result = backfill(db_path, dry_run=args.dry_run)
        print(f"{db_path}: {result}")


if __name__ == "__main__":
    main()