# WO-14：确认闸门状态机（#6 定稿落地）

> 来源：CASE 大脑 V1 收口 #6（事件状态机 pending → confirmed → superseded；高置信直接 confirmed + 可撤销，低置信 pending + 轻确认；蒸馏/全景只从 confirmed 重建）。执行方：opencode。检查方：Codex。
> 配套前端：F-2（确认记录交互）。BrainFact 表 + fact_schema 词表 + LLM 提取归 **WO-15**（本单不做，避免半吊子）。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Alembic（唯一建表路径）
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改动既有迁移 revision（只允许**新建**一个 revision，down_revision = f49cf1c11b02）
- 允许：标准库、现有依赖；迁移风格沿用 f49cf1c11b02（batch_alter_table + server_default）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/migrations/versions/xxxx_add_event_status.py` | **新建** | down_revision=`f49cf1c11b02`，revision 自拟短哈希 |
| `core/models/orm.py` | 修改 | `class CaseContextEvent`（L558 起）：source_ref 之后新增 3 列 |
| `core/context/accumulator.py` | 修改 | `append_context_event`（L62 起）加 status 参数；`get_context_events`（L126）加 status 参数；`_distill_context_summary`（L165 调用处）传 `status="confirmed"` |
| `server/api/schemas.py` | 修改 | `ContextEventResponse` 加 status；新增 `SupersedeEventRequest` |
| `server/api/cases.py` | 修改 | `create_context_event`（L182 附近）响应含 status；新增 3 个端点 |
| `tests/test_api/test_context_events.py` | 修改 | 追加状态机用例（见下） |
| `tests/test_alembic.py` | 修改 | 追加迁移断言（status 默认 confirmed） |

⚠️ 严禁修改上表以外的文件（含 core/ai/、core/facts/、前端）。严禁改动既有 revision。

---

## 一、数据层：status + superseded_by + supersede_reason

### 迁移（新建 revision）

```python
def upgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(length=20), nullable=False, server_default='confirmed'))
        batch_op.add_column(sa.Column('superseded_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('supersede_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.drop_column('supersede_reason')
        batch_op.drop_column('superseded_by')
        batch_op.drop_column('status')
```

> 历史行 server_default='confirmed'：保持既有蒸馏/全景行为（#6 语义：账本已有事实视为已确认）。

### ORM（`core/models/orm.py`，`CaseContextEvent` 内 source_ref 之后新增）

```python
    status = Column(String(20), nullable=False, default="confirmed", server_default="confirmed")  # pending | confirmed | superseded
    superseded_by = Column(Integer, nullable=True)   # 撤销/纠正时指向替代事件 id（审计链）
    supersede_reason = Column(Text, nullable=True)   # 撤销原因（审计）
```

### 验证
- `cd D:\vera-workbench && .venv\Scripts\python.exe -m alembic upgrade head` → 成功；`alembic current` 显示新 revision；
- `sqlite3` 检查 `case_context_events` 三列存在（或 pytest 断言，见测试节）。

---

## 二、蒸馏只吃 confirmed（`core/context/accumulator.py`）

### 契约

```python
def append_context_event(
    case_id: str,
    source_type: SourceType,
    content: str,
    db: Session,
    *,
    trigger_distill: bool = True,
    track: str = "internal",
    status: str = "confirmed",  # NEW：pending | confirmed | superseded
) -> CaseContextEvent:
```

改动点：
1. `append_context_event` 签名末尾加 `status: str = "confirmed"`；在参数校验区（track 校验之后）加：
   ```python
   if status not in ("pending", "confirmed", "superseded"):
       raise ValueError(f"status must be one of pending/confirmed/superseded, got {status!r}")
   ```
   `CaseContextEvent(...)` 构造加 `status=status`；docstring 补充 status 说明（默认 confirmed，不破坏既有调用）。
2. `get_context_events` 签名加 `status: str | None = None`；查询处加：
   ```python
   if status is not None:
       query = query.filter(CaseContextEvent.status == status)
   ```
   docstring 补充"status: 仅返回该状态事件；None 返回全部（默认，兼容既有调用）"。
3. `_distill_context_summary` 内 `events = get_context_events(case_id, db, limit=100, track=track)` → 加 `status="confirmed"`；docstring 注明"只从 confirmed 事件蒸馏（#6：pending 不参与）"。

### 验证
- `grep -rn "get_context_events(" core/ server/` → 仅 accumulator.py 内部 2 处（定义 + 蒸馏调用），无第三处需同步。

---

## 三、确认闸门端点（`server/api/schemas.py` + `server/api/cases.py`）

### Schemas

```python
class ContextEventResponse(BaseModel):
    id: int
    case_id: str
    source_type: str
    content: str
    track: str
    status: str = "confirmed"   # pending | confirmed | superseded
    superseded_by: int | None = None
    supersede_reason: str | None = None
    created_at: datetime | None = None


class SupersedeEventRequest(BaseModel):
    reason: str = Field(..., min_length=1)          # 撤销原因（必填）
    replacement_event_id: int | None = None          # 可选：纠正时指向替代事件
```

### 端点（`server/api/cases.py`，放在 `create_context_event` 之后）

```python
@router.get("/{case_id}/context-events", response_model=list[ContextEventResponse])
def list_context_events(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
    status: str | None = Query(default=None, pattern="^(pending|confirmed|superseded)$"),
    track: str | None = Query(default=None, pattern="^(internal|external)$"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ContextEventResponse]:
    """案件上下文事件列表（按状态/轨道过滤），供确认卡与"已记录 N 条"使用。"""
    _get_case_or_404(case_id, db)
    events = get_context_events(case_id, db, limit=limit, track=track, status=status)
    return [ContextEventResponse.model_validate(e) for e in events]


@router.post("/{case_id}/context-events/{event_id}/confirm", response_model=ContextEventResponse)
def confirm_context_event(case_id: str, event_id: int, db: Session = Depends(get_db)) -> ContextEventResponse:  # noqa: B008
    """低置信确认：pending → confirmed。已 confirmed 幂等 200；superseded → 409。"""
    _get_case_or_404(case_id, db)
    event = db.query(CaseContextEvent).filter(
        CaseContextEvent.id == event_id, CaseContextEvent.case_id == case_id
    ).first()
    if event is None:
        raise HTTPException(status_code=404, detail="事件不存在")
    if event.status == "superseded":
        raise HTTPException(status_code=409, detail="已撤销事件不可确认")
    event.status = "confirmed"
    db.commit()
    db.refresh(event)
    return ContextEventResponse.model_validate(event)


@router.post("/{case_id}/context-events/{event_id}/supersede", response_model=ContextEventResponse)
def supersede_context_event(
    case_id: str,
    event_id: int,
    req: SupersedeEventRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> ContextEventResponse:
    """撤销/纠正：confirmed|pending → superseded（不物理删除，审计保留）。superseded → 409。"""
    _get_case_or_404(case_id, db)
    event = db.query(CaseContextEvent).filter(
        CaseContextEvent.id == event_id, CaseContextEvent.case_id == case_id
    ).first()
    if event is None:
        raise HTTPException(status_code=404, detail="事件不存在")
    if event.status == "superseded":
        raise HTTPException(status_code=409, detail="事件已撤销")
    event.status = "superseded"
    event.supersede_reason = req.reason
    event.superseded_by = req.replacement_event_id
    db.commit()
    db.refresh(event)
    return ContextEventResponse.model_validate(event)
```

> 注意：`create_context_event` 现有返回处改为 `ContextEventResponse.model_validate(event)` 以带上 status（或补 status 字段）；`ContextEventResponse.model_validate` 需确认 ORM 属性名与字段一致（id/case_id/...）。

---

## 四、测试（`tests/test_api/test_context_events.py` 追加 + `tests/test_alembic.py` 追加）

### `tests/test_api/test_context_events.py` 新增类

```python
class TestConfirmationGate:
    def test_manual_note_defaults_confirmed(self, client, test_db):
        # 记一笔默认 confirmed；GET ?status=confirmed 可见、?status=pending 不可见

    def test_pending_not_in_distill(self, client, test_db):
        # append_context_event(status="pending") 后，context_summary 不含该内容；
        # 再 append confirmed 同内容 → summary 含

    def test_confirm_pending(self, client, test_db):
        # pending → POST confirm → status=confirmed

    def test_confirm_idempotent(self, client, test_db):
        # confirmed 再 confirm → 200 幂等

    def test_confirm_superseded_conflict(self, client, test_db):
        # superseded 后 confirm → 409

    def test_supersede_with_reason_and_replacement(self, client, test_db):
        # confirmed → POST supersede(reason, replacement_event_id) → status=superseded、
        # supersede_reason/superseded_by 落库；再 supersede → 409

    def test_unknown_event_or_wrong_case(self, client, test_db):
        # 事件不存在 → 404；事件属于其他案件 → 404
```

> 造 pending 事件：测试里直接调用 `append_context_event(case_id, "manual_note", "…", db, status="pending")`，不新增"创建 pending"端点（AI 提取归 WO-15/16）。

### `tests/test_alembic.py` 追加

```python
def test_event_status_column_defaults_confirmed(tmp_path):
    # 空库 upgrade head 后：case_context_events.status 存在且列默认 'confirmed'
    # （沿用 _upgrade_head + inspect 模式）
```

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_api/test_context_events.py tests/test_alembic.py -v   # 专项
python -m pytest tests/ -q                                                       # 全量（基线 455，不得回归）
ruff check core/models/orm.py core/context/accumulator.py server/api/schemas.py server/api/cases.py tests/test_api/test_context_events.py tests/test_alembic.py
```

手动验证：
1. `GET /api/cases/{id}/context-events?status=pending` → `[]`（无 pending 时）；记一笔后 `?status=confirmed` 返回该事件且含 `"status":"confirmed"`。
2. alembic current → 新 revision；历史库 upgrade 后旧事件 status='confirmed'。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 7 个文件，绝不碰其他文件
2. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
3. 每完成一节立即运行该节验证命令；失败先报告，不自作主张修计划外代码
4. 不引入新依赖；不创建改动范围表以外的新文件（迁移 revision 除外，属表内新建项）
5. 不改动既有迁移 revision；只新建一个
6. 不要重构、优化、美化任何计划外的代码
