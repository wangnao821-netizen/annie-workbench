"""统一建案服务 — 所有建案流程的唯一入口。

无论从全局收件箱建案、微信/口信 parse-intent 建案、还是手动建案，
都调用 `create_case_from_source()` 这一个函数，确保逻辑一致。

功能：
1. generate_or_match_client_id() 关联客户
2. 生成 CASE-{UUID8} ID
3. 创建 Case 记录
4. 创建文件夹 + 标准子目录（_Inbox, Don't send, Send to Lender 等）
5. 存 CaseKnowledge（如有 raw_text）
6. 调用 remember()（脱敏后存 Mem0）
7. 更新 InboxMessage 状态（如有 inbox_message_id）

Red Line compliance:
- 文件夹创建在 CLIENT_FILES_ROOT 下（允许的唯一写客户区的操作是创建案件目录结构）
- PII 不外传（remember() 内部自动脱敏）
"""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseKnowledge, InboxMessage


def generate_case_id() -> str:
    """Generate a new case ID in the unified format CASE-{UUID8}."""
    return f"CASE-{uuid.uuid4().hex[:8].upper()}"


logger = get_logger(__name__)


# 标准子目录结构（Vera 的工作流要求，固定 12 个）
STANDARD_SUBDIRS = [
    "_Inbox",
    "Send to Lender",
    "Send to Infynity",
    "Don't send",
    "Valuation",
    "Approval",
    "Discharge",
    "Loan Documents",
    "Settlement",
    "To be signed",
    "Internal Compliance",
    "Post Settlement care",
]


def _sanitize_folder_name(name: str) -> str:
    """Remove dangerous characters from a folder name component.

    Strips path separators, traversal patterns, and special chars
    to prevent directory traversal attacks.

    Args:
        name: Raw string to be used as folder name component.

    Returns:
        Sanitized string safe for use in pathlib operations.
    """
    sanitized = name.replace("/", "").replace("\\", "").replace("..", "")
    sanitized = re.sub(r'[<>:"|?*\x00-\x1f]', "", sanitized)
    sanitized = sanitized.strip(". ")
    if not sanitized:
        sanitized = "unknown"
    return sanitized


def _get_client_files_root(db: Session) -> Path:
    """Read CLIENT_FILES_ROOT from DB system_settings or environment.

    Args:
        db: SQLAlchemy session.

    Returns:
        Path to the client files root directory.

    Raises:
        ValueError: If not configured anywhere.
    """
    try:
        from core.models.orm import SystemSetting
        setting = db.query(SystemSetting).filter(SystemSetting.key == "client_files_root").first()
        if setting and setting.value:
            return Path(setting.value)
    except Exception as exc:
        logger.debug("Failed to read client_files_root from DB: %s", exc)

    root = os.getenv("CLIENT_FILES_ROOT", "")
    if not root:
        raise ValueError("CLIENT_FILES_ROOT 未配置")
    return Path(root)


def generate_or_match_client_id(
    client_name: str,
    client_email: str,
    db: Session,
) -> tuple[str, str]:
    """匹配或生成 client_id。

    匹配策略：
    1. 精确匹配：同名 + 同邮箱 → 复用已有 client_id
    2. 模糊匹配：只有名字一样（邮箱不同）→ 返回 "name_only"（前端让 Vera 确认）
    3. 全新客户 → 生成新 client_id

    Args:
        client_name: 客户姓名。
        client_email: 客户邮箱。
        db: SQLAlchemy session.

    Returns:
        (client_id, match_type) — match_type: "exact" | "name_only" | "new"
    """
    # Strategy 1: exact match (name + email)
    if client_email:
        exact = (
            db.query(Case)
            .filter(
                Case.client_name == client_name,
                Case.client_email == client_email,
            )
            .first()
        )
        if exact and exact.client_id:
            return exact.client_id, "exact"

    # Strategy 2: name only match
    same_name = (
        db.query(Case)
        .filter(Case.client_name == client_name)
        .first()
    )
    if same_name and same_name.client_id:
        return same_name.client_id, "name_only"

    # Strategy 3: new client
    new_id = f"CLI-{uuid.uuid4().hex[:8].upper()}"
    return new_id, "new"


def create_case_from_source(
    client_name: str,
    source: str,
    db: Session,
    *,
    broker_name: str = "Brandon",
    loan_amount: float | None = None,
    purpose: str | None = None,
    lender: str | None = None,
    client_email: str = "",
    client_phone: str = "",
    raw_text: str = "",
    auto_folder: bool = True,
    inbox_message_id: str | None = None,
    force_new_client: bool = False,
    lender_ref: str | None = None,
    submission_platform: str | None = None,
    client_goal: str | None = None,
    special_circumstances: str | None = None,
) -> Case:
    """统一建案入口 — 所有建案流程汇入此处。"""
    # 1. Generate case_id
    case_id = generate_case_id()

    # Defensive: check uniqueness (extremely unlikely with UUID)
    existing = db.query(Case).filter(Case.id == case_id).first()
    if existing:
        case_id = generate_case_id()

    # 2. Match or generate client_id
    if force_new_client:
        client_id = f"CLI-{uuid.uuid4().hex[:8].upper()}"
    else:
        client_id, _ = generate_or_match_client_id(client_name, client_email, db)

    # 3. Create folder structure
    folder_path = ""
    if auto_folder:
        try:
            client_files_root = _get_client_files_root(db)
            safe_broker = _sanitize_folder_name(broker_name)
            safe_client = _sanitize_folder_name(client_name)

            # Create broker / client / case folder hierarchy
            broker_root = client_files_root / safe_broker
            broker_root.mkdir(parents=True, exist_ok=True)

            client_root = broker_root / safe_client
            client_root.mkdir(parents=True, exist_ok=True)

            case_folder = client_root / case_id
            case_folder.mkdir(parents=True, exist_ok=True)

            # Security: ensure under client_files_root
            resolved = case_folder.resolve()
            resolved.relative_to(client_files_root.resolve())

            # Create case folder + standard subdirs
            for subdir in STANDARD_SUBDIRS:
                (case_folder / subdir).mkdir(exist_ok=True)

            folder_path = f"{safe_broker}/{safe_client}/{case_id}"
            logger.info("Created case folder: %s", case_folder)
        except ValueError as exc:
            logger.warning("Skipped folder creation: %s", exc)
        except OSError as exc:
            logger.error("Failed to create case folder: %s", exc)
            raise

    # 4. Create Case record
    case = Case(
        id=case_id,
        client_id=client_id,
        client_name=client_name,
        client_email=client_email,
        client_phone=client_phone,
        broker_name=broker_name,
        loan_amount=loan_amount,
        property_value=0,
        lvr=0,
        purpose=purpose,
        lender=lender,
        lender_ref=lender_ref,
        employment_type=None,
        residency=None,
        stage="收集资料",
        folder_path=folder_path,
        is_urgent=0,
        gathering_progress=0,
        submission_platform=submission_platform,
        client_goal=client_goal,
        special_circumstances=special_circumstances,
    )
    db.add(case)

    # 5. Store CaseKnowledge (raw_text stays local)
    if raw_text:
        knowledge = CaseKnowledge(
            case_id=case_id,
            content=raw_text,
            source=f"initial_{source}",
        )
        db.add(knowledge)

    # 6. Update InboxMessage if linked
    if inbox_message_id:
        msg = db.query(InboxMessage).filter(InboxMessage.id == inbox_message_id).first()
        if msg:
            msg.matched_case_id = case_id
            msg.match_method = "manual"
            msg.match_confidence = 1.0
            msg.status = "assigned"
            msg.assigned_by = "vera"

    db.commit()
    db.refresh(case)

    # 7. Store in Mem0 (desensitized by remember()) — non-fatal
    if raw_text:
        try:
            # TODO: memory 接口对齐 # remember
            remember(case_id, raw_text, db)
        except Exception as exc:
            logger.warning("Mem0 storage failed for %s: %s (non-fatal)", case_id, exc)

    # 8. AI prefill Case Brain (non-blocking)
    if raw_text and not client_goal:
        try:
            from core.ai.context_builder import prefill_case_brain_from_text
            prefill_case_brain_from_text(case_id, raw_text, db)
        except Exception as exc:
            logger.warning("AI prefill case brain failed for %s: %s (non-fatal)", case_id, exc)

    logger.info(
        "Case created: %s (source=%s, client=%s, client_id=%s)",
        case_id, source, client_name, client_id,
    )
    return case