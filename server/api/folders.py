"""文件夹辅助端点（WO-34，Electron 兼容）— 命名解析（预填）。

browse（目录浏览）延后到 WO-05 与 Electron 原生选择器一起做（见施工单 TODO）。
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from core.case_engine.folder import (
    _get_default_client_root,
    parse_folder_naming,
    validate_path_safety,
)
from server.api.schemas import FolderParseResponse

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("/parse", response_model=FolderParseResponse)
def parse_folder(path: str = Query(...)) -> FolderParseResponse:
    """解析文件夹命名为预填字段（broker/client/case-id；末段清理兜底）。

    越界/穿越 → 422；纯命名解析，不要求目录存在。
    """
    raw = str(path)
    if ".." in Path(raw).parts:
        raise HTTPException(status_code=422, detail="路径穿越拒绝")
    try:
        validate_path_safety(raw, _get_default_client_root())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return FolderParseResponse(**parse_folder_naming(raw))