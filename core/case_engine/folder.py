"""core/case_engine/folder.py — 案件文件夹关联逻辑（WO-29）。

提供 link_existing 与 auto_create，负责路径安全校验、目录创建、数据库 Case.folder_path 写入。
红线：不写客户文件夹内容（只读校验 + 记录路径）；路径穿越/越界拒绝。
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case

logger = get_logger(__name__)

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

# 绝对路径关联时禁止的系统关键目录（Vera 手动选文件夹也拦一道）
_FORBIDDEN_ROOTS = (
    "C:/Windows",
    "C:/Program Files",
    "C:/Program Files (x86)",
    "C:/ProgramData",
)


def _get_default_client_root() -> Path:
    """获取默认 CLIENT_FILES_ROOT 路径（动态读取环境变量/配置）。"""
    root_str = os.getenv("CLIENT_FILES_ROOT", "")
    if root_str:
        return Path(root_str).resolve()
    try:
        from core.config import get_config
        return get_config().client_files_root.resolve()
    except Exception:  # noqa: BLE001 — 获取配置异常降级为当前目录
        return Path.cwd().resolve()


def validate_path_safety(path: str | Path, client_root: str | Path | None) -> Path:
    """校验路径安全性：拒绝 `..` 穿越与系统关键目录；client_root 提供时必须在根内。

    2026-08-17 拍板：案件文件夹 = Vera 手动选择的任意绝对路径（无总根模式）；
    client_root 仅保留向后兼容（测试/旧调用），不再作为强制边界。

    Returns:
        解析后的目标 Path 实例。

    Raises:
        ValueError: 路径穿越、越界、或指向系统关键目录。
    """
    raw_path_obj = Path(path)
    if ".." in raw_path_obj.parts:
        raise ValueError(f"路径穿越拒绝：'{path}' 包含 '..' 字符")

    if client_root is not None:
        root = Path(client_root).resolve()
        target = raw_path_obj
        if not target.is_absolute():
            target = root / target
        if ".." in target.parts:
            raise ValueError(f"路径穿越拒绝：'{path}' 包含 '..' 字符")
    else:
        target = raw_path_obj
        if not target.is_absolute():
            raise ValueError(f"路径必须是绝对路径（无总根模式）：{path}")

    try:
        resolved = target.resolve()
    except (OSError, RuntimeError) as e:
        raise ValueError(f"无法解析路径 '{path}': {e}") from e

    if client_root is not None:
        try:
            resolved.relative_to(root)
        except ValueError:
            raise ValueError(
                f"路径越界拒绝：'{path}' 不位于 CLIENT_FILES_ROOT ({root}) 下"
            ) from None
    else:
        for forbidden in _FORBIDDEN_ROOTS:
            try:
                resolved.relative_to(Path(forbidden))
            except ValueError:
                continue
            raise ValueError(f"路径被拒绝：不允许关联系统目录 {forbidden}")

    return resolved


def link_existing(
    db: Session,
    case_id: str,
    path: str,
    client_root: str | Path | None = None,
) -> Case:
    """关联已有案件文件夹（只读校验 + 记录路径）。

    Args:
        db: SQLAlchemy 数据库 Session.
        case_id: 案件 ID.
        path: 关联目标路径（相对 client_root 或绝对路径）.
        client_root: CLIENT_FILES_ROOT 根路径（可选）.

    Returns:
        更新后的 Case ORM 实例.

    Raises:
        ValueError: 案件不存在、路径穿越/越界、目标目录不存在.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"案件 {case_id} 不存在")

    if not path or not path.strip():
        raise ValueError("关联路径不能为空")

    resolved_target = validate_path_safety(path, client_root)

    if not resolved_target.is_dir():
        raise ValueError(f"目标目录不存在：{path}")

    abs_path_str = resolved_target.as_posix()

    # 幂等处理：若已关联相同路径，直接返回
    existing_folder = (case.folder_path or "").replace("\\", "/")
    if existing_folder and (
        existing_folder == abs_path_str
        or existing_folder == Path(path).as_posix()
        or existing_folder == resolved_target.as_posix()
    ):
        return case

    case.folder_path = abs_path_str
    db.commit()
    db.refresh(case)
    return case


def auto_create(
    db: Session,
    case_id: str,
    parent_dir: str,
    folder_name: str | None = None,
    client_root: str | Path | None = None,
) -> Case:
    """在 Vera 手动指定的父目录下创建案件文件夹及标准子目录并关联。

    Args:
        db: SQLAlchemy 数据库 Session.
        case_id: 案件 ID.
        parent_dir: Vera 选择的父目录（任意绝对路径）。
        folder_name: 案件文件夹名（缺省按"客户名_case_id"生成）。
        client_root: 兼容旧调用（可选；不再强制总根）。

    Returns:
        更新后的 Case ORM 实例.

    Raises:
        ValueError: 案件不存在、路径越界、父目录不存在或目录名非法.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"案件 {case_id} 不存在")

    parent = validate_path_safety(parent_dir, client_root)
    if not parent.is_dir():
        raise ValueError(f"父目录不存在：{parent_dir}")

    if folder_name and folder_name.strip():
        name = folder_name.strip()
        if "/" in name or "\\" in name or ".." in name or name.startswith("."):
            raise ValueError("文件夹名非法：不能含路径分隔符、'..' 或以 '.' 开头")
    else:
        client = case.client_name or "Client"
        name = f"{client}_{case_id}"

    resolved_target = parent / name
    existing_folder = (case.folder_path or "").replace("\\", "/")
    # 幂等处理：如果 folder_path 匹配且目录已存在
    if existing_folder == resolved_target.as_posix() and resolved_target.is_dir():
        return case

    # 冲突检测：同名已存在 → 自动追加唯一后缀 _1, _2
    if resolved_target.exists():
        base_name = resolved_target.name
        counter = 1
        new_target = parent / f"{base_name}_{counter}"
        while new_target.exists():
            counter += 1
            new_target = parent / f"{base_name}_{counter}"
        resolved_target = new_target

    # 创建案件主目录与标准子目录（非法字符/保留名/权限 → OSError → ValueError → 422）
    try:
        resolved_target.mkdir(parents=True, exist_ok=True)
        for subdir in STANDARD_SUBDIRS:
            (resolved_target / subdir).mkdir(exist_ok=True)
    except OSError as exc:
        raise ValueError(f"无法创建案件文件夹（路径含非法字符或权限不足）：{exc}") from exc

    case.folder_path = resolved_target.as_posix()
    db.commit()
    db.refresh(case)
    return case


def _clean_client_name(name: str) -> str:
    """清理客户名：去下划线/连字符/多余空格/数字尾巴。"""
    import re
    cleaned = re.sub(r"[\s_\-]+", " ", name).strip()
    return re.sub(r"\d+$", "", cleaned).strip()


def parse_folder_naming(path: str | Path) -> dict[str, str]:
    """解析文件夹命名为预填字段（Electron/Web 共用；纯命名解析，不查文件系统）。

    优先按三段结构 broker/client/case-id；不足三段取末段清理兜底为 client_name。
    绝对/相对路径均可（取最后三段，天然忽略盘符/根前缀）。
    """
    raw = str(path).replace("\\", "/").strip().strip("/")
    parts = [p for p in raw.split("/") if p]
    if not parts:
        return {}
    if len(parts) >= 3:
        return {
            "broker_name": parts[-3],
            "client_name": _clean_client_name(parts[-2]),
            "case_id": parts[-1],
        }
    return {"client_name": _clean_client_name(parts[-1])}


# ── WO-56 全新空白建案：标准 11 目录脚手架 ─────────────────────────────

STANDARD_CASE_SUBDIRS = (
    "Send to Lender",
    "Approval",
    "Valuation",
    "To be signed",
    "Supporting Documents",
    "Application Summary",
    "Bank Statements",
    "Identification",
    "Income & Employment",
    "Liabilities",
    "Communications",
)


def scaffold_case_directories(
    parent_path: str,
    client_name: str,
    case_name: str | None = None,
    create_subdirs: bool = True,
) -> dict[str, Any]:
    """在指定的父目录下生成规范的客户与案件文件夹，并按需创建标准 11 子目录。

    目录规则：
    1. 客户根目录: {parent_path}/{client_name}
    2. 案卷目录: {parent_path}/{client_name}/{case_name or '1. Initial Submission'}
    3. 在案卷目录下创建 STANDARD_CASE_SUBDIRS 所有子文件夹；
    4. 返回 {"ok": True, "client_folder": str, "case_folder": str, "created_subdirs": list[str]}。
    """
    parent = Path(parent_path)
    client_folder = parent / client_name
    case_folder = client_folder / (case_name or "1. Initial Submission")

    client_folder.mkdir(parents=True, exist_ok=True)
    case_folder.mkdir(parents=True, exist_ok=True)

    created_subdirs: list[str] = []
    if create_subdirs:
        for subdir in STANDARD_CASE_SUBDIRS:
            (case_folder / subdir).mkdir(exist_ok=True)
            created_subdirs.append(subdir)

    return {
        "ok": True,
        "client_folder": str(client_folder),
        "case_folder": str(case_folder),
        "created_subdirs": created_subdirs,
    }
