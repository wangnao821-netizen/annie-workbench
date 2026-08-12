"""Case watcher — monitors whole case folders (recursive) for new files.

Uses ``watchdog`` for event-driven monitoring with a polling fallback
(every ``poll_interval_seconds``) to catch events missed by the OS
notification layer (common on NAS mounts).

v1.16.14（方案 B）：
    - 不再要求大家把文件放进 ``_Inbox``；改为监听数据库中每个已知案件的
      整个目录树（递归），同事按平常习惯把文件放到 Valuation/Settlement
      等任意子文件夹，AI 都能自动发现。
    - 本地邮件缓冲（EMAIL_BUFFER_ROOT/_Inbox、_PendingClassification）仍监听，
      但归入孤儿池，不参与案件解析。
    - 去重按 路径/指纹：历史导入已注册的文件（随机 uuid id）不会重复注册。
"""

from __future__ import annotations

import fnmatch
import hashlib
import os
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.config import ConfigLoader
from core.logger import get_logger
from core.security.path_guard import PathGuard
from core.pipeline.state import FileState
from core.models.orm import Case, CaseFile, FileEvent

logger = get_logger(__name__)

# Seconds between stability checks (is the file still being written?)
_STABILITY_RECHECK_INTERVAL = 0.5

class InboxWatcher:
    """Watches known case folders (recursive) + local email buffers.

    Args:
        config: Loaded project configuration.
        session_factory: Callable that returns a new SQLAlchemy Session.
        path_guard: Write-safety guard.
    """

    def __init__(
        self,
        config: ConfigLoader,
        session_factory: Any,
        path_guard: PathGuard,
    ) -> None:
        self._config = config
        self._session_factory = session_factory
        self._guard = path_guard
        self._poll_interval = config.settings.watch.poll_interval_seconds
        self._stable_seconds = config.settings.watch.file_stable_seconds
        self._ignore_patterns: list[str] = config.settings.watch.ignore_patterns
        self._template_cfg = config.settings.template_patterns
        # v1.16.13：全局邮件缓冲迁移到本地（EMAIL_BUFFER_ROOT / 数据目录，不再放 NAS 客户根目录）
        self._buffer_root = config.email_buffer_root
        self._observer: Any = None
        self._poll_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    @property
    def _client_root(self) -> Path:
        root = self._config.client_files_root
        if not root.exists():
            root.mkdir(parents=True, exist_ok=True)
        return root


    # ── Public API ────────────────────────────────────────────────

    def start(self) -> None:
        """Start watchdog observer."""
        try:
            from watchdog.events import FileSystemEventHandler
            from watchdog.observers import Observer

            handler = _InboxHandler(self)
            self._observer = Observer()
            # 确保全局缓冲目录存在（VBA 宏写入目标 / 未匹配文件池），不存在则创建后监听
            for _buf_dir in ("_Inbox", "_PendingClassification"):
                try:
                    (self._buffer_root / _buf_dir).mkdir(parents=True, exist_ok=True)
                except OSError as exc:
                    logger.warning("Failed to ensure global inbox dir %s: %s", _buf_dir, exc)
            watch_targets = self._find_watch_targets()
            for d, _case_id in watch_targets:
                self._observer.schedule(handler, str(d), recursive=True)
            self._observer.start()
            logger.info("Watchdog observer started for %d case folders", len(watch_targets))
        except ImportError:
            logger.warning("watchdog not installed — no-op observer")

        self._stop_event.clear()

    def stop(self) -> None:
        """Gracefully stop observer."""
        self._stop_event.set()
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=5)
        logger.info("InboxWatcher stopped")

    def discover_files(self) -> list[Path]:
        """递归扫描所有已知案件文件夹 + 本地缓冲，返回新发现的文件。

        去重：按 路径哈希ID / nas_path / 指纹 三重判断，历史导入已注册的
        文件（随机 uuid id）不会重复注册。邮件元数据路由到 inbox_service；
        本地缓冲文件归入孤儿池（不进入 pipeline）。
        """
        new_files: list[Path] = []
        session: Session = self._session_factory()
        try:
            for watch_dir, case_id in self._find_watch_targets():
                if not watch_dir.is_dir():
                    continue
                for root, dirnames, filenames in os.walk(watch_dir):
                    # 跳过隐藏/系统目录
                    dirnames[:] = [
                        d
                        for d in dirnames
                        if not d.startswith(".") and d not in ("__pycache__", ".git")
                    ]
                    for fname in filenames:
                        fpath = Path(root) / fname
                        # 邮件元数据 → inbox_service（含 VBA 缓冲子目录）
                        if fname == "metadata.json" or fname.endswith(".email_meta.json"):
                            self._process_email_meta(fpath)
                            continue
                        if self.should_ignore(fpath):
                            continue

                        from core.pipeline.email_parser import is_email_file

                        if is_email_file(fpath):
                            # .eml/.msg：真实案件注册为 InboxMessage；本地缓冲跳过（由 metadata 处理）
                            if case_id != "_PendingClassification":
                                self._register_email_file(session, fpath, case_id)
                            continue

                        if self._is_known_file(session, fpath):
                            continue
                        if self.is_template(fpath):
                            self._register_file(session, fpath, case_id, FileState.SKIPPED)
                            continue
                        self._register_file(session, fpath, case_id, FileState.DISCOVERED)
                        if case_id != "_PendingClassification":
                            new_files.append(fpath)
        finally:
            session.close()

        return new_files

    def _is_known_file(self, session: Session, path: Path) -> bool:
        """按 路径哈希ID / nas_path 判断文件是否已注册（防历史重复注册）。"""
        if session.get(CaseFile, self._make_file_id(path)) is not None:
            return True
        return (
            session.query(CaseFile)
            .filter(CaseFile.nas_path == str(path))
            .first()
            is not None
        )

    # ── Template / ignore checks ──────────────────────────────────

    def is_template(self, path: Path) -> bool:
        """Return ``True`` if *path* matches a template pattern."""
        name_lower = path.name.lower()
        # exact_filenames (case-insensitive)
        for exact in self._template_cfg.exact_filenames:
            if name_lower == exact.lower():
                return True
        # filename_keywords
        for kw in self._template_cfg.filename_keywords:
            if kw.lower() in name_lower:
                return True
        # path_keywords
        path_str_lower = str(path).lower()
        if any(kw.lower() in path_str_lower for kw in self._template_cfg.path_keywords):
            return True

        return False

    def should_ignore(self, path: Path) -> bool:
        """Return ``True`` if *path* matches an ignore pattern."""
        name = path.name
        for pattern in self._ignore_patterns:
            if fnmatch.fnmatch(name.lower(), pattern.lower()):
                return True
        return False

    def is_file_stable(self, path: Path) -> bool:
        """Return ``True`` if the file size hasn't changed recently."""
        try:
            size1 = path.stat().st_size
        except OSError:
            return False
        time.sleep(min(self._stable_seconds, _STABILITY_RECHECK_INTERVAL))
        try:
            size2 = path.stat().st_size
        except OSError:
            return False
        return size1 == size2

    # ── Internals ─────────────────────────────────────────────────

    def _find_watch_targets(self) -> list[tuple[Path, str]]:
        """返回要监听的目录列表：(绝对路径, case_id)。

        - 本地邮件缓冲（_Inbox / _PendingClassification）→ 孤儿池；
        - 数据库中每个已知案件的完整目录 → 递归监听，AI 跟随同事的放文件习惯。
        """
        targets: list[tuple[Path, str]] = []

        for buf_name in ("_Inbox", "_PendingClassification"):
            buf_dir = self._buffer_root / buf_name
            if buf_dir.is_dir():
                targets.append((buf_dir, "_PendingClassification"))

        session = self._session_factory()
        try:
            cases = session.query(Case.id, Case.folder_path).all()
        finally:
            session.close()

        root = Path(self._client_root)
        seen: set[str] = set()
        for case_id, folder_path in cases:
            if not folder_path:
                continue
            p = Path(folder_path)
            case_dir = p if p.is_absolute() else root / p
            try:
                case_dir = case_dir.resolve()
            except OSError:
                continue
            key = str(case_dir).lower()
            if key in seen:
                continue
            seen.add(key)
            if case_dir.is_dir():
                targets.append((case_dir, case_id))
        return targets

    @staticmethod
    def _make_file_id(path: Path) -> str:
        """Deterministic file ID from the absolute path."""
        return hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:16]

    def _calculate_md5(self, path: Path) -> str:
        """Calculate the MD5 checksum of a file to detect duplicates."""
        import hashlib
        try:
            hasher = hashlib.md5()
            with open(path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception:
            return ""

    def _register_file(
        self, session: Session, path: Path, case_id: str, state: FileState
    ) -> None:
        """Insert a file into DB and log the initial event."""
        file_md5 = self._calculate_md5(path)
        now = datetime.now(UTC)

        if file_md5:
            # 检查在当前 case 内是否已存在相同哈希的文件
            existing_dup = session.query(CaseFile).filter(
                CaseFile.case_id == case_id,
                CaseFile.file_hash == file_md5
            ).first()

            if existing_dup:
                old_path_str = existing_dup.nas_path.lower()
                new_path_str = str(path).lower()

                # 如果原有的文件在 "Don't send" 目录，而新文件处于 "Send to Lender" 或 "_Inbox"，则覆盖更新其物理路径，避免重复注册
                should_update = False
                if "don't send" in old_path_str or "dont send" in old_path_str:
                    if "send to lender" in new_path_str or "_inbox" in new_path_str:
                        should_update = True

                if should_update:
                    logger.info(
                        "MD5 duplicate found for case %s. Redirecting record to priority path: %s → %s",
                        case_id, existing_dup.nas_path, path
                    )
                    existing_dup.nas_path = str(path)
                    existing_dup.original_name = path.name
                    existing_dup.file_extension = path.suffix.lower()
                    existing_dup.updated_at = now
                    session.commit()
                else:
                    logger.info(
                        "Skipped duplicate file registration (MD5 match) for case %s: %s",
                        case_id, path
                    )
                return

        # 历史导入的文件 id 是随机 uuid，按 nas_path 再查一次，避免重复注册（方案 B）
        existing_by_path = (
            session.query(CaseFile).filter(CaseFile.nas_path == str(path)).first()
        )
        if existing_by_path is not None:
            existing_by_path.status = state.value
            existing_by_path.file_hash = file_md5 or existing_by_path.file_hash
            existing_by_path.updated_at = now
            session.commit()
            return

        file_id = self._make_file_id(path)
        try:
            size = path.stat().st_size
        except OSError:
            size = 0

        # Upsert processed_file via CaseFile ORM
        existing = session.get(CaseFile, file_id)
        if existing:
            existing.status = state.value
            existing.updated_at = now
            existing.file_hash = file_md5
        else:
            cf = CaseFile(
                id=file_id,
                case_id=case_id,
                nas_path=str(path),
                original_name=path.name,
                file_extension=path.suffix.lower(),
                file_size=size,
                status=state.value,
                created_at=now,
                updated_at=now,
                file_hash=file_md5,
            )
            session.add(cf)

        # Record immutable event
        from uuid import uuid4
        event = FileEvent(
            id=str(uuid4()),
            file_id=file_id,
            event_type=state.value,
            module="watcher",
            details=f"File: {path.name}",
            timestamp=now.isoformat(),
        )
        session.add(event)
        session.commit()
        logger.info("Registered %s → %s", path.name, state.value)

    def _process_email_meta(self, meta_path: Path) -> None:
        """Process a .email_meta.json file via inbox_service.

        Uses a separate SQLAlchemy session (not the raw Database)
        since inbox_service operates on SA models.

        Args:
            meta_path: Path to the .email_meta.json file.
        """
        try:
            from core.inbox.matching import process_email_meta
            from core.models.db import get_sa_session_direct

            session = get_sa_session_direct()
            try:
                process_email_meta(meta_path, session)
            finally:
                session.close()
        except Exception:
            logger.exception("Failed to process email meta: %s", meta_path.name)

    def _register_email_file(self, session: Session, path: Path, case_id: str) -> None:
        """Register an .eml/.msg file as an InboxMessage instead of a CaseFile.

        Parses the email using email_file_parser and writes to InboxMessage table.
        Also records a FileEvent for traceability.
        """
        try:
            if path.suffix.lower() == ".eml":
                parse_eml_file(path, case_id, session)
            elif path.suffix.lower() == ".msg":
                parse_msg_file(path, case_id, session)
        except Exception:
            logger.exception("Failed to register email file: %s", path.name)

    def _poll_loop(self) -> None:
        """Background thread: periodically call ``discover_files``."""
        while not self._stop_event.is_set():
            try:
                self.discover_files()
            except Exception:
                logger.exception("Error during polling scan")
            self._stop_event.wait(self._poll_interval)


# ── Watchdog handler ──────────────────────────────────────────────────

try:
    from watchdog.events import FileSystemEventHandler as _BaseHandler
except ImportError:
    _BaseHandler = object  # type: ignore[misc,assignment]


class _InboxHandler(_BaseHandler):  # type: ignore[valid-type]
    """Adapter between watchdog events and ``InboxWatcher``."""

    def __init__(self, watcher: InboxWatcher) -> None:
        super().__init__()
        self._watcher = watcher

    def on_created(self, event: Any) -> None:  # noqa: ANN401
        if event.is_directory:
            return
        path = Path(event.src_path)
        if self._watcher.should_ignore(path):
            return
        # Let the poll cycle handle registration (avoids race with partial writes).
        logger.debug("Watchdog detected: %s", path.name)

    # Satisfy the watchdog interface
    def dispatch(self, event: Any) -> None:  # noqa: ANN401
        if hasattr(event, "event_type") and event.event_type == "created":
            self.on_created(event)