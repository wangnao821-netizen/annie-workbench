"""BrainFact 全量向量重建脚本 — sqlite-vec + 本地 BGE（WO-24）。

用法：
    python -m tools.rebuild_fact_embeddings [--db path] [--dry-run]

默认库：core/data/assistant.db。
--dry-run 只统计不写库。幂等：两次实跑结果一致（第二次写入 0 变更）。

Red Line: 嵌入前 value 先 desensitize（pii_map 永不出内网）；本地 ONNX，零出网。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.logger import get_logger

logger = get_logger(__name__)

DEFAULT_DB = PROJECT_ROOT / "core" / "data" / "assistant.db"


def _dry_run_counts(db_path: Path) -> dict:
    """dry-run：直接读库统计有效 BrainFact 数量，绝不写库/不触发迁移。"""
    with sqlite3.connect(str(db_path)) as conn:
        total = conn.execute("SELECT COUNT(*) FROM brain_facts WHERE valid_to IS NULL").fetchone()[0]
    return {"facts": int(total or 0), "embedded": 0, "failed": 0}


def main() -> int:
    parser = argparse.ArgumentParser(description="BrainFact 全量向量重建（sqlite-vec + BGE）")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="数据库路径")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写库")
    args = parser.parse_args()

    db_path = args.db
    print(f"=== WO-24 rebuild_fact_embeddings  {datetime.now(UTC).isoformat(timespec='seconds')} ===")
    print(f"DB: {db_path}")

    try:
        from core.knowledge.vector import rebuild_fact_embeddings

        if args.dry_run:
            stats = _dry_run_counts(db_path)
            print(f"[DRY-RUN] 不写库 → {stats}")
            return 0

        from sqlalchemy.orm import Session

        from core.models.db import get_engine

        engine = get_engine(db_path)
        with Session(bind=engine) as session:
            stats = rebuild_fact_embeddings(session)
        print(f"重建完成 → {stats}")
        return 0
    except Exception:
        logger.exception("rebuild_fact_embeddings failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())