"""Checklist completeness checker for loan cases.

Compares documents received against the YAML-defined requirements
for a given case type (full_doc / alt_doc / lite_doc) and produces
a ``ChecklistReport`` with received / missing / expired / pending items.
"""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.config import ConfigLoader
from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseFile

logger = get_logger(__name__)


@dataclass
class ChecklistItem:
    """A single checklist requirement."""

    doc_type: str
    status: str  # "received" | "missing" | "expired" | "expiring" | "pending_confirm"
    file_id: str | None = None
    description: str = ""
    min_count: int = 1
    actual_count: int = 0
    conditional: bool = False


@dataclass
class ChecklistReport:
    """Complete checklist evaluation for a case."""

    case_id: str
    case_type: str
    items: list[ChecklistItem] = field(default_factory=list)
    summary: dict[str, int] = field(default_factory=dict)


class CaseNotFoundError(Exception):
    """Raised when the case does not exist in the database."""


def check_completeness(
    case_id: str,
    session: Session,
    config: ConfigLoader,
) -> ChecklistReport:
    """Check document completeness for a loan case.

    Steps:
        1. Look up the case_type from the ``cases`` table.
        2. Load the matching checklist YAML from config.
        3. Query ``processed_files`` to see what has been received.
        4. Compare and produce the report.

    Args:
        case_id: The identifier of the case to check.
        session: SQLAlchemy Session.
        config: Configuration loader.

    Returns:
        A ``ChecklistReport`` with per-item status and summary counts.

    Raises:
        CaseNotFoundError: If the case is not in the database.
    """
    # 1. Get case type
    case = session.get(Case, case_id)
    if case is None:
        raise CaseNotFoundError(f"Case not found: {case_id}")
    case_type = case.case_type

    # 2. Load checklist definition
    checklist_def = config.checklists.get(case_type, {})
    required: dict[str, list[dict[str, Any]]] = checklist_def.get("required", {})

    # 3. Query processed files for this case (APPROVED + REPORTED + MANUALLY_CLASSIFIED)
    processed = (
        session.query(CaseFile).filter_by(case_id=case_id, status="APPROVED").all()
        + session.query(CaseFile).filter_by(case_id=case_id, status="REPORTED").all()
        + session.query(CaseFile).filter_by(case_id=case_id, status="MANUALLY_CLASSIFIED").all()
    )
    received_types: dict[str, list[CaseFile]] = {}
    for pf in processed:
        dt = pf.assigned_type or ""
        if dt:
            received_types.setdefault(dt, []).append(pf)

    # 4. Build items
    items: list[ChecklistItem] = []
    for reqs in required.values():
        for req in reqs:
            doc_type = req.get("type", "")
            desc = req.get("description", "")
            is_conditional = req.get("conditional", False)
            min_count = req.get("min_count", 1)
            max_age_days = req.get("max_age_days")

            if is_conditional:
                items.append(
                    ChecklistItem(
                        doc_type=doc_type,
                        status="pending_confirm",
                        description=desc,
                        min_count=min_count,
                        conditional=True,
                    )
                )
                continue

            matches = received_types.get(doc_type, [])
            actual_count = len(matches)

            if actual_count == 0:
                items.append(
                    ChecklistItem(
                        doc_type=doc_type,
                        status="missing",
                        description=desc,
                        min_count=min_count,
                        actual_count=0,
                    )
                )
                continue

            # Check expiry if max_age_days is set
            status = "received"
            first_file_id = matches[0].id
            if max_age_days is not None:
                created_dt = matches[0].created_at
                if created_dt is not None:
                    if created_dt.tzinfo is None:
                        created_dt = created_dt.replace(tzinfo=UTC)
                    age = (datetime.now(UTC) - created_dt).days
                    if age > max_age_days:
                        status = "expired"
                    elif age > max_age_days - 7:
                        status = "expiring"

            items.append(
                ChecklistItem(
                    doc_type=doc_type,
                    status=status,
                    file_id=first_file_id,
                    description=desc,
                    min_count=min_count,
                    actual_count=actual_count,
                )
            )

    # 5. Summary
    summary: dict[str, int] = {}
    for item in items:
        summary[item.status] = summary.get(item.status, 0) + 1

    report = ChecklistReport(
        case_id=case_id,
        case_type=case_type,
        items=items,
        summary=summary,
    )
    logger.info(
        "Checklist for %s (%s): %s", case_id, case_type, summary
    )
    return report


# ── WO-54 标题快速匹配与清单自动打勾 ──────────────────────────────────────────

# 忽略的文件列表
_IGNORED_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini", "processed_ids.txt"})

# 核心材料别名映射规则库（key: master_id 语义标识，values: 文件名关键词列表）
CHECKLIST_ALIAS_MAP: dict[str, list[str]] = {
    # 身份类
    "driver_licence": ["dl", "driver license", "driver licence", "驾照", "id dl"],
    "passport": ["passport", "护照", "id passport"],
    "visa_vevo": ["visa", "vevo", "155", "189", "190", "500", "820", "801", "签证", "id visa"],
    "voi": ["voi", "id voi", "verification of identity"],
    "credit_consent": ["credit_check", "client_consent", "privacy consent", "征信授权"],
    "identification": ["identification", "id summary", "身份证明"],
    # 房产与负债类
    "council_rates": ["rate notice", "rates notice", "council rate", "地税", "市政费", "rates"],
    "home_loan_statement": ["liability hl", "loan statement", "mortgage statement", "hl 流水", "房贷流水", "home loan"],
    "credit_card_statement": ["credit card", "cc statement", "信用卡流水", "cba credit"],
    # 自雇与收入类
    "se_declaration": ["se declaration", "self certified", "income declaration", "自雇声明", "self cert"],
    "accountant_letter": ["accountant", "cpa letter", "会计信", "会计师声明", "accountant declaration"],
    "company_search": ["company search", "asic search", "abn lookup", "公司查册"],
    # 估价与建议书
    "valuation_report": ["property val", "valuation report", "估价报告", "property valuation"],
    "soca": ["soca", "credit advice", "statement of credit advice"],
    "product_comparison": ["product comparison", "products comparison", "产品对比"],
    "application_form": ["application form", "loan submission pack", "application summary", "申请表"],
}

# 优先扫描的子目录（先于根目录）
_PRIORITY_SUBDIRS = ("Send to Lender", "To be signed", "Valuation")


def _normalize(text: str | None) -> str:
    """清单项名称归一化：小写 + 去非字母数字（仅用于 item_name 兜底对齐）。"""
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (text or "").lower())


def _resolve_case_folder(case: Case) -> Path | None:
    """解析案件关联目录：相对路径基于 CLIENT_FILES_ROOT，目录不存在返回 None。"""
    raw = (case.folder_path or "").strip()
    if not raw:
        return None
    folder = Path(raw)
    if not folder.is_absolute():
        root = os.getenv("CLIENT_FILES_ROOT", "")
        if not root:
            try:
                from core.config import get_config

                cfg_root = get_config().client_files_root
                root = str(cfg_root) if cfg_root else ""
            except Exception as exc:  # noqa: BLE001 — 配置不可用降级为空
                logger.debug("client_files_root unavailable: %s", exc)
        if root:
            folder = Path(root) / folder
    return folder if folder.is_dir() else None


def _collect_folder_files(folder: Path) -> list[Path]:
    """按优先级收集案卷文件：Send to Lender / To be signed / Valuation / 根目录 / 其余子目录。"""
    files: list[tuple[int, Path]] = []
    seen: set[Path] = set()

    for rank, subdir in enumerate(_PRIORITY_SUBDIRS):
        sub = folder / subdir
        if not sub.is_dir():
            continue
        for f in sub.iterdir():
            if f.is_file() and f.name not in _IGNORED_FILES and f not in seen:
                files.append((rank, f))
                seen.add(f)

    for f in folder.iterdir():
        if f.is_file() and f.name not in _IGNORED_FILES and f not in seen:
            files.append((len(_PRIORITY_SUBDIRS), f))
            seen.add(f)

    for sub in folder.iterdir():
        if (
            not sub.is_dir()
            or sub.name.startswith(".")
            or sub.name in _PRIORITY_SUBDIRS
        ):
            continue
        for f in sub.rglob("*"):
            if f.is_file() and f.name not in _IGNORED_FILES and f not in seen:
                files.append((len(_PRIORITY_SUBDIRS) + 1, f))
                seen.add(f)

    files.sort(key=lambda pair: pair[0])
    return [f for _, f in files]


def _get_or_create_casefile(case_id: str, db: Session, file_path: Path) -> CaseFile:
    """按 (case_id, nas_path) 唯一性查询或创建 CaseFile 记录，避免重复插入。"""
    nas_path = file_path.as_posix()
    existing = (
        db.query(CaseFile)
        .filter(CaseFile.case_id == case_id, CaseFile.nas_path == nas_path)
        .first()
    )
    if existing is not None:
        return existing
    record = CaseFile(
        id=f"file_{uuid.uuid4().hex[:12]}",
        case_id=case_id,
        original_name=file_path.name,
        nas_path=nas_path,
        status="received",
        file_extension=file_path.suffix.lower() or None,
    )
    db.add(record)
    db.flush()
    return record


def _pick_checklist_item(
    items: list[CaseChecklist],
    master_key: str,
    keywords: list[str],
    file_name: str,
) -> CaseChecklist | None:
    """语义对齐：master_id 精确命中优先，无 master_id 时按 item_name 小写别名兜底。"""
    for it in items:
        if it.master_id == master_key:
            return it
    name_hits = {kw for kw in keywords if kw in (file_name or "").lower()}
    norm_hits = {_normalize(kw) for kw in name_hits if _normalize(kw)}
    if not norm_hits:
        return None
    for it in items:
        if it.master_id:
            continue
        norm_item = _normalize(it.item_name)
        if norm_item and any(hit in norm_item for hit in norm_hits):
            return it
    return None


def match_checklist_files_for_case(case_id: str, db: Session) -> dict[str, Any]:
    """对指定案件的文件夹执行标题快速匹配并自动打勾。

    执行流程：
    1. 查询 Case 实例，若无 folder_path 或目录不存在，返回 {"matched_count": 0, "items": []}；
    2. 查询该案件名下的所有 CaseChecklist 项；
    3. 遍历 folder_path 及其子目录（优先按 Send to Lender / To be signed / Valuation / 根目录排序）：
       - 忽略 _IGNORED_FILES 及文件夹；
       - 生成/查询 CaseFile（按 case_id + nas_path 唯一性，避免重复插入）；
       - 文件名转小写后与 CHECKLIST_ALIAS_MAP 匹配；
       - 与 CaseChecklist 的 master_id 或 item_name（小写别名）进行语义对齐；
    4. 命中匹配项：
       - checklist_item.status = "received"
       - checklist_item.received_file_id = file.id
       - checklist_item.received_file_ids 列表中若无该 file.id 则 append
    5. 计算收集进度：
       - total_req = 必选项总数
       - received_req = 已收到的必选项数
       - case.gathering_progress = int((received_req / total_req) * 100) if total_req > 0 else 0
    6. db.commit() 并返回匹配详情。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        return {"matched_count": 0, "gathering_progress": 0, "items": []}

    folder = _resolve_case_folder(case)
    if folder is None:
        return {"matched_count": 0, "gathering_progress": 0, "items": []}

    checklist_items = (
        db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    )
    if not checklist_items:
        return {"matched_count": 0, "gathering_progress": 0, "items": []}

    matched: list[dict[str, Any]] = []
    for file_path in _collect_folder_files(folder):
        file_name = file_path.name
        file_lower = file_name.lower()
        for master_key, keywords in CHECKLIST_ALIAS_MAP.items():
            if not any(kw in file_lower for kw in keywords):
                continue
            item = _pick_checklist_item(checklist_items, master_key, keywords, file_name)
            if item is None:
                continue
            case_file = _get_or_create_casefile(case_id, db, file_path)
            item.status = "received"
            item.received_file_id = case_file.id
            received_ids = list(item.received_file_ids or [])
            if case_file.id not in received_ids:
                received_ids.append(case_file.id)
            item.received_file_ids = received_ids
            matched.append({
                "checklist_id": item.id,
                "item_name": item.item_name,
                "master_id": item.master_id,
                "status": item.status,
                "matched_file_id": case_file.id,
                "matched_file_name": file_name,
            })
            break  # 一个文件只绑定一个清单项

    total_req = sum(1 for it in checklist_items if it.is_required)
    received_req = sum(
        1 for it in checklist_items if it.is_required and it.status == "received"
    )
    case.gathering_progress = (
        int((received_req / total_req) * 100) if total_req > 0 else 0
    )

    db.commit()
    return {
        "matched_count": len(matched),
        "gathering_progress": case.gathering_progress,
        "items": matched,
    }
