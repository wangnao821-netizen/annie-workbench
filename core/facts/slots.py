"""core/facts/slots.py — 对话槽位结构化落库与直读管理（P3 阶段）。

提供结构化槽位（BrainFact）的持久化写入、更新与格式化直读功能。
彻底消除多轮对话重复反问已确认事实的痛点。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import BrainFact, CaseContextEvent

logger = get_logger(__name__)

# 常用结构化槽位与中文语义映射
SLOT_KEY_LABELS = {
    "applicant.spouse_income": "配偶年收入",
    "applicant.spouse_income_type": "配偶收入类型",
    "applicant.co_borrower_accepted": "共同借款人意愿",
    "applicant.employment_type": "雇佣类型",
    "applicant.living_expense_monthly": "每月申报开支",
    "liability.existing_loan_balance": "现有贷款余额",
    "liability.existing_repayment_monthly": "现有贷款月供",
    "liability.existing_lender": "现有贷款银行",
    "property.estimated_value": "房产估值",
    "property.rental_income_weekly": "每周租金收入",
}


def set_slot_fact(
    case_id: str,
    key: str,
    value: str | int | float,
    db: Session,
    category: str = "applicant",
    track: str = "internal",
    event_id: int | None = None,
) -> BrainFact:
    """持久化写入或更新一个案件槽位事实（BrainFact）。

    Args:
        case_id: 案件 ID。
        key: 槽位 key（如 "applicant.spouse_income"）。
        value: 槽位值（如 "1000000" 或 "PAYG"）。
        db: SQLAlchemy Session。
        category: 类别（applicant | liability | income | property 等）。
        track: internal | external。
        event_id: 关联的 context_event_id（若无则自动关联或设为 0）。

    Returns:
        BrainFact ORM 实例。
    """
    str_val = str(value).strip()
    now = datetime.utcnow()

    # 1. 查找当前有效的同名槽位
    existing = (
        db.query(BrainFact)
        .filter(
            BrainFact.case_id == case_id,
            BrainFact.key == key,
            BrainFact.track == track,
            BrainFact.valid_to.is_(None),
        )
        .first()
    )

    if existing is not None:
        if existing.value == str_val:
            return existing  # 幂等相同值直接返回
        # 标记旧事实过期
        existing.valid_to = now

    # 2. 插入新槽位
    new_fact = BrainFact(
        case_id=case_id,
        key=key,
        value=str_val,
        category=category or key.split(".", 1)[0],
        track=track,
        event_id=event_id or (existing.event_id if existing else 0),
        valid_from=now,
        valid_to=None,
    )
    db.add(new_fact)
    db.commit()
    db.refresh(new_fact)
    logger.info("BrainFact slot saved: case=%s key=%s val=%s", case_id, key, str_val)
    return new_fact


def get_case_slots(case_id: str, db: Session, track: str = "internal") -> dict[str, str]:
    """获取指定案件当前全部有效的结构化槽位字典 {key: value}。"""
    facts = (
        db.query(BrainFact)
        .filter(
            BrainFact.case_id == case_id,
            BrainFact.track == track,
            BrainFact.valid_to.is_(None),
        )
        .order_by(BrainFact.id.asc())
        .all()
    )
    return {f.key: f.value for f in facts}


def build_confirmed_slots_prompt_block(case_id: str, db: Session, track: str = "internal") -> str:
    """生成供 LLM 消费的已确认事实槽位提示词块。"""
    slots = get_case_slots(case_id, db, track)
    if not slots:
        return ""

    lines = [
        "【已确认结构化事实槽位 (严禁重复追问/反问)】",
        "（以下是用户/Broker 已明确确认的硬事实，请直接作为已知真值进行计算与推演，严禁向用户再次反问！）"
    ]
    for key, val in slots.items():
        label = SLOT_KEY_LABELS.get(key, key)
        lines.append(f"- {label} ({key}): {val}")

    return "\n".join(lines)
