"""Vera Workbench — FastAPI 应用入口。"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ── 环境变量 ───────────────────────────────────────────
VERA_PORT = int(os.getenv("VERA_PORT", "8000"))
VERA_DATA_DIR = os.getenv("VERA_DATA_DIR", "")  # 空 = 默认 data/
APP_VERSION = "2.0.0"

# ── 后台调度（Phase 2 数据保命） ───────────────────────
@asynccontextmanager
async def _lifespan(app: FastAPI):
    """启动/停止 APScheduler（备份/委派超期/摘要刷新）。"""
    from core.scheduler.jobs import init_scheduler, shutdown_scheduler

    init_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


# ── FastAPI App ────────────────────────────────────────
app = FastAPI(
    title="Vera Workbench",
    version=APP_VERSION,
    docs_url="/api/docs",
    redoc_url=None,
    lifespan=_lifespan,
)

# ── CORS（Electron + dev server） ─────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 注册路由 ───────────────────────────────────────────
from server.api.admin import router as admin_router
from server.api.agents import router as agents_router
from server.api.analytics import router as analytics_router
from server.api.banks import router as banks_router
from server.api.calculator import router as calculator_router
from server.api.cases import router as cases_router
from server.api.chat import router as chat_router
from server.api.commission import router as commission_router
from server.api.drafts import router as drafts_router
from server.api.events import router as events_router
from server.api.files import router as files_router
from server.api.imports import router as imports_router
from server.api.inbox import router as inbox_router
from server.api.sync import router as sync_router
from server.api.tasks import router as tasks_router
from server.api.wechat import router as wechat_router

app.include_router(admin_router)
app.include_router(agents_router)
app.include_router(cases_router)
app.include_router(banks_router)
app.include_router(analytics_router)
app.include_router(commission_router)
app.include_router(calculator_router)
app.include_router(tasks_router)
app.include_router(files_router)
app.include_router(inbox_router)
app.include_router(imports_router)
app.include_router(chat_router)
app.include_router(drafts_router)
app.include_router(wechat_router)
app.include_router(sync_router)
app.include_router(events_router)

# ── 静态文件（生产模式：serve frontend/dist） ──────────
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="spa")


# ── 启动入口 ──────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host="0.0.0.0", port=VERA_PORT, reload=True)
