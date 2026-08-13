"""银行×平台运行时覆盖 — bank_platform_states 表（WO-25）。"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from core.models.orm import BankPlatformState


def get_override(db: Session, bank_key: str) -> dict | None:
    """返回 {platforms, vera_confirmed} 覆盖；无覆盖返回 None。"""
    row = db.query(BankPlatformState).filter_by(bank_key=bank_key).first()
    if not row:
        return None

    try:
        platforms = json.loads(row.platforms)
    except (json.JSONDecodeError, TypeError):
        platforms = []

    return {
        "platforms": list(platforms),
        "vera_confirmed": bool(row.vera_confirmed),
    }


def set_override(db: Session, bank_key: str, platforms: list[str], vera_confirmed: bool) -> None:
    """写入/更新覆盖（upsert）。"""
    row = db.query(BankPlatformState).filter_by(bank_key=bank_key).first()
    json_platforms = json.dumps(platforms)
    if row:
        row.platforms = json_platforms
        row.vera_confirmed = vera_confirmed
        row.updated_at = datetime.now(UTC)
    else:
        row = BankPlatformState(
            bank_key=bank_key,
            platforms=json_platforms,
            vera_confirmed=vera_confirmed,
        )
        db.add(row)
    db.commit()


def merged_bank_item(db: Session, lender: dict) -> dict:
    """registry 条目 + 覆盖合并：覆盖存在时 platforms/vera_confirmed 取覆盖值。"""
    item = dict(lender)
    override = get_override(db, item["key"])
    if override:
        item["platforms"] = override["platforms"]
        item["vera_confirmed"] = override["vera_confirmed"]
    else:
        item["platforms"] = list(item.get("platforms") or [])
        item["vera_confirmed"] = bool(item.get("vera_confirmed"))
    return item
