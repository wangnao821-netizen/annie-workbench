"""core/case_engine/onboarding_tasks.py — 建案自动待办生成（WO-76）。

在新案件建立或历史导入成功后，自动为 Vera 创建 3 条首批 Action 待办：
1. 发送材料清单邮件给客户 (high, 当天 Sydney 工作日)
2. 跑 Equifax 信用报告 (medium, +3 天)
3. 确认客户律师/过户师信息 (low, +7 天)

特性与红线约束：
- 幂等性：按 (case_id, type) 检查，已存在则跳过；
- 开关控制：受 config.settings.onboarding.tasks_enabled 控制；
- 红线：仅持久化 Action 记录，绝不执行任何外部通知或自动外发。
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from core.config import get_config
from core.holidays import is_working_day
from core.logger import get_logger
from core.models.orm import Action, Case

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = get_logger(__name__)

SYDNEY_TZ = ZoneInfo("Australia/Sydney")


def _get_next_working_day_start(base_date: datetime.date | None = None) -> datetime:
    """获取悉尼时区下一个工作日的上午 09:00（若当天是工作日则取当天）。"""
    if base_date is None:
        base_date = datetime.now(SYDNEY_TZ).date()

    curr_date = base_date
    is_wd, _ = is_working_day(curr_date, "nsw")
    while not is_wd:
        curr_date += timedelta(days=1)
        is_wd, _ = is_working_day(curr_date, "nsw")

    # 返回 naive datetime 以适配数据库 DateTime 列
    return datetime.combine(curr_date, time(9, 0))


def create_initial_tasks(case_id: str, db: Session) -> list[Action]:
    """建案后创建 3 条首批待办；幂等：同 case + 同 type 已存在则跳过。

    Args:
        case_id: 案件唯一标识
        db: 数据库 Session

    Returns:
        本次新创建并持久化的 Action 列表
    """
    if not case_id or not case_id.strip():
        return []

    # 1. 检查配置开关
    try:
        cfg = get_config()
        onboarding_cfg = getattr(cfg.settings, "onboarding", None)
        if onboarding_cfg is not None and not getattr(onboarding_cfg, "tasks_enabled", True):
            logger.info("Onboarding tasks disabled in config, skipping case %s", case_id)
            return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to check onboarding config: %s", exc)

    # 2. 检查案件是否存在及是否为存量历史导入案卷 (WO-90)
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        logger.warning("Case %s not found when creating onboarding tasks", case_id)
        return []
    if case.is_imported:
        logger.info("Case %s is imported from history/topology, skipping initial onboarding tasks", case_id)
        return []

    # 3. 计算截止/定时时间（Sydney 工作日）
    day1_dt = _get_next_working_day_start()
    day3_dt = day1_dt + timedelta(days=3)
    day7_dt = day1_dt + timedelta(days=7)

    task_specs = [
        {
            "type": "send_checklist_email",
            "title": "发送材料清单邮件给客户",
            "priority": "high",
            "scheduled_at": day1_dt,
        },
        {
            "type": "run_equifax_report",
            "title": "跑 Equifax 信用报告",
            "priority": "medium",
            "scheduled_at": day3_dt,
        },
        {
            "type": "confirm_solicitor_info",
            "title": "确认客户律师/过户师信息",
            "priority": "low",
            "scheduled_at": day7_dt,
        },
    ]

    # 4. 幂等查重
    existing_actions = db.query(Action).filter(Action.case_id == case_id).all()
    existing_types = {act.type for act in existing_actions}

    created_actions: list[Action] = []
    for spec in task_specs:
        if spec["type"] in existing_types:
            continue

        act = Action(
            case_id=case_id,
            type=spec["type"],
            title=spec["title"],
            priority=spec["priority"],
            status="pending",
            assignee="vera",
            source_channel="onboarding",
            match_status="confirmed",
            scheduled_at=spec["scheduled_at"],
        )
        db.add(act)
        created_actions.append(act)
        existing_types.add(spec["type"])

    # 5. 持久化并刷新
    if created_actions:
        db.commit()
        for act in created_actions:
            db.refresh(act)
        logger.info(
            "Created %d initial onboarding task(s) for case %s",
            len(created_actions),
            case_id,
        )

    return created_actions
