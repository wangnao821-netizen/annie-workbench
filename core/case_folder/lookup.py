"""core/case_folder/lookup.py — 按需自主取案件文件（三档渐进第 2 档，WO-32）。

Vera 指定关键词/路径提示 → 只读检索案件文件夹内匹配文件 / 解析具体文件摘要。
红线：只读（PathGuard 校验）、不主动枚举全量目录、不写客户内容、路径穿越拒绝。
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.case_engine.folder import _get_default_client_root, validate_path_safety
from core.case_folder.discovery import classify_file
from core.logger import get_logger
from core.models.orm import Case
from core.pii.gateway import desensitize
from core.pipeline.parser import parse_file

logger = get_logger(__name__)

_IGNORED_NAMES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})


def lookup_files(
    case: Case | None,
    query: str,
    client_root: Path | str | None = None,
) -> list[dict[str, Any]]:
    """按文件名关键词/类型在已关联案件文件夹中检索匹配文件（只读元数据）。

    Args:
        case: Case 实例。
        query: 检索关键词/类型提示。
        client_root: CLIENT_FILES_ROOT 根目录（可选）。

    Returns:
        匹配的文件元数据列表 [{"rel_path": ..., "size": ..., "mtime": ..., "doc_type": ...}]

    Raises:
        ValueError: 案件无 folder_path 或 query 包含 '..' 路径穿越。
    """
    if case is None or not case.folder_path or not str(case.folder_path).strip():
        raise ValueError("案件未关联文件夹")

    raw_q = query or ""
    if ".." in raw_q:
        raise ValueError(f"路径穿越拒绝：query '{query}' 包含 '..' 字符")

    root = Path(client_root).resolve() if client_root else _get_default_client_root()
    case_dir = validate_path_safety(case.folder_path, root)

    if not case_dir.is_dir():
        return []

    q = raw_q.strip().lower()
    results: list[dict[str, Any]] = []

    for f in sorted(case_dir.rglob("*")):
        if not f.is_file() or f.name in _IGNORED_NAMES or f.name.startswith("."):
            continue

        rel_to_root = f.relative_to(root).as_posix()
        doc_type, _confidence = classify_file(f.name)

        if q:
            name_match = q in f.name.lower()
            rel_match = q in rel_to_root.lower()
            type_match = bool(doc_type and q in doc_type.lower())
            if not (name_match or rel_match or type_match):
                continue

        stat = f.stat()
        mtime_iso = datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat()
        results.append({
            "rel_path": rel_to_root,
            "size": stat.st_size,
            "mtime": mtime_iso,
            "doc_type": doc_type,
        })

    return results


def parse_one(
    case: Case | None,
    rel_path: str,
    db: Session,
    client_root: Path | str | None = None,
) -> dict[str, Any]:
    """对案件文件夹中指定文件执行只读解析，输出脱敏摘要。

    Args:
        case: Case 实例。
        rel_path: 相对 CLIENT_FILES_ROOT 的文件路径。
        db: SQLAlchemy Session (用于 PII 脱敏 mapping)。
        client_root: CLIENT_FILES_ROOT 根目录（可选）。

    Returns:
        {"rel_path": ..., "summary": ..., "text_quality": ..., "parse_route": ...}

    Raises:
        ValueError: 案件无 folder_path、rel_path 越界/包含 '..' 或文件不存在。
    """
    if case is None or not case.folder_path or not str(case.folder_path).strip():
        raise ValueError("案件未关联文件夹")

    if not rel_path or ".." in rel_path:
        raise ValueError(f"路径穿越拒绝：rel_path '{rel_path}' 包含 '..' 字符")

    root = Path(client_root).resolve() if client_root else _get_default_client_root()
    target_path = validate_path_safety(rel_path, root)

    if not target_path.is_file():
        raise ValueError(f"文件不存在：{rel_path}")

    res = parse_file(target_path)
    raw_text = res.text or ""
    clean_summary = desensitize(raw_text, case.id, db)

    return {
        "rel_path": target_path.relative_to(root).as_posix(),
        "summary": clean_summary,
        "text_quality": getattr(res, "text_quality", "high"),
        "parse_route": getattr(res, "parse_route", "native_text"),
    }
