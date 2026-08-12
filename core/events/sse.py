"""SSE 事件管理器（内存队列，单进程适用）。

- publish: 同步入口，任意线程可调用，把事件投递给所有订阅者。
- subscribe: 异步生成器，供 FastAPI StreamingResponse 消费。
- 不引入 Redis / 外部依赖；订阅者断开时自动清理。

用法::

    from core.events.sse import sse_manager
    sse_manager.publish("task_updated", {"task_id": 1})

    # FastAPI 端点
    @router.get("/stream")
    async def stream():
        return StreamingResponse(sse_manager.subscribe(), media_type="text/event-stream")
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncGenerator

_HEARTBEAT_INTERVAL = 15.0
_QUEUE_MAXSIZE = 100


class SseManager:
    """SSE 事件管理器（内存队列，单进程适用）。"""

    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()
        self._lock = threading.Lock()

    def publish(self, event_type: str, data: dict) -> None:
        """发布事件到所有订阅者。

        Args:
            event_type: 事件类型名（如 task_created / task_updated / case_updated）。
            data: 事件负载（JSON 序列化后随事件下发）。
        """
        message = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
        with self._lock:
            subscribers = list(self._subscribers)
        for loop, queue in subscribers:
            try:
                loop.call_soon_threadsafe(self._enqueue, queue, message)
            except RuntimeError:
                # 事件循环已关闭，忽略该订阅者
                continue

    @staticmethod
    def _enqueue(queue: asyncio.Queue, message: str) -> None:
        """把消息放进订阅队列（在事件循环线程内执行）。"""
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            # 消费过慢丢弃最旧的一条，保持队列不膨胀
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass

    async def subscribe(self) -> AsyncGenerator[str, None]:
        """订阅事件流（用于 SSE 端点）。

        首个值立即返回连接确认注释，之后循环输出事件；
        空闲超过 15 秒发送心跳注释保持连接。

        Yields:
            SSE 格式文本块（event/data 或注释行）。
        """
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
        with self._lock:
            self._subscribers.add((loop, queue))

        yield ": connected\n\n"
        try:
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=_HEARTBEAT_INTERVAL)
                    yield message
                except TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            with self._lock:
                self._subscribers.discard((loop, queue))


# 全局单例
sse_manager = SseManager()
