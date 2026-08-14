# WO-38 时间点回溯 — 执行规范

> 状态：待执行（2026-08-14 起草）
> 背景：借鉴 Semantica point-in-time snapshot。老客户从半截接手、缺上下文——数据已具备（BrainFact valid_from/valid_to + CaseContextEvent created_at + timeline stage_advanced），只差查询层：案件在指定时间点的全景快照（当时有效事实 + 当时事件 + 当时阶段）。

## 一、技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 禁止：引入任何新的 pip 依赖
- 禁止：创建计划外的新文件/新目录
- 禁止：新增数据库迁移（复用现有 `brain_facts` / `case_context_events` / `case_timeline_events` / `cases` 表，无新列）
- 禁止：修改 `core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、前端 `ui/`
- 只允许修改/新建：
  - `core/case_engine/snapshot.py`（新建，≤200 行）
  - `server/api/cases.py`（修改，+1 端点）
  - `server/api/schemas.py`（修改，+1 响应模型）
  - `tests/test_api/test_case_snapshot.py`（新建）
- PII 红线：快照仅从本地库读取并返回给 Vera（不出外网）；不触碰客户文件夹

## 二、接口契约（变量名/函数名/字段名写死，一字不改）

### 核心模块（core/case_engine/snapshot.py，新建）

```python
"""案件时间点回溯 — 指定时点的全景快照（WO-38，借鉴 Semantica point-in-time）。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import BrainFact, Case, CaseContextEvent, CaseTimelineEvent

logger = get_logger(__name__)

_TRACKS = ("internal", "external")


def build_case_snapshot(
    case_id: str,
    db: Session,
    at: datetime | None = None,
    track: str = "internal",
) -> dict:
    """案件在 at（默认 now）时点的全景快照。

    Args:
        case_id: 案件 ID
        db: SQLAlchemy session
        at: 回溯时间点（naive 视为 UTC）；None = 当前时间
        track: 事实/事件轨道（internal | external）

    Returns:
        {"snapshot_at": str, "stage": str, "facts": list[dict],
         "events": list[dict], "timeline": list[dict]}

    Raises:
        ValueError: track 非法；case 不存在
    """
```

### 快照口径（写死，不得自行发明）

- `facts`：`BrainFact` 且 `track == track` 且 `valid_from <= at` 且（`valid_to IS NULL` 或 `valid_to > at`），按 category/key 升序
  - 每项：`{"key", "value", "category", "conflict", "valid_from", "valid_to"}`
- `events`：`CaseContextEvent` 且 `track == track` 且 `created_at <= at`，按 created_at 倒序，limit 20
  - 每项：`{"source_type", "content", "status", "created_at"}`
- `timeline`：`CaseTimelineEvent` 且 `created_at <= at`，按 created_at 倒序，limit 20
  - 每项：`{"event_type", "title", "description", "created_at"}`
- `stage`：从 timeline 中 `event_type == "stage_advanced"` 且 `created_at <= at` 的事件，按时间倒序取第一个的 `metadata_json["to_stage"]`；无则返回 `Case.stage or "gathering"`
- `snapshot_at`：`at.isoformat()`（naive 时补 UTC 语义，仅字符串展示）

### 端点（server/api/cases.py）

```python
@router.get("/{case_id}/snapshot", response_model=CaseSnapshotResponse)
def case_snapshot(
    case_id: str,
    at: str | None = Query(None),
    track: str = Query("internal"),
    db: Session = Depends(get_db),  # noqa: B008
) -> CaseSnapshotResponse:
    """案件在指定时点的全景快照（at 缺省 = now；ISO 格式；非法 422；无案件 404）。"""
```

- `at` 解析：`datetime.fromisoformat(at)`；失败 → 422 `"at 必须是 ISO 8601 时间"`
- `track` 非 internal/external → 422（复用现有校验风格）
- 案件不存在 → 404（与现有端点一致）

### 响应模型（server/api/schemas.py）

```python
class SnapshotFact(BaseModel):
    key: str
    value: str
    category: str
    conflict: bool = False
    valid_from: datetime | None = None
    valid_to: datetime | None = None


class SnapshotEvent(BaseModel):
    source_type: str
    content: str
    status: str
    created_at: datetime | None = None


class SnapshotTimelineItem(BaseModel):
    event_type: str
    title: str
    description: str | None = None
    created_at: datetime | None = None


class CaseSnapshotResponse(BaseModel):
    snapshot_at: str
    stage: str
    facts: list[SnapshotFact]
    events: list[SnapshotEvent]
    timeline: list[SnapshotTimelineItem]
```

## 三、实施步骤（每步完成即运行验证命令）

### Step 1：快照模块
- [ ] 新建 `core/case_engine/snapshot.py`，按契约实现 `build_case_snapshot`
- [ ] track 非法 → `ValueError`；case 不存在 → `ValueError`（由端点转 404）
- [ ] stage 推导解析 `metadata_json`（含容错：JSON 解析失败/缺 to_stage → 跳过该事件继续往前找）
- [ ] 验证：`ruff check core/case_engine/snapshot.py` → All checks passed

### Step 2：端点 + schema
- [ ] `server/api/schemas.py`：新增 4 个模型（SnapshotFact / SnapshotEvent / SnapshotTimelineItem / CaseSnapshotResponse），全部 `model_config = ConfigDict(from_attributes=True)`
- [ ] `server/api/cases.py`：新增 `GET /{case_id}/snapshot` 端点（at 解析 422 / track 422 / 404 / 200）
- [ ] 验证：`pytest tests/test_api/test_case_snapshot.py -q` → 全绿

### Step 3：测试
- [ ] 新建 `tests/test_api/test_case_snapshot.py`，用例（每个用例一行注释说明断言）：
  1. `test_snapshot_now_returns_valid` — 无 at → 200，snapshot_at 非空，facts/events/timeline 为列表
  2. `test_snapshot_excludes_future_facts` — at 早于某事实 valid_from → 该事实不在 facts
  3. `test_snapshot_includes_fact_valid_at_point` — at 落在 valid_from ≤ at < valid_to 内 → 该事实在
  4. `test_snapshot_excludes_superseded_after_point` — valid_to ≤ at 的旧事实不再出现
  5. `test_snapshot_stage_from_timeline` — at 前有 stage_advanced（to_stage）→ stage 为该值
  6. `test_snapshot_stage_fallback` — 无 stage_advanced → stage = case.stage 或 gathering
  7. `test_snapshot_track_filter` — internal/external 事件各归各轨
  8. `test_snapshot_404_unknown_case` — 无案件 → 404
  9. `test_snapshot_422_bad_at` — at="not-a-date" → 422
  10. `test_snapshot_422_bad_track` — track="public" → 422
- [ ] 验证：`pytest tests/test_api/test_case_snapshot.py -q` → 全绿

### Step 4：全量门禁
- [ ] `pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- [ ] `ruff check core/case_engine/snapshot.py server/api/cases.py server/api/schemas.py tests/test_api/test_case_snapshot.py` → All checks passed
- [ ] `python -c "import core.case_engine.snapshot, server.main"` → 无循环导入

## 四、本次改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/case_engine/snapshot.py` | 新建 | — |
| `server/api/schemas.py` | 修改 | 末尾新增 4 个模型（勿动既有模型） |
| `server/api/cases.py` | 修改 | 新增 `/{case_id}/snapshot` 端点（勿动既有端点） |
| `tests/test_api/test_case_snapshot.py` | 新建 | — |

⚠️ 严禁修改上表以外的任何文件。
⚠️ 严禁重命名、移动或删除任何现有文件。
⚠️ 严禁修改 import 以外的现有代码逻辑（schemas.py / cases.py 仅允许追加）。

## 五、验收标准

### 自动验证（必须全部通过）
- `pytest tests/test_api/test_case_snapshot.py -q` → 10 项全绿
- `pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- `ruff check`（上表 py 文件）→ All checks passed

### 手动验证
1. TestClient 实测：`GET /api/cases/{id}/snapshot` → 200；`?at=2026-01-01T00:00:00` 过滤未来事实；`?at=bad` → 422；未知案件 → 404
2. 有 stage_advanced 事件的案件，at 选在事件前/后，stage 分别回退/推进

---
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名严格按照"接口契约"章节的定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"章节中未列出的依赖库
6. 不要创建任何"改动范围"表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
