"""Centralized logging configuration for loan-assistant.

All modules should use get_logger() from this module instead of print().
This ensures consistent log formatting and centralized control.

Log levels:
    - DEBUG: Detailed diagnostic information
    - INFO: General operation flow
    - WARNING: Unexpected but non-critical situations
      (e.g., missing API key in development mode)
    - ERROR: Serious failures (e.g., config validation error)
    - CRITICAL: Safety violations requiring immediate attention
      (e.g., PII leak detected before cloud API call)

File logging:
    After loading configuration, call setup_file_logging() once to add
    a RotatingFileHandler that writes to logs/app.log with rotation
    (max_size_mb from settings.yaml, backup_count backups).

Audit logging:
    Security violations (PII leaks, path guard denials) are written to
    a separate file logs/audit.log via get_audit_logger(). The audit
    logger does not propagate to the root logger, keeping security
    events isolated from general application logs.
"""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

_DEFAULT_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_DEFAULT_DATEFMT = "%Y-%m-%d %H:%M:%S"
_LOGGER_NAME = "loan_assistant"
_AUDIT_LOGGER_NAME = "loan_assistant.audit"

# Track whether file logging has been configured (prevents duplicate handlers).
_file_logging_configured = False


def get_logger(name: str = _LOGGER_NAME) -> logging.Logger:
    """Get a configured logger instance.

    Returns a logger with a stderr StreamHandler and standard formatting.
    If setup_file_logging() has been called, the logger also has a
    RotatingFileHandler writing to logs/app.log.

    Subsequent calls with the same name return the same logger instance
    (Python logging module caches loggers by name).

    Args:
        name: Logger name, defaults to the project-level logger.

    Returns:
        A configured ``logging.Logger`` instance.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter(_DEFAULT_FORMAT, datefmt=_DEFAULT_DATEFMT)
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


def setup_file_logging(
    log_file: str | Path,
    max_size_mb: int,
    backup_count: int,
    level: str = "INFO",
) -> None:
    """Configure file logging with rotation.

    Called once at application startup after configuration is loaded.
    Adds a RotatingFileHandler to the root ``loan_assistant`` logger.
    Also sets up the audit logger with a separate file.

    Args:
        log_file: Path to the main log file (e.g., ``logs/app.log``).
            Parent directories are created if they don't exist.
        max_size_mb: Maximum file size in megabytes before rotation.
        backup_count: Number of backup files to retain after rotation.
        level: Log level string (e.g., ``"INFO"``, ``"DEBUG"``).

    Note:
        This function is idempotent — calling it multiple times has no
        additional effect after the first successful call.
    """
    global _file_logging_configured
    if _file_logging_configured:
        return

    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # 审计修复 v1.16.6：必须挂到真正的根 logger（""），
    # 才能收到 server.* / shared.* / modules.* 等全部子 logger 的记录；
    # 此前挂在 "loan_assistant" 上，应用日志一条都写不进 app.log。
    root_logger = logging.getLogger()

    max_bytes = max_size_mb * 1024 * 1024  # Convert MB to bytes
    formatter = logging.Formatter(_DEFAULT_FORMAT, datefmt=_DEFAULT_DATEFMT)

    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # Set log level.
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Set up audit logger — separate file, CRITICAL level only.
    audit_path = log_path.parent / "audit.log"
    audit_logger = logging.getLogger(_AUDIT_LOGGER_NAME)
    has_rotating = any(
        isinstance(h, RotatingFileHandler) for h in audit_logger.handlers
    )
    if not has_rotating:
        audit_handler = RotatingFileHandler(
            audit_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        audit_handler.setFormatter(formatter)
        audit_handler.setLevel(logging.CRITICAL)
        audit_logger.addHandler(audit_handler)
        audit_logger.setLevel(logging.CRITICAL)
        # Prevent audit logs from propagating to root (avoid duplicates in app.log).
        audit_logger.propagate = False

    _file_logging_configured = True


def get_audit_logger(name: str = _AUDIT_LOGGER_NAME) -> logging.Logger:
    """Get the audit logger for security violation events.

    Audit logs are written to ``logs/audit.log`` separately from the
    main application log. Only CRITICAL-level events are recorded
    (e.g., PII leak detected, PathGuard violation).

    If setup_file_logging() has not been called yet, a fallback
    StreamHandler is added so audit messages still appear on stderr.

    Args:
        name: Logger name, defaults to the audit logger.

    Returns:
        A configured ``logging.Logger`` instance for audit events.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        # Fallback: stderr handler if file logging not yet configured.
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter(_DEFAULT_FORMAT, datefmt=_DEFAULT_DATEFMT)
        handler.setFormatter(formatter)
        handler.setLevel(logging.CRITICAL)
        logger.addHandler(handler)
        logger.setLevel(logging.CRITICAL)
        logger.propagate = False
    return logger


def reset_logging() -> None:
    """Reset all logging configuration to defaults.

    Primarily for testing: clears all handlers and resets the
    ``_file_logging_configured`` flag so ``setup_file_logging()``
    can be called again.
    """
    global _file_logging_configured
    root = logging.getLogger(_LOGGER_NAME)
    for handler in list(root.handlers):
        root.removeHandler(handler)
        handler.close()

    # 审计修复 v1.16.6：文件 handler 挂在真正的根 logger 上，重置时一并清理
    real_root = logging.getLogger()
    for handler in list(real_root.handlers):
        if isinstance(handler, logging.handlers.RotatingFileHandler):
            real_root.removeHandler(handler)
            handler.close()

    audit = logging.getLogger(_AUDIT_LOGGER_NAME)
    for handler in list(audit.handlers):
        audit.removeHandler(handler)
        handler.close()

    _file_logging_configured = False
