"""WO-22 lender_key / platform_key 回填工具测试 — tools/migrate_lender_keys.backfill。

验证幂等、dry-run 不写库、空库/缺失库边界。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from tools.migrate_lender_keys import backfill


def _make_db(path: Path, rows: list[tuple]) -> sqlite3.Connection:
    con = sqlite3.connect(str(path))
    con.execute(
        "CREATE TABLE cases (case_id TEXT PRIMARY KEY, lender TEXT, submission_platform TEXT, "
        "lender_ref TEXT, submission_platform_ref TEXT)"
    )
    con.executemany("INSERT INTO cases VALUES (?,?,?,?,?)", rows)
    con.commit()
    return con


class TestBackfill:
    def test_alias_unknown_empty_lender(self, tmp_path):
        db = tmp_path / "a.db"
        con = _make_db(db, [
            ("c1", "Commonwealth Bank", None, None, None),
            ("c2", "野鸡银行", None, None, None),
            ("c3", None, None, None, None),
        ])
        result = backfill(db)
        rows = dict(con.execute("SELECT case_id, lender_ref FROM cases").fetchall())
        con.close()
        assert result["cases"] == 3
        assert result["lender_updated"] == 1
        assert result["unresolved"] == 1
        assert rows["c1"] == "cba"
        assert rows["c2"] is None
        assert rows["c3"] is None

    def test_submission_platform_ref(self, tmp_path):
        db = tmp_path / "b.db"
        con = _make_db(db, [
            ("p1", "ANZ", "ApplyOnline", None, None),
            ("p2", "CBA", "MoneyQuest", None, None),
        ])
        result = backfill(db)
        rows = dict(con.execute("SELECT case_id, submission_platform_ref FROM cases").fetchall())
        con.close()
        assert result["platform_updated"] == 2
        assert rows["p1"] == "aol"
        assert rows["p2"] == "mqg"

    def test_idempotent_second_run_zero(self, tmp_path):
        db = tmp_path / "c.db"
        con = _make_db(db, [("i1", "St.George", "手动递交", None, None)])
        first = backfill(db)
        second = backfill(db)
        con.close()
        assert first["lender_updated"] == 1 and first["platform_updated"] == 1
        assert second["lender_updated"] == 0 and second["platform_updated"] == 0

    def test_dry_run_does_not_write(self, tmp_path):
        db = tmp_path / "d.db"
        con = _make_db(db, [("d1", "Commonwealth Bank", "MoneyQuest", None, None)])
        result = backfill(db, dry_run=True)
        rows = con.execute("SELECT lender_ref, submission_platform_ref FROM cases WHERE case_id='d1'").fetchone()
        con.close()
        assert result["lender_updated"] == 1 and result["platform_updated"] == 1
        assert rows == (None, None)

    def test_empty_db_returns_zeros(self, tmp_path):
        db = tmp_path / "empty.db"
        db.write_bytes(b"")
        assert backfill(db) == {"cases": 0, "lender_updated": 0, "platform_updated": 0, "unresolved": 0}

    def test_missing_db_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            backfill(tmp_path / "missing.db")