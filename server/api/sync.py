"""云端同步端点。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from server.deps import get_db

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/push")
def push_to_cloud(db: Session = Depends(get_db)):  # noqa: B008
    """手动触发云端同步。"""
    # TODO(WO-06): from core.sync.cloud_push import push_all_cases
    raise NotImplementedError("Pending WO-06")


@router.get("/status")
def sync_status():
    """获取同步状态。"""
    # TODO(WO-06): from core.sync.checkpoint import SyncCheckpoint
    raise NotImplementedError("Pending WO-06")
