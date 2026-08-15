"""WO-47 跟进提醒测试 — check_followups 契约 + _followup_job 注册/去重/开关。

测试要点：
- 到期任务（deadline < now）→ 生成 FOLLOWUP_REMINDER；提前 remind_before_days 天内 → 生成；
- 未到期（超过窗口）→ 不生成；已生成 pending 同源 → 幂等不重复；
- 已完成任务 / 已关闭案件 → 不生成；enabled=false → job 不注册。
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from core.config import get_config
from core.models.orm import Action, Case
from core.scheduler import jobs as jobs_mod
from core.task_engine.followup import FOLLOWUP_REMINDER, check_followups


def _now():
    """naive UTC 与 ORM 列默认一致。"""
    return datetime.utcnow()  # noqa: DTZ003


def _add_case(db, case_id="CASE-FUP-001") -> Case:
    case = Case(id=case_id, client_name="PERSON_1")
    db.add(case)
    return case


def _add_task(db, *, case_id="CASE-FUP-001", title="催客户补工资单",
              status="pending", deadline=None, closed_at=None) -> Action:
    _add_case(db, case_id)
    if closed_at is not None:
        db.query(Case).filter(Case.id == case_id).update({"closed_at": closed_at})
    task = Action(
        case_id=case_id,
        type="client_doc",
        title=title,
        status=status,
        source_channel="manual",
        scheduled_at=deadline,
    )
    db.add(task)
    db.commit()
    return task


def _reminders(db) -> list[Action]:
    return (
        db.query(Action)
        .filter(Action.type == FOLLOWUP_REMINDER)
        .order_by(Action.id.asc())
        .all()
    )


class TestCheckFollowups:
    def test_overdue_task_creates_high_reminder(self, test_db):
        task = _add_task(test_db, deadline=_now() - timedelta(days=1))
        created = check_followups(db=test_db)
        assert len(created) == 1
        reminder = _reminders(test_db)[0]
        assert reminder.type == FOLLOWUP_REMINDER
        assert reminder.title == f"跟进提醒：{task.title}"
        assert reminder.priority == "high"
        assert reminder.status == "pending"
        assert reminder.assignee == "vera"
        assert reminder.source_channel == "manual"
        assert reminder.source_msg_id == str(task.id)

    def test_due_soon_task_creates_medium_reminder(self, test_db):
        task = _add_task(test_db, deadline=_now() + timedelta(hours=12))
        check_followups(db=test_db)
        reminder = _reminders(test_db)[0]
        assert reminder.priority == "medium"
        assert reminder.source_msg_id == str(task.id)

    def test_outside_window_not_created(self, test_db):
        _add_task(test_db, deadline=_now() + timedelta(days=3))
        check_followups(db=test_db)
        assert _reminders(test_db) == []

    def test_custom_remind_before_days(self, test_db):
        _add_task(test_db, deadline=_now() + timedelta(days=2))
        created = check_followups(db=test_db, remind_before_days=3)
        assert len(created) == 1
        assert _reminders(test_db)[0].source_msg_id == str(created[0].source_msg_id)

    def test_idempotent_no_duplicate(self, test_db):
        task = _add_task(test_db, deadline=_now() - timedelta(days=1))
        assert len(check_followups(db=test_db)) == 1
        assert check_followups(db=test_db) == []
        assert len(_reminders(test_db)) == 1
        assert _reminders(test_db)[0].source_msg_id == str(task.id)

    def test_completed_task_not_reminded(self, test_db):
        _add_task(test_db, status="completed", deadline=_now() - timedelta(days=1))
        check_followups(db=test_db)
        assert _reminders(test_db) == []

    def test_closed_case_not_reminded(self, test_db):
        _add_task(
            test_db,
            deadline=_now() - timedelta(days=1),
            closed_at=_now(),
        )
        check_followups(db=test_db)
        assert _reminders(test_db) == []

    def test_source_task_unchanged(self, test_db):
        task = _add_task(test_db, deadline=_now() - timedelta(days=1))
        check_followups(db=test_db)
        test_db.refresh(task)
        assert task.status == "pending"


class TestFollowupJob:
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch, tmp_path):
        cf = tmp_path / "cf"
        cf.mkdir(exist_ok=True)
        monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
        monkeypatch.setenv("ENV", "development")

    def _patch_factory(self, monkeypatch, test_db) -> None:
        def _factory():
            return sessionmaker(bind=test_db.get_bind(), autoflush=False, autocommit=False)

        monkeypatch.setattr(jobs_mod, "get_session_factory", _factory)

    def test_job_creates_and_dedups(self, test_db, monkeypatch):
        self._patch_factory(monkeypatch, test_db)
        _add_task(test_db, deadline=_now() - timedelta(days=1))
        jobs_mod._followup_job()
        assert len(_reminders(test_db)) == 1
        jobs_mod._followup_job()
        assert len(_reminders(test_db)) == 1

    def test_job_not_registered_when_disabled(self, monkeypatch):
        monkeypatch.setattr(jobs_mod, "_scheduler", None)
        cfg = get_config().settings.scheduler.followup
        monkeypatch.setattr(cfg, "enabled", False)
        try:
            s = jobs_mod.init_scheduler()
            assert s is not None
            try:
                ids = {j.id for j in s.get_jobs()}
                assert "followup_check" not in ids
            finally:
                jobs_mod.shutdown_scheduler()
        finally:
            monkeypatch.setattr(cfg, "enabled", True)
            jobs_mod._scheduler = None

    def test_job_registered_when_enabled(self, monkeypatch):
        monkeypatch.setattr(jobs_mod, "_scheduler", None)
        cfg = get_config().settings.scheduler.followup
        monkeypatch.setattr(cfg, "enabled", True)
        try:
            s = jobs_mod.init_scheduler()
            assert s is not None
            try:
                ids = {j.id for j in s.get_jobs()}
                assert "followup_check" in ids
            finally:
                jobs_mod.shutdown_scheduler()
        finally:
            monkeypatch.setattr(cfg, "enabled", False)
            jobs_mod._scheduler = None
