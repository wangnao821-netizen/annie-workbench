"""解析 .eml / .msg 文件，提取邮件元数据写入 InboxMessage 表。"""

from __future__ import annotations

import email
import json
from datetime import datetime
from email import policy
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import InboxMessage

logger = get_logger(__name__)


def parse_eml_file(file_path: Path, case_id: str, db: Session) -> InboxMessage | None:
    """解析 .eml 写入 InboxMessage。去重用 message_id。"""
    try:
        with open(file_path, "rb") as f:
            msg = email.message_from_binary_file(f, policy=policy.default)

        message_id = msg.get("Message-ID", "").strip() or str(uuid4())

        # 去重检测
        existing = db.query(InboxMessage).filter(InboxMessage.message_id == message_id).first()
        if existing:
            logger.info("Duplicate email skipped (Message-ID: %s)", message_id)
            return existing

        subject = msg.get("Subject", "")
        sender = msg.get("From", "")
        received_str = msg.get("Date", "")
        received_at = None
        try:
            received_at = datetime.strptime(received_str, "%a, %d %b %Y %H:%M:%S %z")
            received_at = received_at.replace(tzinfo=None)
        except (ValueError, TypeError):
            received_at = datetime.utcnow()

        body_parts: list[str] = []
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    try:
                        body_parts.append(part.get_content())
                    except Exception:
                        pass
        else:
            try:
                body_parts.append(msg.get_content())
            except Exception:
                pass

        body_text = "\n".join(body_parts)
        body_preview = body_text[:500]

        inbox_msg = InboxMessage(
            id=str(uuid4()),
            matched_case_id=case_id,
            subject=subject,
            sender_email=sender,
            body_preview=body_preview,
            received_at=received_at,
            message_id=message_id,
            status="unprocessed",
            attachment_count=0,
        )
        db.add(inbox_msg)
        db.commit()
        logger.info("Parsed .eml: %s → InboxMessage %s", file_path.name, inbox_msg.id)
        return inbox_msg

    except Exception as exc:
        logger.error("Failed to parse .eml %s: %s", file_path.name, exc)
        return None


def parse_msg_file(file_path: Path, case_id: str, db: Session) -> InboxMessage | None:
    """解析 .msg（仅基础记录：文件名做 subject）。"""
    try:
        inbox_msg = InboxMessage(
            id=str(uuid4()),
            matched_case_id=case_id,
            subject=file_path.stem,
            sender_email="",
            body_preview="",
            received_at=datetime.utcnow(),
            message_id=str(uuid4()),
            status="unprocessed",
            attachment_count=0,
        )
        db.add(inbox_msg)
        db.commit()
        logger.info("Registered .msg: %s → InboxMessage %s", file_path.name, inbox_msg.id)
        return inbox_msg

    except Exception as exc:
        logger.error("Failed to register .msg %s: %s", file_path.name, exc)
        return None


def is_email_file(path: Path) -> bool:
    """判断是否邮件格式。"""
    return path.suffix.lower() in (".eml", ".msg")
