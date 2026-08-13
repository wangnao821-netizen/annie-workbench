#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Offline tool to import historical emails and attachments from a local PST file.

# This tool is designed to be executed via the command line and NEVER integrated
# into the web backend process (Constitutional Red Line & Phase 3.2 rules).
#
# Usage::
#
#     python tools/import_pst.py --pst <本地PST路径> --case-id <case_id> [--dry-run]
"""

from __future__ import annotations

import argparse
import email
import os
import re
import sys
from email.policy import default
from pathlib import Path

# Try to import PffArchive globally so it can be easily mocked in tests
try:
    from libratom.lib.pff import PffArchive  # type: ignore[import-untyped]
except ImportError:
    PffArchive = None

# Add project root to sys.path so we can import shared modules
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.pii.gateway import desensitize
from core.knowledge.memory import remember
from core.logger import get_logger, setup_file_logging
from core.models.db import get_session_factory
from core.models.orm import Case, CaseKnowledge

logger = get_logger("import_pst")


def _sanitize_filename(name: str) -> str:
    """Sanitize the attachment filename to prevent directory traversal.

    Args:
        name: The raw filename from email.

    Returns:
        Sanitized safe filename.
    """
    if not name:
        return "unnamed_attachment"
    # Remove directory separators and traversal patterns
    sanitized = name.replace("/", "").replace("\\", "").replace("..", "")
    # Remove characters that are illegal in filenames on Windows
    sanitized = re.sub(r'[<>:"|?*\x00-\x1f]', "", sanitized)
    sanitized = sanitized.strip(". ")
    if not sanitized:
        return "unnamed_attachment"
    return sanitized


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="一次性导入本地 PST 历史邮件与附件"
    )
    parser.add_argument(
        "--pst",
        required=True,
        help="本地 PST 文件的绝对或相对路径（必须在本地，禁止使用 UNC 网络盘路径）"
    )
    parser.add_argument(
        "--case-id",
        required=True,
        help="关联的案件 ID (e.g. case_20260710_zhangsan)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="启用预览模式，仅打印要处理的邮件和发件人，不写入数据库与磁盘"
    )
    return parser.parse_args()


def process_pst(
    pst_path_str: str,
    case_id: str,
    dry_run: bool = False,
) -> None:
    """Open a local PST file, traverse messages, extract metadata and attachments,

    and write them to the SQLite database and Mem0 memory (after desensitization).

    Args:
        pst_path_str: Local path to the PST file.
        case_id: Case ID to associate with the imported emails.
        dry_run: If True, do not perform any disk/DB writes.
    """
    # Initialize logging to file
    log_file = PROJECT_ROOT / "logs" / "import_pst.log"
    setup_file_logging(log_file, max_size_mb=10, backup_count=3, level="INFO")

    logger.info("开始处理 PST 导入任务. case_id: %s, dry_run: %s", case_id, dry_run)

    # 1. Path safety check (must be a local file, no network share/UNC path)
    pst_path = Path(pst_path_str).resolve()
    if not pst_path.exists():
        logger.error("PST 文件不存在: %s", pst_path)
        print(f"错误: PST 文件不存在: {pst_path}")
        sys.exit(1)
    if not pst_path.is_file():
        logger.error("路径不是一个文件: %s", pst_path)
        print(f"错误: 路径不是一个文件: {pst_path}")
        sys.exit(1)

    # Detect network paths (UNC paths start with double slashes)
    if str(pst_path).startswith("\\\\") or str(pst_path).startswith("//"):
        logger.error("禁止直接读取网络盘或 UNC 路径: %s", pst_path)
        print("错误: PST 文件必须拷到本地硬盘运行，禁止直接读取网络路径（UNC 路径）")
        sys.exit(1)

    # 2. Database validation: case_id must exist
    session_factory = get_session_factory()
    db = session_factory()
    try:
        case = db.query(Case).filter(Case.id == case_id).first()
        if not case:
            logger.error("案件不存在: %s", case_id)
            print(f"错误: 数据库中找不到指定的案件 ID: {case_id}")
            sys.exit(1)

        case_folder_name = case.folder_path
        if not case_folder_name:
            logger.error("案件 %s 未配置文件夹路径", case_id)
            print(f"错误: 案件 {case_id} 缺少文件夹配置")
            sys.exit(1)

        # Get client files root from environment
        client_files_root_str = os.getenv("CLIENT_FILES_ROOT", "")
        if not client_files_root_str:
            logger.error("CLIENT_FILES_ROOT 未配置")
            print("错误: 环境变量 CLIENT_FILES_ROOT 未设置，请配置 .env 文件")
            sys.exit(1)

        client_files_root = Path(client_files_root_str).resolve()
        case_dir = (client_files_root / case_folder_name).resolve()

        # Attachment write directory is always the _Inbox subfolder under the case folder
        attachment_dir = case_dir / "_Inbox"

        if not dry_run:
            attachment_dir.mkdir(parents=True, exist_ok=True)

    finally:
        db.close()

    # 3. Open PST archive using libratom
    if PffArchive is None:
        logger.error("未找到 libratom 包")
        print("错误: 找不到 libratom。请先在虚拟环境中运行: pip install libratom")
        sys.exit(1)

    try:
        archive = PffArchive(str(pst_path))
    except Exception as exc:
        logger.exception("无法打开 PST 归档文件")
        print(f"错误: 无法解析 PST 归档文件: {exc}")
        sys.exit(1)

    # Count total messages for progress printing
    try:
        total_messages = sum(
            folder.get_number_of_sub_messages() for folder in archive.folders()
        )
    except Exception as exc:
        logger.warning("无法计算总邮件数，将只打印已处理数量: %s", exc)
        total_messages = 0

    print(f"正在扫描 PST 文件，共发现 {total_messages} 封邮件。")

    # 4. Stream process emails
    processed_count = 0
    success_count = 0
    fail_count = 0

    for folder in archive.folders():
        if folder.get_number_of_sub_messages() == 0:
            continue

        for message in folder.sub_messages:
            processed_count += 1
            if total_messages > 0:
                print(f"\r进度: {processed_count} / {total_messages} (成功: {success_count}, 失败: {fail_count})", end="", flush=True)
            else:
                print(f"\r已处理: {processed_count} (成功: {success_count}, 失败: {fail_count})", end="", flush=True)

            try:
                # Format to RFC822 EML format
                eml_str = archive.format_message(message)
                msg = email.message_from_string(eml_str, policy=default)

                subject = msg.get("subject", "无主题")
                sender = msg.get("from", "未知发件人")

                if dry_run:
                    # Dry-run: just log and print metadata, no writes
                    logger.info("Dry-run: 扫描到邮件 '%s', 发件人: %s", subject, sender)
                    success_count += 1
                    continue

                # Extract plain text body
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("content-disposition", ""))
                        if content_type == "text/plain" and "attachment" not in content_disposition:
                            payload = part.get_payload(decode=True)
                            if payload:
                                body = payload.decode(errors="ignore")
                                break
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        body = payload.decode(errors="ignore")

                # Fallback to subject if body is empty
                if not body.strip():
                    body = subject

                # 4.1 Process attachments (paths safety check)
                attachments_processed = 0
                for part in msg.walk():
                    content_disposition = part.get("content-disposition")
                    if content_disposition:
                        dispositions = content_disposition.strip().split(";")
                        if any(
                            d.strip().lower().startswith("attachment")
                            for d in dispositions
                        ):
                            filename = part.get_filename()
                            if filename:
                                safe_filename = _sanitize_filename(filename)
                                target_path = (attachment_dir / safe_filename).resolve()

                                # PathGuard equivalent: absolute boundary check to prevent traversal
                                if not target_path.is_relative_to(case_dir):
                                    logger.warning(
                                        "检测到越界文件名，已拦截: %s", filename
                                    )
                                    continue

                                file_data = part.get_payload(decode=True)
                                if file_data:
                                    target_path.write_bytes(file_data)
                                    attachments_processed += 1

                # 4.2 Save CaseKnowledge (stores plain text in local DB)
                db = session_factory()
                try:
                    knowledge = CaseKnowledge(
                        case_id=case_id,
                        content=body,
                        source="email",
                    )
                    db.add(knowledge)
                    db.commit()

                    # 4.3 Save memory in Mem0 (remember() automatically desensitizes text)
                    try:
                        remember(case_id, body, db)
                    except Exception as mem_exc:
                        logger.warning(
                            "写入 Mem0 失败 (案件 %s): %s", case_id, mem_exc
                        )
                except Exception as db_exc:
                    db.rollback()
                    logger.error("邮件入库失败: %s", db_exc)
                    raise db_exc
                finally:
                    db.close()

                success_count += 1

            except Exception as exc:
                # Stream safety: single email failure shouldn't crash the script
                fail_count += 1
                logger.error("解析单封邮件失败: %s", exc)

    print()  # Newline after progress print
    logger.info(
        "PST 导入完成。总计: %d, 成功: %d, 失败: %d",
        processed_count, success_count, fail_count,
    )
    print(f"导入完成！成功: {success_count} 封, 失败: {fail_count} 封。")


if __name__ == "__main__":
    args = parse_args()
    try:
        process_pst(args.pst, args.case_id, args.dry_run)
    except Exception as e:
        logger.exception("PST 导入工具执行遇到未捕获异常")
        print(f"致命错误: {e}")
        sys.exit(1)
