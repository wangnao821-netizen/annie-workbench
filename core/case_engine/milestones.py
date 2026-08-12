"""Case milestones tracking — migrated from loan-assistant milestone_processor.

Provides canonical stage-key resolution and milestone row management so that
``confirm_stage_advance`` (and settlement) can advance a case's stage while
writing/updating ``CaseMilestone`` records in the same transaction.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseMilestone

logger = get_logger(__name__)

# Ordered milestones sequence
MILESTONE_SEQUENCE = [
    "gathering",      # 收集资料
    "reviewing",      # 审核中
    "to_submit",      # 待递交
    "submitted",      # 已递交
    "os_requested",   # 银行补件
    "valuing",        # 估值中
    "approved",       # 已批准
    "settling",       # 结算中
    "settled",        # 已结算
]

MILESTONE_STAGE_MAP = {
    "gathering": "收集资料",
    "reviewing": "审核中",
    "to_submit": "待递交",
    "submitted": "已递交(等银行)",
    "os_requested": "银行补件",
    "valuing": "估值中",
    "approved": "已批准",
    "settling": "结算中",
    "settled": "已结算",
}

# 非里程碑阶段（终态/暂停态）的显式映射——未知阶段不得静默回落 "gathering"。
SPECIAL_STAGE_KEYS: dict[str, str] = {
    "withdrawn": "withdrawn",
    "terminated": "terminated",
    "declined": "declined",
    "resubmitted": "resubmitted",
    "on_hold": "on_hold",
    "on hold": "on_hold",
    "onhold": "on_hold",
    "已终止": "terminated",
    "已撤回": "withdrawn",
    "已拒绝": "declined",
    "已暂停": "on_hold",
    "已递交": "submitted",  # 中文标签变体（前端 WORKSPACE_STAGES 亦含该写法）
}

# 终态/暂停态统一常量：全局指挥中心、佣金、分析服务共用，避免各写一套。
TERMINAL_STAGE_KEYS: frozenset[str] = frozenset(
    {"settled", "withdrawn", "terminated", "declined", "resubmitted", "on_hold"}
)

# 清单项视为"已完成/不阻塞"的状态集合（暂缓=随案递交，与豁免同级）。
CHECKLIST_DONE_STATUSES: tuple[str, ...] = ("received", "waived", "deferred")


def get_stage_key(db_stage: str | None) -> str | None:
    """Map DB stage (Chinese label or English key) to canonical English key.

    Args:
        db_stage: DB 中的阶段值（中文标签或英文 key），可为空。

    Returns:
        规范英文 key；空值返回 "gathering"；无法识别的非空值返回 None
        （调用方须自行处理，不得静默当作收集资料）。
    """
    if not db_stage:
        return "gathering"
    stripped = db_stage.strip()
    if stripped in SPECIAL_STAGE_KEYS:
        return SPECIAL_STAGE_KEYS[stripped]
    for k, v in MILESTONE_STAGE_MAP.items():
        if v == stripped or k == stripped:
            return k
    low = stripped.lower()
    for k in MILESTONE_STAGE_MAP:
        if k.lower() == low:
            return k
    logger.warning("Unrecognized stage %r — returning None (not falling back to gathering)", db_stage)
    return None


def init_case_milestones(
    case_id: str,
    db: Session,
    case_created_at: datetime | None = None,
) -> list[CaseMilestone]:
    """Initialize the 9 milestone records for a case if they do not exist."""
    base_time = case_created_at or datetime.utcnow()
    logger.info("Initializing 9 milestones for case %s at base time %s", case_id, base_time)

    existing = {
        m.milestone_name: m
        for m in db.query(CaseMilestone).filter(CaseMilestone.case_id == case_id).all()
    }

    # Standard offset intervals for estimated dates
    offsets = {
        "gathering": 0,
        "reviewing": 1,
        "to_submit": 2,
        "submitted": 3,
        "os_requested": None,
        "valuing": None,
        "approved": 10,
        "settling": None,
        "settled": 30,
    }

    milestones = []
    for name in MILESTONE_SEQUENCE:
        if name in existing:
            milestones.append(existing[name])
            continue

        est_offset = offsets[name]
        est_date = base_time + timedelta(days=est_offset) if est_offset is not None else None

        # The first milestone (gathering) starts as completed
        is_completed = (name == "gathering")
        act_date = base_time if is_completed else None
        status = "completed" if is_completed else "pending"

        m = CaseMilestone(
            case_id=case_id,
            milestone_name=name,
            status=status,
            actual_date=act_date,
            estimated_date=est_date,
        )
        db.add(m)
        milestones.append(m)

    db.commit()
    return milestones


def update_case_stage_and_milestones(
    case_id: str,
    new_stage: str,
    db: Session,
) -> None:
    """Transition a case's current stage and update related milestones.

    Args:
        case_id: Target case.
        new_stage: Stage key (English key or Chinese label).
        db: SQLAlchemy session.

    Raises:
        ValueError: If stage is not a milestone stage or case is not found.
    """
    stage_key = get_stage_key(new_stage)
    if stage_key not in MILESTONE_SEQUENCE:
        raise ValueError(f"Invalid milestone stage: {new_stage}")

    logger.info("Transitioning case %s to stage: %s (key: %s)", case_id, MILESTONE_STAGE_MAP[stage_key], stage_key)
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"Case not found: {case_id}")

    # Set case.stage to the Chinese label for frontend compatibility
    case.stage = MILESTONE_STAGE_MAP[stage_key]

    # Make sure milestones exist
    milestones = db.query(CaseMilestone).filter(CaseMilestone.case_id == case_id).all()
    if not milestones or len(milestones) < len(MILESTONE_SEQUENCE):
        milestones = init_case_milestones(case_id, db, case.created_at)

    m_map = {m.milestone_name: m for m in milestones}

    # Determine index in sequence
    target_idx = MILESTONE_SEQUENCE.index(stage_key)

    # Complete target stage and all preceding stages
    now = datetime.utcnow()
    for i, name in enumerate(MILESTONE_SEQUENCE):
        if name in m_map:
            m = m_map[name]
            if i <= target_idx:
                if m.status != "completed":
                    m.status = "completed"
                    m.actual_date = now
            else:
                m.status = "pending"
                m.actual_date = None

    db.commit()
