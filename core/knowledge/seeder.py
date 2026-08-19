"""core/knowledge/seeder.py — 行业知识与合规政策种子数据自动导入。

自动解析 config/industry_seed.yaml，幂等导入至 KnowledgeEntry（layer="industry"），
确保新安装或初次启动时行业知识中心（银行政策/平台规范/合规红线）数据即开即用。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import uuid

import yaml
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import KnowledgeEntry

logger = get_logger(__name__)


def seed_industry_knowledge(db: Session) -> int:
    """自动导入 config/industry_seed.yaml 中的行业知识条目。

    Returns:
        int: 新增导入的条目数量。
    """
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "industry_seed.yaml"
    if not config_path.is_file():
        logger.warning("Industry seed file not found: %s", config_path)
        return 0

    try:
        data: dict[str, Any] = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to parse industry_seed.yaml: %s", exc)
        return 0

    defaults = data.get("defaults", {})
    imported_count = 0

    # 三大核心板块：合规红线 / 平台规范 / 银行政策
    sections = [
        ("compliance", "compliance"),
        ("platform", "platform"),
        ("policy", "policies"),
    ]

    for section_key, entry_type in sections:
        items = data.get(section_key, [])
        default_ref = defaults.get(section_key, {}).get("source_ref", "行业公开资料")

        for item in items:
            content = (item.get("content") or "").strip()
            if not content:
                continue

            title = item.get("title", "")
            tags = item.get("tags") or []
            priority = item.get("priority", "normal")
            lender = item.get("lender")
            source_ref = item.get("source_ref") or default_ref

            # 如果没有显式 lender，尝试从 title 或 tags 提取银行名称
            if not lender:
                for tag in tags:
                    if tag in ("CBA", "Westpac", "ANZ", "NAB", "Macquarie", "Latrobe", "Pepper", "Liberty", "Resimac", "ORDE", "BOC"):
                        lender = tag
                        break

            # 幂等检查：检查是否已存在相同内容
            existing = (
                db.query(KnowledgeEntry)
                .filter(
                    KnowledgeEntry.layer == "industry",
                    KnowledgeEntry.content == content,
                )
                .first()
            )
            if existing:
                continue

            entry = KnowledgeEntry(
                id=f"ke_ind_{uuid.uuid4().hex[:10]}",
                layer="industry",
                entry_type=entry_type,
                content=content,
                source="industry_seed",
                vera_confirmed=True,
                lender=lender,
                tags=json.dumps(tags, ensure_ascii=False) if isinstance(tags, list) else str(tags),
                priority=priority,
                source_ref=source_ref,
            )
            db.add(entry)
            imported_count += 1

    if imported_count > 0:
        db.commit()
        logger.info("Successfully seeded %d industry knowledge entries into assistant.db", imported_count)

    return imported_count
