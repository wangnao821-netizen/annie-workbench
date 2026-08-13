"""core/case_engine/folder.py — 案件文件夹关联逻辑（WO-29）。

提供 link_existing 与 auto_create，负责路径安全校验、目录创建、数据库 Case.folder_path 写入。
红线：不写客户文件夹内容（只读校验 + 记录路径）；路径穿越/越界拒绝。
"""

from __future__ import annotations

import os
from pathlib import Path

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


def validate_path_safety(path: str | Path, client_root: str | Path) -> Path:
    """校验路径安全性：必须位于 client_root 下，拒绝 `..` 穿越。

    Returns:
        解析后的目标 Path 实例。

    Raises:
        ValueError: 路径穿越或越界。
    """
    raw_path_obj = Path(path)
    if ".." in raw_path_obj.parts:
        raise ValueError(f"路径穿越拒绝：'{path}' 包含 '..' 字符")

    root = Path(client_root).resolve()
    target = raw_path_obj
    if not target.is_absolute():
        target = root / target

    if ".." in target.parts:
        raise ValueError(f"路径穿越拒绝：'{path}' 包含 '..' 字符")

    try:
        resolved = target.resolve()
    except (OSError, RuntimeError) as e:
        raise ValueError(f"无法解析路径 '{path}': {e}") from e

    try:
        resolved.relative_to(root)
    except ValueError:
        raise ValueError(
            f"路径越界拒绝：'{path}' 不位于 CLIENT_FILES_ROOT ({root}) 下"
        ) from None

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

    root = Path(client_root).resolve() if client_root else _get_default_client_root()
    resolved_target = validate_path_safety(path, root)

    if not resolved_target.is_dir():
        raise ValueError(f"目标目录不存在：{path}")

    rel_path_str = resolved_target.relative_to(root).as_posix()

    # 幂等处理：若已关联相同路径，直接返回
    existing_folder = (case.folder_path or "").replace("\\", "/")
    if existing_folder and (
        existing_folder == rel_path_str
        or existing_folder == Path(path).as_posix()
        or existing_folder == resolved_target.as_posix()
    ):
        return case

    case.folder_path = rel_path_str
    db.commit()
    db.refresh(case)
    return case


def auto_create(
    db: Session,
    case_id: str,
    naming: str | None = None,
    client_root: str | Path | None = None,
) -> Case:
    """自动创建案件文件夹及标准子目录并关联。

    Args:
        db: SQLAlchemy 数据库 Session.
        case_id: 案件 ID.
        naming: 目录命名或相对路径（可选）.
        client_root: CLIENT_FILES_ROOT 根路径（可选）.

    Returns:
        更新后的 Case ORM 实例.

    Raises:
        ValueError: 案件不存在或路径越界.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"案件 {case_id} 不存在")

    root = Path(client_root).resolve() if client_root else _get_default_client_root()

    if naming and naming.strip():
        rel_dir = naming.strip()
    else:
        broker = case.broker_name or "Brandon"
        client = case.client_name or "Client"
        rel_dir = f"{broker}/{client}/{case_id}"

    resolved_target = validate_path_safety(rel_dir, root)
    rel_path_str = resolved_target.relative_to(root).as_posix()

    existing_folder = (case.folder_path or "").replace("\\", "/")
    # 幂等处理：如果 folder_path 匹配且目录已存在
    if existing_folder == rel_path_str and resolved_target.is_dir():
        return case

    # 冲突检测：如果目录已被占用（且不属于该案件当前的 folder_path），自动追加唯一后缀 _1, _2
    if resolved_target.exists():
        parent = resolved_target.parent
        base_name = resolved_target.name
        counter = 1
        new_target = parent / f"{base_name}_{counter}"
        while new_target.exists():
            counter += 1
            new_target = parent / f"{base_name}_{counter}"
        resolved_target = new_target
        rel_path_str = resolved_target.relative_to(root).as_posix()

    # 创建案件主目录与标准子目录（非法字符/保留名/权限 → OSError → ValueError → 422）
    try:
        resolved_target.mkdir(parents=True, exist_ok=True)
        for subdir in STANDARD_SUBDIRS:
            (resolved_target / subdir).mkdir(exist_ok=True)
    except OSError as exc:
        raise ValueError(f"无法创建案件文件夹（路径含非法字符或权限不足）：{exc}") from exc

    case.folder_path = rel_path_str
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