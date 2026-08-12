"""微信通道端点。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from server.deps import get_db

router = APIRouter(prefix="/api/wechat", tags=["wechat"])


@router.post("/message")
def receive_wechat_message(
    sender: str,
    content: str,
    db: Session = Depends(get_db),  # noqa: B008
):
    """接收微信消息。"""
    # TODO(WO-11): from core.wechat.handler import handle_wechat_message
    raise NotImplementedError("Pending WO-11")


@router.get("/morning-report")
def get_morning_report(db: Session = Depends(get_db)):  # noqa: B008
    """获取今日早报。"""
    # TODO(WO-11): from core.wechat.morning_report import generate_morning_report
    raise NotImplementedError("Pending WO-11")
