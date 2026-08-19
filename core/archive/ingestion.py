"""core/archive/ingestion.py — 历史案卷批量归档扫描与入库管道（WO-60）。"""
from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.case_creation import generate_case_id
from core.case_folder.topology import _count_files, _is_case_dir, parse_case_folder_name
from core.logger import get_logger
from core.models.orm import Case, ImportRecord
from core.pipeline.parser import parse_file

logger = get_logger(__name__)
# 放款与交割关键词
_SETTLED_KEYWORDS = ("settled", "settlement", "completed", "放款", "已交割", "done")
# 额外终态证据关键词（批复函 / 交割单）
_APPROVAL_KEYWORDS = ("approval", "approved", "statement", "批复", "交割单")

_WITHDRAWN_RE = re.compile(r"withdrawn|撤回", re.IGNORECASE)
_IGNORED_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})
_TEXT_EXTS = frozenset({".txt", ".md", ".docx", ".doc", ".xlsx", ".xlsm", ".xls"})
_RATE_RE = re.compile(
    r"(?i)(?:interest\s*rate|利率|rate\s*[:=]?)[^\d]{0,12}(\d{1,2}(?:\.\d{1,3})?)"
)
_PERCENT_RE = re.compile(r"\b(\d{1,2}(?:\.\d{1,3})?)\s*%")
_FLOAT_RE = re.compile(r"\b(\d{1,2}\.\d{2})\b")
_LOAN_RE = re.compile(r"(?i)(?:loan\s*amount|贷款金额)[^\d$]{0,20}\$?\s*([\d,]+(?:\.\d+)?)")
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_DATE_RE = re.compile(
    r"(?P<iso>\d{4}[-/.]\d{1,2}[-/.]\d{1,2})"
    r"|(?P<us>\d{1,2}[-/.]\d{1,2}[-/.]\d{4})"
    r"|(?P<en>\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})"
    r"|(?P<cn>\d{4}年\d{1,2}月\d{1,2}日)",
)

def _ymd(y: int, mo: int, d: int) -> str:
    return f"{y:04d}-{mo:02d}-{d:02d}"

def _find_date(text: str) -> str | None:
    for m in _DATE_RE.finditer(text):
        if m.group("iso"):
            p = re.split(r"[-/.]", m.group("iso"))
            return _ymd(int(p[0]), int(p[1]), int(p[2]))
        if m.group("us"):
            p = re.split(r"[-/.]", m.group("us"))
            return _ymd(int(p[2]), int(p[1]), int(p[0]))
        if m.group("en"):
            mm = re.match(r"\s*(\d{1,2})\s+([A-Za-z]+)[^A-Za-z]*(\d{4})", m.group("en"))
            return _ymd(int(mm.group(3)), _MONTHS[mm.group(2)[:3].lower()], int(mm.group(1)))
        if m.group("cn"):
            mm = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日", m.group("cn"))
            return _ymd(int(mm.group(1)), int(mm.group(2)), int(mm.group(3)))
    return None
def _read_case_texts(case_dir: Path) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    try:
        files = sorted(f for f in case_dir.rglob("*") if f.is_file() and f.name not in _IGNORED_FILES)
    except OSError:
        return results
    for f in files:
        if f.suffix.lower() in _TEXT_EXTS or "settlement" in f.name.lower() or "交割" in f.name:
            try:
                parsed = parse_file(f)
            except Exception as exc:  # noqa: BLE001 — 单文件解析失败不阻断扫描
                logger.debug("Skipping unparseable archive file %s: %s", f, exc)
                continue
            if parsed.text:
                results.append((f.name, parsed.text))
    return results

def _extract_settlement_date(texts: list[tuple[str, str]], file_names: list[str], dir_name: str) -> str:
    sources = (
        [f"{n} {t}" for n, t in texts if "settlement" in n.lower() or "settled" in n.lower() or "交割" in n]
        + [n for n in file_names if "settlement" in n.lower() or "settled" in n.lower() or "交割" in n]
        + [f"{n} {t}" for n, t in texts]
        + [n for n in file_names]
        + [dir_name]
    )
    for source in sources:
        found = _find_date(source)
        if found:
            return found
    return datetime.now(UTC).date().isoformat()

def _extract_interest_rate(dir_name: str, texts: list[tuple[str, str]]) -> str | None:
    broker_texts = [t for n, t in texts if "broker" in n.lower() or "notes" in n.lower()]
    combined = "\n".join(t for _, t in texts)
    for text in broker_texts + [combined]:
        m = _RATE_RE.search(text) or _PERCENT_RE.search(text)
        if m:
            return m.group(1)
    m = _RATE_RE.search(dir_name) or _FLOAT_RE.search(dir_name)
    if m:
        return m.group(1)
    return None

def _extract_loan_amount(texts: list[tuple[str, str]]) -> float | None:
    combined = "\n".join(t for _, t in texts)
    m = _LOAN_RE.search(combined)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None

def _detect_terminal_status(dir_name: str, file_names: list[str], all_text: str, parsed: dict[str, Any]) -> str:
    lower = f"{dir_name} {' '.join(file_names)} {all_text}".lower()
    if _WITHDRAWN_RE.search(lower) or parsed["status"] == "withdrawn":
        return "withdrawn"
    if any(k in lower for k in _SETTLED_KEYWORDS) or any(k in lower for k in _APPROVAL_KEYWORDS):
        return "settled"
    return "active"

def _find_existing_case(case_dir: Path, db: Session) -> Case | None:
    posix_path = case_dir.as_posix()
    return (
        db.query(Case)
        .filter((Case.folder_path == posix_path) | (Case.folder_path == str(case_dir)))
        .first()
    )

def _build_archive_item(case_dir: Path, client_name: str, db: Session | None) -> dict[str, Any]:
    parsed = parse_case_folder_name(case_dir.name)
    try:
        file_names = sorted(f.name for f in case_dir.rglob("*") if f.is_file() and f.name not in _IGNORED_FILES)
    except OSError:
        file_names = []
    texts = _read_case_texts(case_dir)
    all_text = "\n".join(t for _, t in texts)
    status = _detect_terminal_status(case_dir.name, file_names, all_text, parsed)

    in_workbench = False
    already_archived = False
    filter_reason: str | None = None
    if db is not None:
        existing = _find_existing_case(case_dir, db)
        if existing is not None:
            if existing.stage != "closed":
                in_workbench = True
                filter_reason = (
                    f"该案卷正在工作台推进中（stage={existing.stage}），"
                    "属在办案卷，禁止跨区归档"
                )
            else:
                already_archived = True
                filter_reason = "该案卷已归档入库，无需重复导入"

    eligible = status in ("settled", "withdrawn") and not in_workbench and not already_archived
    if not eligible and filter_reason is None:
        filter_reason = "未检测到放款/交割终态证据，疑似草稿或半成品，禁止入库"

    return {
        "dir_name": case_dir.name,
        "folder_path": str(case_dir),
        "client_name": client_name,
        "lender": parsed["lender"],
        "loan_amount": _extract_loan_amount(texts),
        "property_address": parsed["property_address"],
        "settlement_date": _extract_settlement_date(texts, file_names, case_dir.name),
        "interest_rate": _extract_interest_rate(case_dir.name, texts),
        "status": status,
        "eligible": eligible,
        "in_workbench": in_workbench,
        "already_archived": already_archived,
        "filter_reason": filter_reason,
        "file_count": _count_files(case_dir),
    }

def scan_archive_folder(folder_path: str, db: Session | None = None) -> dict[str, Any]:
    """扫描历史客户/总目录，执行准入过滤与放款事实提取。"""
    root = Path(folder_path)
    if not root.is_dir():
        return {
            "ok": False,
            "message": f"文件夹不存在: {folder_path}",
            "client_name": None,
            "total_found": 0,
            "eligible_count": 0,
            "cases": [],
        }
    try:
        subdirs = sorted(p for p in root.iterdir() if p.is_dir())
    except OSError:
        subdirs = []
    case_dirs = [p for p in subdirs if _is_case_dir(p.name)]
    if not case_dirs:
        case_dirs = [root]
    cases = [_build_archive_item(case_dir, root.name, db) for case_dir in case_dirs]
    return {
        "ok": True,
        "message": None,
        "client_name": root.name,
        "total_found": len(cases),
        "eligible_count": sum(1 for c in cases if c["eligible"]),
        "cases": cases,
    }

def _parse_settlement_datetime(raw: str | None) -> datetime:
    if raw:
        m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", raw)
        if m:
            y, mo, d = map(int, m.groups())
            return datetime(y, mo, d, tzinfo=UTC)
        try:
            dt = datetime.fromisoformat(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt
        except ValueError:
            pass
    return datetime.now(UTC)

def batch_import_archive_cases(items: list[dict[str, Any]], db: Session) -> dict[str, Any]:
    """批量将选定的历史完结案卷作为已结案资产归档入库。

    写入 Case 表（stage="closed", close_reason=status, is_imported=True,
    closed_at=settlement_date），并记录 ImportRecord。
    """
    created: list[dict[str, Any]] = []
    for item in items:
        case_id = generate_case_id()
        if db.query(Case).filter(Case.id == case_id).first() is not None:
            case_id = generate_case_id()
        case = Case(
            id=case_id,
            client_name=item.get("client_name", ""),
            folder_path=item.get("folder_path"),
            lender=item.get("lender"),
            loan_amount=item.get("loan_amount"),
            stage="closed",
            close_reason=item.get("status") or "settled",
            is_imported=True,
            closed_at=_parse_settlement_datetime(item.get("settlement_date")),
            interest_rate=item.get("interest_rate"),
        )
        db.add(case)
        created.append({
            "case_id": case.id,
            "client_name": case.client_name,
            "folder_path": case.folder_path,
        })
    db.add(
        ImportRecord(
            source="archive_batch",
            status="done",
            file_count=len(items),
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
            note=f"历史案卷批量归档入库 {len(items)} 案卷",
        )
    )
    db.commit()
    try:
        from core.archive.knowledge_bridge import sync_archive_to_knowledge_base
        sync_archive_to_knowledge_base(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Auto sync knowledge failed: %s", exc)
    logger.info("Archive batch imported %d closed cases", len(created))
    return {"ok": True, "imported_count": len(created), "created_cases": created}
