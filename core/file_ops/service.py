"""core/file_ops/service.py — 文件 Agent（WO-44）：案件文件夹浏览/预览/改名/移动/放入 + 规范命名建议。
红线：只执行 Vera 明确请求（user_confirmed=True 为确认语义载体）；绝不自主移动/删除/改名；
目标已存在禁止覆盖（409）；跨案件禁止；路径穿越拒绝（422）；命名建议纯确定性，不调 LLM。
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import yaml
from sqlalchemy.orm import Session

from core.case_engine.folder import validate_path_safety
from core.case_folder.discovery import classify_file
from core.case_folder.lookup import parse_one
from core.logger import get_logger
from core.models.orm import Case, CaseFile, FileEvent
from core.security.path_guard import PathGuard, WriteNotAllowedError

logger = get_logger(__name__)
_IGNORED_NAMES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})
_IMPORT_EXTENSIONS = frozenset({".pdf", ".doc", ".docx", ".xlsx", ".xls", ".msg", ".txt", ".jpg", ".jpeg", ".png", ".csv"})
_RAW_MAX_BYTES = 20 * 1024 * 1024  # 原文预览大小上限 20MB → 413
_RAW_EXTENSIONS = frozenset({".pdf", ".jpg", ".jpeg", ".png", ".txt", ".md", ".csv"})
_RAW_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
}
_OPERATOR = "vera"
_CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
def _case_dir(case: Case, client_root: Path | None = None) -> tuple[Path, Path]:
    if case is None or not case.folder_path or not str(case.folder_path).strip():
        raise ValueError("案件未关联文件夹")
    # 2026-08-17：案件文件夹 = Vera 手动选择的任意绝对路径（无总根模式）
    case_dir = validate_path_safety(case.folder_path, client_root)
    return case_dir, case_dir
def _within(base: Path, rel: str | None) -> Path:
    raw = Path(rel or "")
    if ".." in raw.parts:
        raise ValueError(f"路径穿越拒绝：'{rel}' 包含 '..' 字符")
    target = (base if not rel else base / raw).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError:
        raise ValueError(f"路径越界拒绝：'{rel}' 不位于案件文件夹内") from None
    return target
def _log_event(db: Session, case_id: str, event_type: str, source_path: str,
               target_path: str, original_name: str | None = None) -> str:
    event_id = f"fe_{uuid4().hex[:8]}"
    db.add(FileEvent(id=event_id, case_id=case_id, event_type=event_type, module="file_ops",
                     source_path=source_path, target_path=target_path,
                     original_name=original_name, operator=_OPERATOR,
                     timestamp=datetime.now(UTC).isoformat()))
    db.commit()
    return event_id
def list_files(case: Case, rel_path: str = "", client_root: Path | None = None,
               db: Session | None = None) -> dict:
    """一层列出案件文件夹（子目录在前；path 相对案件目录，空=根）。

    WO-48：传入 db 时按绝对路径关联 processed_files，为已落库文件附带
    file_id（供前端 Office 原样排版预览 /api/files/{id}/preview）；未关联为 None。
    """
    case_dir, _root = _case_dir(case, client_root)
    target = _within(case_dir, rel_path) if rel_path else case_dir
    if not target.is_dir():
        raise ValueError(f"目录不存在：{rel_path or '/'}")
    file_id_by_path: dict[str, str] = {}
    if db is not None:
        file_id_by_path = {
            str(Path(row.nas_path).resolve()): row.id
            for row in db.query(CaseFile).filter(CaseFile.case_id == case.id).all()
        }
    dirs, files = [], []
    for child in sorted(target.iterdir()):
        if child.name in _IGNORED_NAMES or child.name.startswith("."):
            continue
        rel = child.relative_to(case_dir).as_posix()
        mtime = datetime.fromtimestamp(child.stat().st_mtime, tz=UTC).isoformat()
        if child.is_dir():
            dirs.append({"name": child.name, "rel_path": rel, "is_dir": True, "size": None,
                         "mtime": mtime, "doc_type": None, "file_id": None})
        else:
            doc_type, _conf = classify_file(child.name)
            files.append({"name": child.name, "rel_path": rel, "is_dir": False,
                          "size": child.stat().st_size, "mtime": mtime, "doc_type": doc_type,
                          "file_id": file_id_by_path.get(str(child.resolve()))})
    return {"current_path": rel_path or "", "items": dirs + files}
def preview_file(case: Case, rel_path: str, db: Session, client_root: Path | None = None) -> dict:
    case_dir, root = _case_dir(case, client_root)
    target = _within(case_dir, rel_path)
    if not target.is_file():
        raise ValueError(f"文件不存在：{rel_path}")
    stat = target.stat()
    root_rel = target.relative_to(root).as_posix()
    try:
        res = parse_one(case, root_rel, db, client_root=root)
        text_preview, parse_error = (res.get("summary") or "")[:2000], None
    except Exception as exc:  # noqa: BLE001
        logger.warning("preview parse failed for %s: %s", root_rel, exc)
        text_preview, parse_error = "", str(exc)
    return {"rel_path": root_rel, "size": stat.st_size,
            "mtime": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
            "doc_type": classify_file(target.name)[0],
            "text_preview": text_preview, "parse_error": parse_error}
def raw_file(case: Case, rel_path: str, client_root: Path | None = None) -> tuple[bytes, str, str]:
    """只读原文件字节流（WO-46）：validate_path_safety + 禁穿越/越界 + 白名单 + ≤20MB。

    红线：不写盘、不落库、不产生 FileEvent、不写客户文件夹；返回 (content, media_type, filename)。
    越界/穿越/不支持扩展名/过大 → ValueError（端点映射 422/413）；文件不存在 → ValueError（404）。
    """
    case_dir, _root = _case_dir(case, client_root)
    target = _within(case_dir, rel_path)
    if not target.is_file():
        raise ValueError(f"文件不存在：{rel_path}")
    ext = target.suffix.lower()
    if ext not in _RAW_EXTENSIONS:
        raise ValueError("该格式不支持在线原文预览")
    if target.stat().st_size > _RAW_MAX_BYTES:
        raise ValueError("文件过大，请直接打开本地文件夹")
    return target.read_bytes(), _RAW_MEDIA_TYPES[ext], target.name
def rename_file(case: Case, source: str, new_name: str, db: Session,
                client_root: Path | None = None) -> dict:
    case_dir, root = _case_dir(case, client_root)
    src = _within(case_dir, source)
    if not src.is_file():
        raise ValueError(f"文件不存在：{source}")
    name = (new_name or "").strip()
    if not name or "/" in name or "\\" in name or ".." in name or name.startswith("."):
        raise ValueError("非法文件名：不能为空、含路径分隔符或 '..'，不能以 '.' 开头")
    dst = src.parent / name
    PathGuard.assert_user_action_allowed(
        src, dst, user_confirmed=True, client_files_root=root, case_dir=case_dir,
    )
    os.rename(src, dst)
    event_id = _log_event(db, case.id, "folder_rename", src.relative_to(case_dir).as_posix(),
                          dst.relative_to(case_dir).as_posix(), original_name=src.name)
    return {"ok": True, "source": src.relative_to(case_dir).as_posix(),
            "target": dst.relative_to(case_dir).as_posix(), "event_id": event_id}
def move_file(case: Case, source: str, target_dir: str, db: Session,
              client_root: Path | None = None) -> dict:
    case_dir, root = _case_dir(case, client_root)
    src = _within(case_dir, source)
    if not src.is_file():
        raise ValueError(f"文件不存在：{source}")
    tdir = _within(case_dir, target_dir) if target_dir else case_dir
    if not tdir.is_dir():
        raise ValueError(f"目标目录不存在：{target_dir or '/'}")
    dst = tdir / src.name
    PathGuard.assert_user_action_allowed(
        src, dst, user_confirmed=True, client_files_root=root, case_dir=case_dir,
    )
    os.rename(src, dst)
    event_id = _log_event(db, case.id, "folder_move", src.relative_to(case_dir).as_posix(),
                          dst.relative_to(case_dir).as_posix(), original_name=src.name)
    return {"ok": True, "source": src.relative_to(case_dir).as_posix(),
            "target": dst.relative_to(case_dir).as_posix(), "event_id": event_id}
def import_file(case: Case, target_dir: str, filename: str, content: bytes,
                db: Session, client_root: Path | None = None) -> dict:
    case_dir, _root = _case_dir(case, client_root)
    name = Path(filename or "").name
    if not name:
        raise ValueError("文件名不能为空")
    if Path(name).suffix.lower() not in _IMPORT_EXTENSIONS:
        raise ValueError(f"不支持的文件类型：{Path(name).suffix.lower() or '(无扩展名)'}")
    tdir = _within(case_dir, target_dir) if target_dir else case_dir
    if not tdir.is_dir():
        raise ValueError(f"目标目录不存在：{target_dir or '/'}")
    dst = tdir / name
    if dst.exists():
        raise WriteNotAllowedError("目标文件已存在，禁止覆盖")
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        shutil.copy2(tmp_path, dst)
    finally:
        tmp_path.unlink(missing_ok=True)
    event_id = _log_event(db, case.id, "folder_import", "", dst.relative_to(case_dir).as_posix(),
                          original_name=name)
    return {"ok": True, "source": "", "target": dst.relative_to(case_dir).as_posix(),
            "event_id": event_id}

# ── 规范命名建议（纯确定性规则，不调 LLM） ────────────────────────────
def _naming_rules() -> dict:
    try:
        data = yaml.safe_load((_CONFIG_DIR / "naming_rules.yaml").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}
    return (data or {}).get("rules", {})
def _naming_key_for(doc_type: str | None) -> str | None:
    if not doc_type:
        return None
    rules = _naming_rules()
    if doc_type in rules:
        return doc_type
    norm_id = re.sub(r"[^a-z0-9]+", "", doc_type.lower())
    for key in rules:
        nk = re.sub(r"[^a-z0-9]+", "", key.lower())
        if nk and nk in norm_id:
            return key
    return None
def _date_of(filename: str) -> tuple[str, int, int]:
    m = re.search(r"(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b", filename)
    if m:
        month = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7,
                 "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}[m.group(1).lower()[:3]]
        year = int(m.group(2))
        return datetime(year, month, 1, tzinfo=UTC).strftime("%b %Y"), year, month
    m = re.search(r"(?i)\b(\d{4})[-/.](\d{1,2})\b", filename)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        return datetime(year, month, 1, tzinfo=UTC).strftime("%b %Y"), year, month
    today = datetime.now(UTC)
    return None, today.year, today.month

_BANK_KEYWORDS = [("commonwealth", "CBA"), ("cba", "CBA"), ("anz", "ANZ"), ("nab", "NAB"), ("westpac", "Westpac"),
                  ("st george", "St George"), ("macquarie", "Macquarie"), ("ing", "ING"), ("citibank", "Citi"), ("hsbc", "HSBC")]
def suggest_naming(case: Case, filename: str) -> dict:
    name = Path(filename or "").name
    doc_type, _conf = classify_file(name)
    template_key = _naming_key_for(doc_type)
    if template_key is None:
        return {"doc_type": doc_type, "suggested": name, "template_key": None,
                "matched": False, "reasons": ["未识别文档类型，保持原名"]}
    template = _naming_rules().get(template_key, {}).get("template") or "UNCLASSIFIED_{original_filename}"
    date_str, year, month = _date_of(name)
    vals = {
        "client_name": case.client_name or "", "employer": "", "date": date_str or datetime.now(UTC).strftime("%b %Y"),
        "bank": next((label for kw, label in _BANK_KEYWORDS if kw in name.lower()), ""),
        "last4": "", "date_range": "", "lender": "", "subclass": "",
        "year": str(year), "quarter": f"Q{((month - 1) // 3) + 1}",
        "property_short": "", "description": "", "round": "",
        "original_filename": Path(name).stem,
    }
    suggested = re.sub(r"\s{2,}", " ", template.format(**vals)).strip()
    return {"doc_type": doc_type, "suggested": suggested, "template_key": template_key,
            "matched": True, "reasons": [f"识别为 {template_key}，按规范命名模板生成"]}
