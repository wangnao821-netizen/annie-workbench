"""发件人积分学习引擎。

Vera 的日常操作自动反馈到发件人积分，使系统越用越准。
积分规则来自规划文档第五节。

积分变化规则：
- 低优先级→标记为业务: +2
- 低优先级→给自己: +2
- 待处理→给自己: +1
- 待处理→忽略: -1
- 任何邮件→静音该类别: -2
- 任何邮件→静音该发件人: -3

积分使用规则：
- net_score >= 3: 跳过 AI，直接标为"业务"（Vera 反复确认过）
- net_score <= -4: 跳过 AI，直接标为"低优先级"（Vera 反复忽略过）
- 其他: 需要 AI 判断

Red Line compliance:
- 纯本地 DB 操作，不调用外部 API
- 不写入客户文件夹
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import InboxSenderScore

logger = get_logger(__name__)


# ── 积分阈值常量 ──
SCORE_THRESHOLD_BUSINESS = 3    # >= 此值 → 直接标为业务
SCORE_THRESHOLD_LOW = -4        # <= 此值 → 直接标为低优先级


def get_sender_score(sender_email: str, db: Session) -> int:
    """查询发件人当前净积分。

    Args:
        sender_email: 发件人邮箱地址。
        db: SQLAlchemy session。

    Returns:
        净积分值，未记录的发件人返回 0。
    """
    record = db.query(InboxSenderScore).filter(
        InboxSenderScore.sender_email == sender_email
    ).first()
    return record.net_score if record else 0


def update_score(sender_email: str, delta: int, db: Session) -> int:
    """更新发件人积分。

    正数增加 business_count，负数增加 ignore_count。
    net_score = business_count - ignore_count。

    Args:
        sender_email: 发件人邮箱。
        delta: 积分变化值（正 = 业务确认，负 = 忽略/静音）。
        db: SQLAlchemy session。

    Returns:
        更新后的 net_score。
    """
    record = db.query(InboxSenderScore).filter(
        InboxSenderScore.sender_email == sender_email
    ).first()

    if not record:
        record = InboxSenderScore(
            sender_email=sender_email,
            business_count=0,
            ignore_count=0,
            net_score=0,
        )
        db.add(record)

    if delta > 0:
        record.business_count += delta
    else:
        record.ignore_count += abs(delta)

    record.net_score = record.business_count - record.ignore_count
    record.updated_at = datetime.now(UTC)
    db.commit()

    logger.info(
        "Sender score updated: %s delta=%+d → net_score=%d",
        sender_email,
        delta,
        record.net_score,
    )
    return record.net_score


def classify_by_score(net_score: int) -> str | None:
    """根据积分决定邮件优先级。

    Args:
        net_score: 发件人的当前净积分。

    Returns:
        "business" / "low_priority" / None（None 表示需要 AI 判断）。
    """
    if net_score >= SCORE_THRESHOLD_BUSINESS:
        return "business"
    if net_score <= SCORE_THRESHOLD_LOW:
        return "low_priority"
    return None


def get_score_delta(action: str, current_level: str) -> int:
    """根据 Vera 的操作和当前邮件级别，计算积分变化量。

    Args:
        action: Vera 的操作类型。
            - "assign_self": 给自己
            - "assign_colleague": 给同事
            - "ignore": 忽略
            - "mute_category": 静音该类别
            - "mute_sender": 静音该发件人
            - "promote": 低优先级翻盘
        current_level: 邮件当前的优先级 (urgent/business/low_priority/muted)。

    Returns:
        积分变化值。
    """
    if action == "promote":
        # 低优先级→标记为业务
        return 2

    if action == "assign_self" or action == "assign_colleague":
        if current_level == "low_priority":
            return 2  # 低优先级→给自己/给同事
        return 1  # 待处理→给自己/给同事

    if action == "ignore":
        return -1  # 待处理→忽略

    if action == "mute_category":
        return -2  # 静音该类别

    if action == "mute_sender":
        return -3  # 静音该发件人

    return 0
