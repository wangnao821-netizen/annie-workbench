"""APScheduler 任务注册中心 — Phase 2 数据保命精简版（备份/委派超期/摘要刷新）。"""

from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from core.config import get_config
from core.logger import get_logger
from core.models.db import get_session_factory

logger = get_logger(__name__)

_scheduler: BackgroundScheduler | None = None


def _backup_job() -> None:
    """每日 SQLite 备份（保留 keep_days 天）。"""
    try:
        from core.scheduler.backup import backup_database

        cfg = get_config().settings.scheduler
        backup_database(keep_days=cfg.backup_keep_days)
    except Exception as exc:  # noqa: BLE001 — 定时任务失败只记录，不影响主流程
        logger.error("scheduler backup job failed: %s", exc)


def _overdue_job() -> None:
    """委派超期检查：为每个超期未反馈任务创建 OVERDUE_REMINDER（按 source_msg_id 去重）。"""
    try:
        from core.models.orm import Action
        from core.task_engine.delegation import check_overdue

        db = get_session_factory()()
        try:
            overdue = check_overdue(db)
            created = 0
            for task in overdue:
                dup = (
                    db.query(Action)
                    .filter(
                        Action.type == "OVERDUE_REMINDER",
                        Action.source_msg_id == str(task.id),
                        Action.status == "pending",
                    )
                    .first()
                )
                if dup is not None:
                    continue
                db.add(
                    Action(
                        case_id=task.case_id,
                        type="OVERDUE_REMINDER",
                        title=f"委派超期：{task.title}",
                        priority="high",
                        status="pending",
                        assignee="vera",
                        source_channel="manual",
                        source_msg_id=str(task.id),
                        routing_options={
                            "delegated_to": task.delegated_to,
                            "deadline": str(task.delegation_deadline),
                        },
                    )
                )
                created += 1
            db.commit()
            if overdue or created:
                logger.info("overdue check: %d overdue, %d reminders created", len(overdue), created)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — 定时任务失败只记录
        logger.error("scheduler overdue job failed: %s", exc)


def _summary_job() -> None:
    """摘要刷新：扫描 dirty（context_summary 为空）活跃案件，批量懒刷新。"""
    try:
        from core.ai.case_summary import refresh_case_summary
        from core.models.orm import Case

        cfg = get_config().settings.scheduler
        db = get_session_factory()()
        try:
            cases = (
                db.query(Case)
                .filter(Case.context_summary.is_(None), Case.closed_at.is_(None))
                .limit(cfg.summary_batch_limit)
                .all()
            )
            for case in cases:
                refresh_case_summary(case.id, db)
            if cases:
                logger.info("summary refresh: %d cases", len(cases))
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — 定时任务失败只记录
        logger.error("scheduler summary job failed: %s", exc)




def _discover_job() -> None:
    """案件文件夹新文件自动发现（三档渐进第 1 档，开关 case_folder.auto_discover）。"""
    try:
        from core.case_folder.discovery import scan_case_folders

        db = get_session_factory()()
        try:
            events = scan_case_folders(db)
            if events:
                logger.info("folder discovery: %d new file(s)", len(events))
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — 定时任务失败只记录
        logger.error("scheduler folder discovery job failed: %s", exc)
def init_scheduler() -> BackgroundScheduler | None:
    """初始化并启动全局调度器（按 settings.scheduler.enabled；幂等）。

    Returns:
        已启动的 BackgroundScheduler；配置禁用时返回 None。
    """
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    cfg = get_config().settings.scheduler
    if not cfg.enabled:
        logger.info("scheduler disabled by config")
        return None
    hour, minute = (int(x) for x in cfg.backup_time.split(":", 1))
    _scheduler = BackgroundScheduler(timezone="Australia/Sydney")
    _scheduler.add_job(
        _backup_job, CronTrigger(hour=hour, minute=minute),
        id="daily_backup", max_instances=1, coalesce=True,
    )
    _scheduler.add_job(
        _overdue_job, IntervalTrigger(minutes=cfg.overdue_interval_minutes),
        id="overdue_check", max_instances=1, coalesce=True,
    )
    _scheduler.add_job(
        _summary_job, IntervalTrigger(hours=cfg.summary_interval_hours),
        id="summary_refresh", max_instances=1, coalesce=True,
    )

    fd = get_config().settings.case_folder.auto_discover
    if fd.enabled:
        _scheduler.add_job(
            _discover_job, IntervalTrigger(minutes=fd.interval_minutes),
            id="folder_discovery", max_instances=1, coalesce=True,
        )
    _scheduler.start()
    logger.info("scheduler started: daily_backup / overdue_check / summary_refresh")
    return _scheduler


def get_scheduler() -> BackgroundScheduler | None:
    """返回已初始化的调度器；未初始化返回 None。"""
    return _scheduler


def shutdown_scheduler() -> None:
    """停止调度器（幂等）。"""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
