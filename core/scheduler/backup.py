"""SQLite 在线备份 — sqlite3 backup API（不锁主进程）+ 保留策略（Phase 2 数据保命）。"""

from __future__ import annotations

import re
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path

from core.logger import get_logger
from core.models.db import DB_PATH

logger = get_logger(__name__)

_BACKUP_PREFIX = "assistant_"
_BACKUP_RE = re.compile(rf"^{_BACKUP_PREFIX}\d{{8}}_\d{{6}}\.db$")


def backup_database(
    db_path: Path | None = None,
    backup_dir: Path | None = None,
    keep_days: int = 7,
) -> Path:
    """SQLite 在线备份（sqlite3 backup API，不锁主进程），并清理过期备份。

    Args:
        db_path: 源库路径；默认 core/data/assistant.db（DB_PATH）。
        backup_dir: 备份目录；默认源库同目录 backups/。
        keep_days: 保留天数，超过的 assistant_*.db 按 mtime 删除。

    Returns:
        生成的备份文件路径。

    Raises:
        FileNotFoundError: 源库不存在。
    """
    src = db_path or DB_PATH
    if not src.exists():
        raise FileNotFoundError(f"database not found: {src}")
    dest_dir = backup_dir or (src.parent / "backups")
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    dest = dest_dir / f"{_BACKUP_PREFIX}{stamp}.db"

    src_con = sqlite3.connect(str(src))
    try:
        dest_con = sqlite3.connect(str(dest))
        try:
            src_con.backup(dest_con)
        finally:
            dest_con.close()
    finally:
        src_con.close()

    _prune(dest_dir, keep_days)
    logger.info("backup created: %s", dest)
    return dest


def _prune(backup_dir: Path, keep_days: int) -> None:
    """删除 backups/ 下超过 keep_days 的本工具备份文件（assistant_*.db）。"""
    cutoff = time.time() - keep_days * 86400
    for f in backup_dir.glob(f"{_BACKUP_PREFIX}*.db"):
        if not _BACKUP_RE.match(f.name):
            continue
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                logger.info("pruned old backup: %s", f)
        except OSError as exc:
            logger.warning("prune backup failed %s: %s", f, exc)
