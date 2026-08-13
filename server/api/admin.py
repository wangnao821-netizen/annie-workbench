"""管理端点：版本/健康检查/设置。"""

import os

from fastapi import APIRouter

from core.config import get_config
from server.api.schemas import VersionInfo

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/version", response_model=VersionInfo)
def get_version() -> VersionInfo:
    """返回应用版本号。"""
    return VersionInfo(version="2.1.0", name="Vera Workbench")


@router.get("/health")
def health_check() -> dict:
    """健康检查（含配置状态：config_ok / missing_config）。

    前端可据此区分「后端未启动」与「环境配置缺失」。
    """
    missing: list[str] = []
    if not os.getenv("CLIENT_FILES_ROOT"):
        missing.append("CLIENT_FILES_ROOT")
    try:
        get_config()
    except BaseException:  # noqa: BLE001 — 配置校验失败仅上报，不让健康探针崩溃
        if "settings.yaml 校验失败" not in missing:
            missing.append("settings.yaml 校验失败")
    return {"status": "ok", "config_ok": not missing, "missing_config": missing}
