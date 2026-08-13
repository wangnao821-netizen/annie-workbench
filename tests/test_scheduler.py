"""Phase 2 调度测试：备份/保留清理、任务注册、超期提醒去重、摘要刷新、禁用开关。"""

from __future__ import annotations

import os
import sqlite3
import time
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from core.config import get_config
from core.models.orm import Action, Case
from core.scheduler import backup as backup_mod
from core.scheduler import jobs as jobs_mod


def _patch_factory(monkeypatch, test_db) -> None:
    """让 job 内 get_session_factory() 指向测试库，避免碰生产 DB。"""

    def _factory():
        return sessionmaker(bind=test_db.get_bind(), autoflush=False, autocommit=False)

    monkeypatch.setattr(jobs_mod, "get_session_factory", _factory)


class TestBackup:
    def test_backup_creates_file(self, tmp_path):
        src = tmp_path / "src.db"
        con = sqlite3.connect(str(src))
        con.execute("CREATE TABLE t (x INTEGER)")
        con.commit()
        con.close()
        out = backup_mod.backup_database(src, tmp_path / "bk", keep_days=7)
        assert out.exists()
        assert out.stat().st_size > 0
        con = sqlite3.connect(str(out))
        tables = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        con.close()
        assert tables >= 1

    def test_backup_prunes_old(self, tmp_path):
        src = tmp_path / "src.db"
        sqlite3.connect(str(src)).close()
        bk = tmp_path / "bk"
        bk.mkdir()
        old = bk / "assistant_20200101_000000.db"
        old.write_bytes(b"old")
        old_ts = time.time() - 8 * 86400
        os.utime(old, (old_ts, old_ts))
        out = backup_mod.backup_database(src, bk, keep_days=7)
        assert out.exists()
        assert not old.exists()

    def test_backup_missing_db_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            backup_mod.backup_database(tmp_path / "nope.db", tmp_path / "bk")


class TestJobs:
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch, tmp_path):
        """get_config() 需要 CLIENT_FILES_ROOT；每个用例独立临时目录。"""
        cf = tmp_path / "cf"
        cf.mkdir(exist_ok=True)
        monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
        monkeypatch.setenv("ENV", "development")

    def test_three_jobs_registered(self, monkeypatch):
        monkeypatch.setattr(jobs_mod, "_scheduler", None)
        s = jobs_mod.init_scheduler()
        assert s is not None
        try:
            ids = {j.id for j in s.get_jobs()}
            assert {"daily_backup", "overdue_check", "summary_refresh"} <= ids
        finally:
            jobs_mod.shutdown_scheduler()

    def test_disabled_returns_none(self, monkeypatch):
        monkeypatch.setattr(jobs_mod, "_scheduler", None)
        cfg = get_config().settings.scheduler
        monkeypatch.setattr(cfg, "enabled", False)
        try:
            assert jobs_mod.init_scheduler() is None
        finally:
            jobs_mod.shutdown_scheduler()
            monkeypatch.setattr(cfg, "enabled", True)
            jobs_mod._scheduler = None

    def test_overdue_job_creates_dedup_reminder(self, test_db, monkeypatch):
        _patch_factory(monkeypatch, test_db)
        test_db.add(Case(id="SC-1", client_name="PERSON_1"))
        task = Action(
            case_id="SC-1",
            type="DELEGATED",
            title="催 CBA",
            status="delegated",
            delegated_to="brandon",
            delegation_deadline=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
            source_channel="manual",
        )
        test_db.add(task)
        test_db.commit()

        jobs_mod._overdue_job()
        q = test_db.query(Action).filter(
            Action.type == "OVERDUE_REMINDER", Action.source_msg_id == str(task.id)
        )
        assert q.count() == 1

        jobs_mod._overdue_job()
        assert q.count() == 1  # 去重：不重复创建

    def test_summary_job_refreshes_dirty(self, test_db, monkeypatch):
        _patch_factory(monkeypatch, test_db)
        test_db.add(
            Case(id="SC-2", client_name="PERSON_2", stage="收集资料", lender="CBA",
                 loan_amount=100000, context_summary=None)
        )
        test_db.commit()

        def _fake_refresh(case_id, db):
            case = db.query(Case).filter(Case.id == case_id).first()
            case.context_summary = "测试摘要"
            db.commit()

        monkeypatch.setattr("core.ai.case_summary.refresh_case_summary", _fake_refresh)
        jobs_mod._summary_job()
        case = test_db.query(Case).filter(Case.id == "SC-2").first()
        assert case.context_summary == "测试摘要"
