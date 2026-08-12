"""SSE 实时推送端点 — 转发 SseManager 的实时事件。"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from core.events.sse import sse_manager

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/stream")
async def event_stream():
    """SSE 实时推送：订阅 sse_manager，事件实时转发给前端。

    任务动作（create_task / dispatch / delegate / check_overdue / boss_reply）
    触发时由 core.task_engine 调 sse_manager.publish() 发布事件。
    """
    return StreamingResponse(
        sse_manager.subscribe(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
