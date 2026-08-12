"""收件箱静音规则引擎。

检查新邮件是否命中已有的静音规则，命中则自动标记为 muted。
支持三种静音类型：
- sender: 发件人邮箱包含匹配
- subject_pattern: 主题 fnmatch 通配符匹配
- ai_category: AI 分类标签精确匹配

Red Line compliance:
- 纯本地 DB 查询，不调用外部 API
- 不写入客户文件夹
"""

from __future__ import annotations

from fnmatch import fnmatch

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import InboxFilter

logger = get_logger(__name__)


def is_muted(
    sender_email: str,
    subject: str,
    ai_category: str | None,
    db: Session,
) -> bool:
    """检查邮件是否命中静音规则。

    遍历所有 action="mute" 的规则，任意一条命中即返回 True。

    Args:
        sender_email: 发件人邮箱。
        subject: 邮件标题。
        ai_category: AI 分类标签（可能为空，首次入库时尚未分类）。
        db: SQLAlchemy session。

    Returns:
        True 如果命中任何静音规则。
    """
    filters = db.query(InboxFilter).filter(InboxFilter.action == "mute").all()

    for f in filters:
        if f.filter_type == "sender":
            if f.filter_value.lower() in sender_email.lower():
                logger.debug("Mute hit (sender): %s matches %s", sender_email, f.filter_value)
                return True

        elif f.filter_type == "subject_pattern":
            if fnmatch(subject.lower(), f.filter_value.lower()):
                logger.debug("Mute hit (subject): %r matches %s", subject, f.filter_value)
                return True

        elif f.filter_type == "ai_category":
            if ai_category and ai_category == f.filter_value:
                logger.debug("Mute hit (category): %s matches %s", ai_category, f.filter_value)
                return True

    return False


def create_mute_rule(
    filter_type: str,
    filter_value: str,
    db: Session,
    created_by: str = "vera_manual",
) -> InboxFilter:
    """创建一条新的静音规则。

    Args:
        filter_type: 规则类型 (sender / subject_pattern / ai_category)。
        filter_value: 匹配值。
        db: SQLAlchemy session。
        created_by: 创建者标识。

    Returns:
        新创建的 InboxFilter 记录。

    Raises:
        ValueError: filter_type 不合法时。
    """
    valid_types = {"sender", "subject_pattern", "ai_category"}
    if filter_type not in valid_types:
        raise ValueError(f"Invalid filter_type: {filter_type}. Must be one of {valid_types}")

    # 检查是否已有相同规则（避免重复）
    existing = db.query(InboxFilter).filter(
        InboxFilter.filter_type == filter_type,
        InboxFilter.filter_value == filter_value,
    ).first()

    if existing:
        logger.info("Mute rule already exists: type=%s value=%s", filter_type, filter_value)
        return existing

    rule = InboxFilter(
        filter_type=filter_type,
        filter_value=filter_value,
        action="mute",
        created_by=created_by,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    logger.info("Mute rule created: type=%s value=%s by=%s", filter_type, filter_value, created_by)
    return rule


def delete_mute_rule(rule_id: int, db: Session) -> bool:
    """删除一条静音规则。

    Args:
        rule_id: 规则 ID。
        db: SQLAlchemy session。

    Returns:
        True 如果成功删除，False 如果规则不存在。
    """
    rule = db.query(InboxFilter).filter(InboxFilter.id == rule_id).first()
    if not rule:
        return False

    db.delete(rule)
    db.commit()
    logger.info("Mute rule deleted: id=%d type=%s value=%s", rule_id, rule.filter_type, rule.filter_value)
    return True


def list_mute_rules(db: Session) -> list[InboxFilter]:
    """获取所有静音规则。

    Args:
        db: SQLAlchemy session。

    Returns:
        所有 InboxFilter 记录列表。
    """
    return db.query(InboxFilter).order_by(InboxFilter.created_at.desc()).all()
