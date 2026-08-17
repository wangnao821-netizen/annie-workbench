"""文件夹辅助端点（WO-34，Electron 兼容）— 命名解析（预填）。

browse（目录浏览）延后到 WO-05 与 Electron 原生选择器一起做（见施工单 TODO）。
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from core.case_engine.folder import (
    parse_folder_naming,
    validate_path_safety,
)
from server.api.schemas import (
    FolderBrowseItem,
    FolderBrowseResponse,
    FolderParseResponse,
)

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("/parse", response_model=FolderParseResponse)
def parse_folder(path: str = Query(...)) -> FolderParseResponse:
    """解析文件夹命名为预填字段（broker/client/case-id；末段清理兜底）。

    穿越 → 422；纯命名解析，不要求目录存在（2026-08-17 无总根，不做路径安全校验）。
    """
    raw = str(path)
    if ".." in Path(raw).parts:
        raise HTTPException(status_code=422, detail="路径穿越拒绝")
    return FolderParseResponse(**parse_folder_naming(raw))

@router.get("/browse", response_model=FolderBrowseResponse)
def browse_folders(path: str = Query("")) -> FolderBrowseResponse:
    """浏览指定目录的直接子目录（2026-08-17 无总根：任意绝对路径，禁穿越/系统目录；Web 过渡）。"""
    raw = str(path or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="请指定要浏览的目录（绝对路径）")
    if ".." in Path(raw).parts:
        raise HTTPException(status_code=422, detail="路径穿越拒绝")
    try:
        target = validate_path_safety(raw, None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not target.is_dir():
        raise HTTPException(status_code=422, detail=f"目录不存在：{raw}")
    items: list[FolderBrowseItem] = []
    for child in sorted(target.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        items.append(FolderBrowseItem(
            path=child.as_posix(),
            name=child.name,
            is_dir=True,
            mtime=datetime.fromtimestamp(child.stat().st_mtime, tz=UTC).isoformat(),
        ))
    return FolderBrowseResponse(current_path=target.as_posix(), items=items)
