# 施工单 03：后端 API 路由层

> 执行者：DeepSeek  
> 依赖：WO-01+02 完成（vera-workbench/core/ 44/44 import 验证通过）  
> 预估：2.5 天

---

## 技术约束

- 后端：Python 3.11+ / FastAPI
- 新依赖：`uvicorn[standard]`（已在 pyproject.toml）
- 禁止：修改 `core/` 下的任何文件（只调用）
- 禁止：创建本计划未列出的文件
- API 前缀：所有路由统一 `/api/` 前缀
- 响应格式：Pydantic v2 BaseModel
- Python 文件行数 ≤ 200（超出则拆分）
- 项目根目录：`d:\vera-workbench\`
- PYTHONPATH：`d:\vera-workbench`

---

## 目标

在 `server/api/` 下创建精简的路由层，调用 `core/` 中的业务逻辑。路由层只做"胶水"：接收请求 → 校验参数 → 调用 core 函数 → 返回结果。

---

## 改动范围（完整文件清单）

| 文件 | 操作 | 行数上限 | 说明 |
|------|------|---------|------|
| `server/__init__.py` | 新建 | 1 | 空 |
| `server/main.py` | 新建 | 120 | FastAPI app 入口 |
| `server/deps.py` | 新建 | 60 | DB session + config 依赖注入 |
| `server/api/__init__.py` | 新建 | 1 | 空 |
| `server/api/schemas.py` | 新建 | 200 | 全部 Pydantic 响应/请求模型 |
| `server/api/cases.py` | 新建 | 180 | 案件 CRUD + 生命周期 |
| `server/api/tasks.py` | 新建 | 200 | V5 任务队列（核心端点） |
| `server/api/files.py` | 新建 | 160 | 文件操作 + 清单 |
| `server/api/inbox.py` | 新建 | 140 | 收件箱处理 |
| `server/api/chat.py` | 新建 | 100 | AI 对话 |
| `server/api/drafts.py` | 新建 | 120 | 草稿管理 |
| `server/api/admin.py` | 新建 | 80 | 设置/版本/诊断 |
| `server/api/wechat.py` | 新建 | 80 | 微信通道端点 |
| `server/api/sync.py` | 新建 | 60 | 云端同步端点 |
| `server/api/events.py` | 新建 | 80 | SSE 实时推送端点 |

---

## Step 1：创建目录结构

```bash
cd d:\vera-workbench
mkdir -p server/api
touch server/__init__.py server/api/__init__.py
```

---

## Step 2：`server/deps.py`

```python
"""FastAPI 依赖注入 — 提供 DB session 和配置。"""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy.orm import Session

from core.models.db import get_session
from core.config import get_config, get_project_root, ConfigLoader


def get_db() -> Generator[Session, None, None]:
    """Yield a DB session for FastAPI Depends()."""
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def get_settings() -> ConfigLoader:
    """获取全局配置单例。"""
    return get_config()


def get_root() -> Path:
    """获取项目根目录。"""
    return get_project_root()
```

---

## Step 3：`server/main.py`

```python
"""Vera Workbench — FastAPI 应用入口。"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ── 环境变量 ───────────────────────────────────────────
VERA_PORT = int(os.getenv("VERA_PORT", "8000"))
VERA_DATA_DIR = os.getenv("VERA_DATA_DIR", "")  # 空 = 默认 data/
APP_VERSION = "2.0.0"

# ── FastAPI App ────────────────────────────────────────
app = FastAPI(
    title="Vera Workbench",
    version=APP_VERSION,
    docs_url="/api/docs",
    redoc_url=None,
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
from server.api.cases import router as cases_router
from server.api.tasks import router as tasks_router
from server.api.files import router as files_router
from server.api.inbox import router as inbox_router
from server.api.chat import router as chat_router
from server.api.drafts import router as drafts_router
from server.api.wechat import router as wechat_router
from server.api.sync import router as sync_router
from server.api.events import router as events_router

app.include_router(admin_router)
app.include_router(cases_router)
app.include_router(tasks_router)
app.include_router(files_router)
app.include_router(inbox_router)
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
```

---

## Step 4：`server/api/admin.py`

```python
"""管理端点：版本/健康检查/设置。"""

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/version")
def get_version():
    """返回应用版本号。"""
    return {"version": "2.0.0", "name": "Vera Workbench"}


@router.get("/health")
def health_check():
    """健康检查。"""
    return {"status": "ok"}
```

---

## Step 5：`server/api/tasks.py`（V5 核心）

必须包含以下端点：

```python
"""V5 任务引擎路由。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from server.deps import get_db

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/")
def list_tasks(
    filter: str = "today",
    db: Session = Depends(get_db),
):
    """获取任务列表。filter: today|urgent|all|delegated"""
    # TODO(WO-08): from core.task_engine.dispatcher import list_tasks
    raise NotImplementedError("Pending WO-08")


@router.post("/{task_id}/dispatch")
def dispatch_task(
    task_id: int,
    action: str,
    db: Session = Depends(get_db),
):
    """派单三键：approve / reject / defer"""
    # TODO(WO-08): from core.task_engine.dispatcher import dispatch_task
    raise NotImplementedError("Pending WO-08")


@router.post("/{task_id}/delegate")
def delegate_task(
    task_id: int,
    delegate_to: str,
    deadline: str | None = None,
    db: Session = Depends(get_db),
):
    """委派给同事。"""
    # TODO(WO-08): from core.task_engine.delegation import delegate_to
    raise NotImplementedError("Pending WO-08")


@router.post("/{task_id}/boss-reply")
def boss_reply(
    task_id: int,
    decision: str,
    note: str = "",
    db: Session = Depends(get_db),
):
    """老板决策回复。"""
    # TODO(WO-08): from core.task_engine.boss_decision import record_boss_reply
    raise NotImplementedError("Pending WO-08")
```

---

## Step 6：`server/api/cases.py`

必须包含：
- `GET /api/cases/` — 案件列表（支持 stage 筛选）
- `GET /api/cases/{case_id}` — 案件详情
- `POST /api/cases/` — 创建案件
- `GET /api/cases/{case_id}/submission-check` — 递交自查
- `POST /api/cases/{case_id}/stage-advance` — 阶段推进
- `GET /api/cases/{case_id}/timeline` — 时间线

---

## Step 7：`server/api/files.py`

必须包含：
- `GET /api/cases/{case_id}/files` — 文件列表
- `POST /api/cases/{case_id}/files/upload` — 上传文件
- `GET /api/cases/{case_id}/checklist` — 清单状态
- `POST /api/cases/{case_id}/checklist/{item_id}/confirm` — 确认清单项
- `POST /api/cases/{case_id}/checklist/{item_id}/revoke` — 撤销确认
- `GET /api/files/{file_id}/preview` — 文件预览

---

## Step 8：`server/api/inbox.py`

必须包含：
- `GET /api/inbox/` — 收件箱列表
- `POST /api/inbox/{msg_id}/analyze` — AI 分析邮件
- `POST /api/inbox/{msg_id}/mute` — 静音发件人

---

## Step 9：`server/api/chat.py`

必须包含：
- `POST /api/chat/` — 发送消息给 AI
- `GET /api/chat/{case_id}/history` — 对话历史

---

## Step 10：`server/api/drafts.py`

必须包含：
- `GET /api/drafts/{action_id}` — 获取草稿
- `POST /api/drafts/{action_id}/refine` — AI 修正
- `POST /api/drafts/{action_id}/confirm` — 确认发送
- `GET /api/drafts/{action_id}/versions` — 版本历史
- `POST /api/drafts/{action_id}/rollback` — 回退版本

---

## Step 11：`server/api/events.py`

```python
"""SSE 实时推送端点。"""

import asyncio
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/stream")
async def event_stream():
    """SSE 实时推送。"""
    async def generate():
        while True:
            yield 'data: {"type": "heartbeat"}\n\n'
            await asyncio.sleep(15)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
```

---

## Step 12：`server/api/wechat.py` + `server/api/sync.py`

```python
# wechat.py
"""微信通道端点。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from server.deps import get_db

router = APIRouter(prefix="/api/wechat", tags=["wechat"])

@router.post("/message")
def receive_wechat_message(sender: str, content: str, db: Session = Depends(get_db)):
    """接收微信消息。"""
    # TODO(WO-11): from core.wechat.handler import handle_wechat_message
    raise NotImplementedError("Pending WO-11")

@router.get("/morning-report")
def get_morning_report(db: Session = Depends(get_db)):
    """获取今日早报。"""
    # TODO(WO-11): from core.wechat.morning_report import generate_morning_report
    raise NotImplementedError("Pending WO-11")
```

```python
# sync.py
"""云端同步端点。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from server.deps import get_db

router = APIRouter(prefix="/api/sync", tags=["sync"])

@router.post("/push")
def push_to_cloud(db: Session = Depends(get_db)):
    """手动触发云端同步。"""
    # TODO(WO-06): from core.sync.cloud_push import push_all_cases
    raise NotImplementedError("Pending WO-06")

@router.get("/status")
def sync_status():
    """获取同步状态。"""
    # TODO(WO-06): from core.sync.checkpoint import SyncCheckpoint
    raise NotImplementedError("Pending WO-06")
```

---

## Step 13：`server/api/schemas.py`

统一响应模型（Pydantic v2）：

```python
"""Pydantic 响应/请求模型。"""

from datetime import datetime
from pydantic import BaseModel


class TaskResponse(BaseModel):
    id: int
    type: str
    title: str
    case_name: str
    case_id: str
    case_bank: str
    loan_amount: float
    priority: str  # urgent|high|normal|low
    suggested_action: str
    source_channel: str
    created_at: datetime
    deadline: datetime | None = None
    delegated_to: str | None = None
    source_msg_id: str | None = None  # 复用 Action.source_msg_id（设计 §16.1 ②），前端静音/分析用


class CaseResponse(BaseModel):
    case_id: str
    client_name: str
    lender: str
    loan_amount: float
    stage: str
    stage_days: int
    checklist_done: int
    checklist_total: int
    progress_pct: float
    last_activity: datetime | None = None


class DispatchRequest(BaseModel):
    action: str  # approve|reject|defer|delegate


class DelegateRequest(BaseModel):
    delegate_to: str
    deadline: str | None = None
    message: str = ""


class BossReplyRequest(BaseModel):
    decision: str  # approve|reject|defer
    note: str = ""


class ChatRequest(BaseModel):
    message: str
    case_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    suggested_actions: list[str] = []


class DraftRefineRequest(BaseModel):
    instruction: str  # "改成更客气的语气"


class VersionInfo(BaseModel):
    version: str
    name: str
```

---

## 验证步骤

### Step A：结构检查
```bash
cd d:\vera-workbench
python -c "
import os
api_dir = 'server/api'
files = [f for f in os.listdir(api_dir) if f.endswith('.py')]
print(f'server/api/ has {len(files)} .py files')
assert len(files) >= 10, f'Expected 10+, got {len(files)}'

# 检查行数
for f in files:
    path = os.path.join(api_dir, f)
    lines = len(open(path).readlines())
    assert lines <= 200, f'{f} has {lines} lines (max 200)'
    print(f'  {f}: {lines} lines OK')
"
```

### Step B：import 验证
```python
python -c "
import sys; sys.path.insert(0, '.')
from server.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Total routes: {len(routes)}')
assert any('dispatch' in r for r in routes), 'Missing dispatch endpoint'
assert any('stream' in r for r in routes), 'Missing SSE endpoint'
assert '/api/version' in routes, 'Missing version endpoint'
assert any('wechat' in r for r in routes), 'Missing wechat endpoint'
print('All critical routes present')
"
```

### Step C：FastAPI 启动测试
```bash
cd d:\vera-workbench
timeout 5 python -c "
import uvicorn
from server.main import app
uvicorn.run(app, host='127.0.0.1', port=19999, log_level='error')
" &
sleep 2
curl http://127.0.0.1:19999/api/version
# 应返回 {"version":"2.0.0","name":"Vera Workbench"}
```

---

## 失败标准

- `server/api/` 目录 < 10 个 .py 文件 → **FAIL**
- `/api/version` 不返回 `{"version": "2.0.0"}` → **FAIL**
- `tasks.py` 缺少 dispatch/delegate/boss-reply 任一端点 → **FAIL**
- `events.py` 缺少 SSE 端点 → **FAIL**
- 任何文件 > 200 行 → **FAIL**
- import 任何 `shared.*` 或 `modules.*` 或旧 `server.services.*` → **FAIL**
- 没有使用 `from server.deps import get_db` → **FAIL**
- schemas.py 缺少 TaskResponse/CaseResponse/DispatchRequest → **FAIL**
- TaskResponse 缺少 `source_msg_id` 字段（必须从 Action.source_msg_id 读取返回）→ **FAIL**
- 所有端点全部返回 501 且没有调用 core 层逻辑 → **FAIL**（路由层必须接通 core，不能全是 stub）

---

⚠️ 执行纪律：
1. 不修改 `core/` 下的任何文件
2. 路由层只做"胶水"：接收请求 → 调用 core 函数 → 返回结果
3. 所有 DB 操作通过 `Depends(get_db)` 注入
4. core 中缺少的函数 → `# TODO(WO-xx): 需要 core.xx.yy` 并 `raise NotImplementedError`
5. 使用 `from core.config import get_config, get_project_root` 获取配置和项目路径
6. 每个 router 用 `APIRouter(prefix="/api/xxx", tags=["xxx"])`
7. 请求体 > 2 个参数时用 Pydantic model，不用裸参数
