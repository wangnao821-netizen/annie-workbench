"""core/case_folder/discovery.py — 新文件自动发现（三档渐进第 1 档，WO-31）。

扫描已关联案件文件夹（Case.folder_path）→ 文件名分类（V1 不 OCR）→ 高置信自动匹配
清单项"已收"（可撤销）→ SSE 提醒。红线：只读、不写客户内容、不移动/改名/删除。
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from core.ai.case_summary import mark_case_summary_dirty
from core.checklist.reverse_match import _load_master, match_file_to_checklist_items
from core.config import get_config
from core.events.sse import sse_manager
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseFile, FileEvent

logger = get_logger(__name__)

_IGNORED_NAMES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})


def _platform_dirs(folder: Path) -> list[Path]:
    """案件文件夹下所有顶层 "Send to *" 目录（Send to Lender / Send to Infynity / ...）。"""
    try:
        return [p for p in folder.iterdir()
                if p.is_dir() and p.name.lower().startswith("send to ")]
    except OSError:
        return []


def _aliases() -> dict[str, list[str]]:
    """主清单别名表：master id → aliases（惰性加载，分类用）。"""
    return {str(it.get("id")): list(it.get("aliases") or []) for it in _load_master()}


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (name or "").lower())


def classify_file(filename: str) -> tuple[str | None, float]:
    """文件名关键词分类（V1 不 OCR）。返回 (doc_type=master id, confidence)。

    最长别名优先：多个别名命中时取最长（如 visa155 优先于 visa），避免短别名抢先误配。
    """
    plain = _normalize(filename)
    best: tuple[str, str, float] | None = None
    for key, aliases in _aliases().items():
        for alias in aliases:
            a = _normalize(alias)
            if not a or a not in plain:
                continue
            confidence = 0.95 if plain == a or plain.startswith(a) or plain.endswith(a) else 0.85
            if best is None or len(a) > len(best[1]):
                best = (key, a, confidence)
    if best is None:
        return None, 0.0
    return best[0], best[2]


def _log_event(db: Session, case_id: str, file_id: str, event_type: str, details: dict) -> None:
    db.add(FileEvent(
        id=f"fe_{uuid4().hex[:12]}",
        file_id=file_id,
        event_type=event_type,
        module="case_folder.discovery",
        details=json.dumps(details, ensure_ascii=False),
        timestamp=datetime.now(UTC).isoformat(),
    ))


def _auto_match(db: Session, case: Case, record: CaseFile) -> list[int]:
    """高置信自动匹配清单项为已收（可撤销）。返回匹配到的 CaseChecklist.id 列表。"""
    master_ids = [c.master_id for c in db.query(CaseChecklist).filter(
        CaseChecklist.case_id == case.id, CaseChecklist.master_id.isnot(None)).all() if c.master_id]
    hits = match_file_to_checklist_items(record.original_name, record.assigned_type or "", master_ids, db)
    matched_ids: list[int] = []
    for mid in hits:
        item = db.query(CaseChecklist).filter(
            CaseChecklist.case_id == case.id, CaseChecklist.master_id == mid,
            CaseChecklist.status == "pending").first()
        if item is None:
            continue
        item.status = "received"
        item.received_file_id = record.id
        ids = list(item.received_file_ids or [])
        if record.id not in ids:
            ids.append(record.id)
        item.received_file_ids = ids
        item.ai_suggestion = f"自动匹配（文件夹发现，置信度 {record.confidence:.0%}）"
        matched_ids.append(item.id)
        _log_event(db, case.id, record.id, "folder_auto_match", {"checklist_item_id": item.id, "item_name": item.item_name})
    if matched_ids:
        mark_case_summary_dirty(case.id, db)
    return matched_ids


def scan_case_folders(db: Session) -> list[dict]:
    """扫描所有已关联案件文件夹：发现新文件 → 分类 → 提醒/自动匹配。返回新发现事件。"""
    cfg = get_config().settings.case_folder.auto_discover
    if not cfg.enabled:
        return []
    events: list[dict] = []
    cases = db.query(Case).filter(Case.folder_path.isnot(None), Case.folder_path != "").all()
    for case in cases:
        # 2026-08-17 无总根模式：folder_path 即案件文件夹绝对路径
        folder = Path(str(case.folder_path))
        if not folder.is_dir():
            continue
        for root in (_platform_dirs(folder) or [folder]):
            for f in sorted(root.rglob("*")):
                if not f.is_file() or f.name in _IGNORED_NAMES:
                    continue
                dup = db.query(CaseFile).filter(CaseFile.case_id == case.id, CaseFile.nas_path == str(f)).first()
                if dup is not None:
                    continue
                doc_type, confidence = classify_file(f.name)
                file_id = f"file_{uuid4().hex[:12]}"
                record = CaseFile(
                    id=file_id, case_id=case.id, original_name=f.name, assigned_type=doc_type,
                    confidence=confidence or None, nas_path=str(f), status="discovered",
                    file_extension=f.suffix.lower() or None, file_size=f.stat().st_size,
                )
                db.add(record)
                db.flush()
                _log_event(db, case.id, file_id, "folder_discovered",
                           {"path": f.relative_to(folder).as_posix(), "doc_type": doc_type, "confidence": confidence})
                matched: list[int] = []
                if doc_type and confidence >= cfg.confidence_threshold:
                    matched = _auto_match(db, case, record)
                db.commit()
                events.append({"case_id": case.id, "file_id": file_id, "original_name": f.name,
                               "doc_type": doc_type, "confidence": confidence, "matched": matched})
                sse_manager.publish("file_discovered", {
                    "case_id": case.id, "file_id": file_id, "original_name": f.name,
                    "doc_type": doc_type, "matched": matched,
                })
    return events


def revoke_folder_file_match(db: Session, case_id: str, file_id: str) -> int:
    """撤销自动匹配：恢复该文件匹配到的清单项为 pending。返回撤销条数。"""
    items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    reverted = 0
    for item in items:
        ids = list(item.received_file_ids or [])
        if file_id not in ids:
            continue
        ids.remove(file_id)
        item.received_file_ids = ids
        if not ids:
            item.status = "pending"
            item.received_file_id = None
            item.ai_suggestion = None
        reverted += 1
    if reverted:
        _log_event(db, case_id, file_id, "folder_match_revoked", {"reverted_items": reverted})
        mark_case_summary_dirty(case_id, db)
        db.commit()
    return reverted
