"""client_id 回填脚本 — 为历史案件补充 client_id 关联。

功能：
1. 扫描所有案件，按 client_email 或 client_name 分组
2. 同一客户的多个案件分配相同的 client_id
3. 已有 client_id 的案件跳过

运行方式：
    python tools/backfill_client_id.py [--dry-run]

Red Line:
- 只修改 data/assistant.db 中的 client_id 字段
- 不触碰客户文件夹
- 不调用外部 API
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path
from uuid import uuid4

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.logger import get_logger
from core.models.db import get_sa_session_direct, init_sa_tables
from core.models.orm import Case

logger = get_logger(__name__)


def _generate_client_id() -> str:
    """Generate a unique client_id in format CLI-{UUID8}."""
    return f"CLI-{uuid4().hex[:8].upper()}"


def backfill_client_ids(dry_run: bool = False) -> dict[str, int]:
    """回填 client_id — 按邮箱或姓名分组。

    Args:
        dry_run: True 时只打印不写入。

    Returns:
        统计信息 dict: {"skipped": N, "updated": N, "groups": N}
    """
    init_sa_tables()
    session = get_sa_session_direct()

    try:
        cases = session.query(Case).all()

        # 统计
        skipped = 0
        updated = 0

        # 按邮箱分组（优先）
        email_groups: dict[str, list[Case]] = defaultdict(list)
        name_groups: dict[str, list[Case]] = defaultdict(list)
        no_key_cases: list[Case] = []

        for case in cases:
            if case.client_id:
                skipped += 1
                continue

            if case.client_email:
                email_groups[case.client_email.lower().strip()].append(case)
            elif case.client_name:
                name_groups[case.client_name.strip().lower()].append(case)
            else:
                no_key_cases.append(case)

        # 合并分组：先邮箱，再姓名（可能有重叠）
        assigned_names: dict[str, str] = {}  # name_lower → client_id

        # 按邮箱分组赋值
        groups_count = 0
        for group_cases in email_groups.values():
            client_id = _generate_client_id()
            groups_count += 1
            for case in group_cases:
                if dry_run:
                    logger.info(
                        "[DRY-RUN] Would assign %s → case %s (%s)",
                        client_id, case.id, case.client_name,
                    )
                else:
                    case.client_id = client_id
                updated += 1
                # 记录该姓名已关联
                if case.client_name:
                    assigned_names[case.client_name.strip().lower()] = client_id

        # 按姓名分组赋值（跳过已通过邮箱关联的）
        for name_key, group_cases in name_groups.items():
            if name_key in assigned_names:
                # 已通过邮箱组关联，使用相同 client_id
                client_id = assigned_names[name_key]
            else:
                client_id = _generate_client_id()
                groups_count += 1

            for case in group_cases:
                if dry_run:
                    logger.info(
                        "[DRY-RUN] Would assign %s → case %s (%s)",
                        client_id, case.id, case.client_name,
                    )
                else:
                    case.client_id = client_id
                updated += 1

        # 无邮箱无姓名的案件单独分配
        for case in no_key_cases:
            client_id = _generate_client_id()
            groups_count += 1
            if dry_run:
                logger.info(
                    "[DRY-RUN] Would assign %s → case %s (no name/email)",
                    client_id, case.id,
                )
            else:
                case.client_id = client_id
            updated += 1

        if not dry_run:
            session.commit()
            logger.info("Committed %d client_id updates (%d groups)", updated, groups_count)
        else:
            logger.info("[DRY-RUN] Would update %d cases in %d groups", updated, groups_count)

        return {"skipped": skipped, "updated": updated, "groups": groups_count}

    finally:
        session.close()


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("=== DRY RUN MODE (no changes will be written) ===\n")

    stats = backfill_client_ids(dry_run=dry_run)
    print(f"\n完成: 跳过 {stats['skipped']} (已有), 更新 {stats['updated']} (分为 {stats['groups']} 组)")
