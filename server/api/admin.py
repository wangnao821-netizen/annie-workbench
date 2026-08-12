"""管理端点：版本/健康检查/设置。"""

from fastapi import APIRouter

from server.api.schemas import VersionInfo

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/version", response_model=VersionInfo)
def get_version() -> VersionInfo:
    """返回应用版本号。"""
    return VersionInfo(version="2.0.0", name="Vera Workbench")


@router.get("/health")
def health_check() -> dict:
    """健康检查。"""
    return {"status": "ok"}
