"""文件归档服务 — 生成建议名 + Vera 确认后执行物理移动。

核心流程：
1. Pipeline 分类完成后调用 generate_suggested_name() 生成建议文件名
2. Action 里展示建议名，Vera 可编辑
3. Vera 确认后调用 confirm_archive() 执行物理移动 + 清单打勾

Red Line compliance:
- 文件移动只在 Vera 确认后执行（user_confirmed=True 强制）
- PathGuard.assert_user_action_allowed() 做安全校验
- 每次操作写 file_events 不可变日志
- 不允许跨案件移动
- 不删除文件（只移动/重命名）
"""

from __future__ import annotations

import os
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from core.logger import get_logger
from core.security.path_guard import PathGuard
from core.models.orm import Case, CaseFile

logger = get_logger(__name__)

# ── document_type → 建议名前缀映射（从需求三规格文档提取）──

NAME_PREFIX_MAP: dict[str, str] = {
    "Passport": "ID Passport",
    "DriverLicense": "ID DL",
    "Driver License": "ID DL",
    "Visa": "ID Visa",
    "MedicareCard": "ID Medicare",
    "Medicare Card": "ID Medicare",
    "VOI": "ID VOI",
    "Payslip": "Income Payslip",
    "BankStatement": "Income Bank Statement",
    "Bank Statement": "Income Bank Statement",
    "TaxReturn": "Income Tax Return",
    "Tax Return": "Income Tax Return",
    "EmploymentLetter": "Employment Letter",
    "Employment Letter": "Employment Letter",
    "HomeLoanStatement": "Liability HL",
    "Home Loan Statement": "Liability HL",
    "CreditCardStatement": "Liability CC",
    "Credit Card Statement": "Liability CC",
    "PersonalLoanStatement": "Liability PL",
    "Personal Loan Statement": "Liability PL",
    "ContractOfSale": "Property COS",
    "Contract of Sale": "Property COS",
    "ValuationReport": "Property Valuation result",
    "Valuation Report": "Property Valuation result",
    "Gift Letter": "Gift Letter",
    "GiftLetter": "Gift Letter",
    "Approval Letter": "Approval Letter",
    "ApprovalLetter": "Approval Letter",
    "Rental Document": "Rental Document",
    "RentalDocument": "Rental Document",
    "Loan Document": "Loan Document",
    "LoanDocument": "Loan Document",
    "Living Expenses": "Living Expenses",
    "LivingExpenses": "Living Expenses",
    "CouncilRates": "Property Rates Notice",
    "Council Rates": "Property Rates Notice",
    "RatesNotice": "Property Rates Notice",
    "Rates Notice": "Property Rates Notice",
    "RentalAgreement": "Rental Agreement",
    "Rental Agreement": "Rental Agreement",
    "BrokerNotes": "BROKER NOTES",
    "Broker Notes": "BROKER NOTES",
    "Application": "Application",
    "Calculator": "Cal",
}

# ── file_routing.yaml 缓存 ──
_routing_rules: dict[str, Any] | None = None


def _load_routing_rules() -> dict[str, Any]:
    """Load file routing rules from config/file_routing.yaml.

    Returns:
        Parsed routing_rules dict with 'default' and 'overrides' keys.
    """
    global _routing_rules
    if _routing_rules is not None:
        return _routing_rules

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "file_routing.yaml"
    try:
        with open(config_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        _routing_rules = data.get("routing_rules", {"default": "Don't send", "overrides": []})
    except (OSError, yaml.YAMLError) as exc:
        logger.warning("Failed to load file_routing.yaml: %s (using defaults)", exc)
        _routing_rules = {"default": "Don't send", "overrides": []}

    return _routing_rules


def _sanitize_filename(name: str) -> str:
    """Remove dangerous characters from a suggested filename.

    Rules:
    - No path separators (/ \\ ..)
    - No special characters (<>:"|?*)
    - No leading/trailing dots or spaces
    - Preserve spaces (naming convention uses spaces)

    Args:
        name: Raw suggested filename.

    Returns:
        Sanitized filename safe for filesystem use.
    """
    # Remove path separators and traversal
    name = name.replace("/", "").replace("\\", "").replace("..", "")
    # Remove special characters (keep spaces, dots for extension, hyphens)
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "", name)
    # Collapse multiple spaces
    name = re.sub(r"\s+", " ", name)
    # Strip leading/trailing
    name = name.strip(". ")
    return name


def get_target_directory(document_type: str) -> str | None:
    """根据 file_routing.yaml 获取归档目标目录。

    Args:
        document_type: AI 分类结果。

    Returns:
        目录名如 "Don't send"，或 None 表示不移动（留在 _Inbox）。
    """
    rules = _load_routing_rules()

    # Check overrides first
    for override in rules.get("overrides", []):
        if override.get("document_type") == document_type:
            return override.get("target")  # Could be None (meaning don't move)

    # Default
    return rules.get("default", "Don't send")


def generate_suggested_name(
    document_type: str,
    extracted_data: dict[str, Any],
    original_name: str,
    client_name: str = "",
) -> str | None:
    """根据分类结果生成建议文件名。

    公式：{大类} {子类型} {来源/银行/公司} {日期/时间段}.{扩展名}
    - 空格分隔（不用下划线）
    - 特殊字符过滤
    - Unknown 类型返回 None（不建议改名）

    Args:
        document_type: AI 分类结果（如 "Bank Statement"）。
        extracted_data: 从文件内容提取的数据（source, date 等）。
        original_name: 原始文件名（用于获取扩展名）。
        client_name: 客户名（Broker Notes 等需要）。

    Returns:
        建议的文件名，或 None（Unknown 类型不建议改名）。
    """
    # Get extension from original filename
    ext = Path(original_name).suffix.lower()
    if not ext:
        ext = ".pdf"

    source = extracted_data.get("source") or extracted_data.get("bank") or ""
    date_str = extracted_data.get("date") or extracted_data.get("period") or ""

    clean_type = document_type if document_type and document_type not in ("Unknown", "unknown", "Other") else "Document"
    prefix = NAME_PREFIX_MAP.get(clean_type) or f"[{clean_type}]"

    # Build name parts
    parts = [prefix]
    if client_name and client_name not in ("客户", "[Client]"):
        parts.append(str(client_name))
    elif source:
        parts.append(str(source))
    if date_str:
        parts.append(str(date_str))

    suggested = "_".join(p for p in parts if p).replace(" ", "_") + ext
    suggested = _sanitize_filename(suggested)

    # Final safety: ensure it's not empty after sanitization
    if not suggested or suggested == ext:
        suggested = f"Document_{Path(original_name).stem}{ext}"

    return suggested


def confirm_archive(
    file_id: str,
    new_name: str,
    target_dir: str,
    user_confirmed: bool,
    db: Session,
) -> dict[str, Any]:
    """Vera 确认后执行归档（改名+移动+清单打勾）。

    流程：
    1. 查询 CaseFile 和 Case 记录
    2. 构建 source 和 target 路径
    3. PathGuard.assert_user_action_allowed() 安全校验
    4. 确保目标目录存在
    5. 执行移动+改名（shutil.move）
    6. 更新 CaseFile 记录
    7. 写 file_events 不可变日志
    8. 清单对应项自动打勾
    9. 返回新路径

    Args:
        file_id: CaseFile 的 ID。
        new_name: Vera 确认的最终文件名。
        target_dir: 归档目标目录名（如 "Don't send"）。
        user_confirmed: 必须为 True（API 层保证）。
        db: SQLAlchemy session.

    Returns:
        {"status": "ok", "new_path": str}

    Raises:
        ValueError: 文件或案件不存在。
        WriteNotAllowedError: 安全校验失败。
        OSError: 文件操作失败。
    """
    # 1. Query file and case
    file_record = db.query(CaseFile).filter(CaseFile.id == file_id).first()
    if not file_record:
        raise ValueError(f"文件记录不存在: {file_id}")

    case = db.query(Case).filter(Case.id == file_record.case_id).first()
    if not case:
        raise ValueError(f"案件不存在: {file_record.case_id}")

    # 2. Build paths
    client_files_root = Path(os.getenv("CLIENT_FILES_ROOT", ""))
    if not client_files_root.exists():
        raise ValueError("CLIENT_FILES_ROOT 未配置或不存在")

    case_folder = client_files_root / (case.folder_path or "")
    if not case_folder.exists():
        raise ValueError(f"案件文件夹不存在: {case_folder}")

    # Source: current file path (typically in _Inbox/)
    source = Path(file_record.nas_path)
    if not source.is_absolute():
        source = case_folder / source

    if not source.exists():
        raise ValueError(f"源文件不存在: {source}")

    # Target: case_folder / target_dir / new_name
    sanitized_name = _sanitize_filename(new_name)
    if not sanitized_name:
        raise ValueError("文件名无效（空或含非法字符）")

    target = case_folder / target_dir / sanitized_name

    # 3. Security check
    PathGuard.assert_user_action_allowed(
        source=source,
        target=target,
        user_confirmed=user_confirmed,
        client_files_root=client_files_root,
    )

    # 4. Ensure target directory exists
    target.parent.mkdir(parents=True, exist_ok=True)

    # 5. Execute move+rename
    shutil.move(str(source), str(target))
    logger.info("File archived: %s → %s", source.name, target)

    # 6. Update CaseFile record
    file_record.current_name = sanitized_name
    file_record.nas_path = str(target)
    file_record.archived = True
    file_record.archived_at = datetime.now(UTC)
    file_record.target_dir = target_dir

    # 7. Write file_events log (immutable audit trail)
    _log_file_event(
        event_type="rename_and_move",
        case_id=case.id,
        source_path=str(source),
        target_path=str(target),
        original_name=file_record.original_name,
        operator="vera",
        db=db,
    )

    # 8. Update checklist if applicable
    _update_checklist_for_file(case.id, file_record.assigned_type, db)

    db.commit()

    return {"status": "ok", "new_path": str(target)}


def skip_archive(file_id: str, db: Session) -> None:
    """跳过归档 — 文件留在 _Inbox，Action 标为已处理。

    Args:
        file_id: CaseFile 的 ID。
        db: SQLAlchemy session.
    """
    file_record = db.query(CaseFile).filter(CaseFile.id == file_id).first()
    if not file_record:
        raise ValueError(f"文件记录不存在: {file_id}")

    # Log the skip event
    _log_file_event(
        event_type="skip",
        case_id=file_record.case_id,
        source_path=file_record.nas_path,
        target_path=None,
        original_name=file_record.original_name,
        operator="vera",
        db=db,
    )

    db.commit()
    logger.info("File archive skipped: %s", file_record.original_name)


def _log_file_event(
    event_type: str,
    case_id: str,
    source_path: str,
    target_path: str | None,
    original_name: str,
    operator: str,
    db: Session,
) -> None:
    """Write an immutable file_events audit log entry.

    Args:
        event_type: "rename_and_move" | "skip" | "manual_move"
        case_id: Associated case ID.
        source_path: Path before operation.
        target_path: Path after operation (None for skip).
        original_name: Original filename.
        operator: "vera" | "judy" | "system"
        db: SQLAlchemy session.
    """
    try:
        import uuid as _uuid

        from core.models.orm import FileEvent
        event = FileEvent(
            id=f"evt_{_uuid.uuid4().hex[:8]}",
            event_type=event_type,
            case_id=case_id,
            source_path=source_path,
            target_path=target_path,
            original_name=original_name,
            operator=operator,
            timestamp=datetime.now(UTC).isoformat(),
        )
        db.add(event)
    except ImportError:
        # FileEvent model not yet available — log to file as fallback
        logger.info(
            "FILE_EVENT: type=%s case=%s source=%s target=%s operator=%s",
            event_type, case_id, source_path, target_path, operator,
        )


def _update_checklist_for_file(case_id: str, document_type: str | None, db: Session) -> None:
    """Update checklist item status when a file is archived.

    Marks the corresponding checklist item as "received" if the document_type
    matches a checklist requirement.

    Args:
        case_id: Case ID.
        document_type: The classified document type.
        db: SQLAlchemy session.
    """
    if not document_type:
        return

    try:
        from core.models.orm import CaseChecklist
        checklist_item = (
            db.query(CaseChecklist)
            .filter(
                CaseChecklist.case_id == case_id,
                CaseChecklist.document_type == document_type,
                CaseChecklist.status.in_(["pending", "needs_selection"]),
            )
            .first()
        )
        if checklist_item:
            checklist_item.status = "received"
            checklist_item.updated_at = datetime.now(UTC)
            logger.info(
                "Checklist auto-updated: %s/%s → received",
                case_id, document_type,
            )
    except (ImportError, Exception) as exc:
        logger.debug("Checklist update skipped: %s", exc)
