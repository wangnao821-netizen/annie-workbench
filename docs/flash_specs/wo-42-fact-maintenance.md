# WO-42 上下文维护 API（事实锁定 / 修正 / 披露标记）— 执行规范

> 依据：docs/CASE大脑_客户上下文维护与任务视图_定稿.md §3.3 / §3.4 / §3.5 + 主文档 §三 披露边界/三层防线。
> 执行者：opencode / Gemini，逐 Step 执行，每步跑验证命令。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；alembic 用 `python -m alembic`
- 禁止：引入任何新 pip 依赖；新建计划外文件/目录；修改改动范围表以外的文件
- 红线：不触碰前端 ui/；不修改 config/ 任何 yaml；不发送 PII 出网；外线 track=external 的行为不得扩大（现有红线测试必须保持绿）
- 基线：`pytest tests/ -q` = 1013 passed，0 failed / 0 skipped

## 范围说明

- 本单做：BrainFact **人工锁定**（AI 蒸馏不得覆盖）+ **人工修正**（supersede 审计链）+ **披露标记**（disclosed / internal_only）+ 3 个维护端点；
- **外线可引用集合 = external ∪ disclosed-internal 的合并暂不实现**（现状 external 轨不注入 internal BrainFact，红线已安全；待外线生成上下文接入 BrainFact 后 V2 再做）；
- 锁定保护只改 `sync_brain_facts` 派生路径；前端客户全景页（F-30）消费这些端点，不在本单。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/models/orm.py` | 修改 | L586 `class BrainFact` 内追加 2 字段 |
| `core/migrations/versions/` 新迁移 | 新建 | down_revision = c3f9e7a2b1d4（当前 head） |
| `server/api/schemas.py` | 修改 | L146 `BrainFactResponse` 追加 2 字段；末尾追加 `FactAmendRequest` / `FactDisclosureRequest` |
| `server/api/cases.py` | 修改 | L363 后追加 lock/unlock/disclosure/amend 4 个端点 |
| `core/facts/extract.py` | 修改 | L91 `sync_brain_facts` 内加锁定保护（见契约 5） |
| `tests/test_api/test_fact_maintenance.py` | 新建 | 测试（见验收） |

⚠️ 严禁修改上表以外任何文件；`core/chat/*`、`core/ai/case_context.py`、前端 ui/ 零改动。

## 接口契约（一个字符都不能改）

### 1. BrainFact 追加字段（core/models/orm.py L586 类内）

```python
locked_by_user = Column(Boolean, default=False)   # 人工锁定：AI 蒸馏不得覆盖（WO-42）
disclosure = Column(String, nullable=True)        # null 未标记 / 'disclosed' / 'internal_only'（WO-42）
```

### 2. schemas（BrainFactResponse 追加 + 2 新请求模型）

```python
class BrainFactResponse(BaseModel):
    # ...现有字段不动...
    locked_by_user: bool = False
    disclosure: str | None = None


class FactAmendRequest(BaseModel):
    value: str                          # 修正后的值（非空，空白 → 422）
    reason: str | None = None           # 修正原因（写入事件 content）


class FactDisclosureRequest(BaseModel):
    disclosure: str | None = None       # 'disclosed' | 'internal_only' | None（None=清除标记）
```

### 3. 端点（server/api/cases.py，`list_brain_facts` 之后追加）

```python
def _get_fact_or_404(fact_id: int, case_id: str, db: Session) -> BrainFact:
    """有效事实（valid_to IS NULL）且属于该案件，否则 404。"""


@router.post("/{case_id}/facts/{fact_id}/lock", response_model=BrainFactResponse)
def lock_brain_fact(case_id: str, fact_id: int, db: Session = Depends(get_db)) -> BrainFactResponse:
    """人工锁定事实：locked_by_user=True，幂等。"""


@router.post("/{case_id}/facts/{fact_id}/unlock", response_model=BrainFactResponse)
def unlock_brain_fact(case_id: str, fact_id: int, db: Session = Depends(get_db)) -> BrainFactResponse:
    """解锁事实：locked_by_user=False，幂等。"""


@router.patch("/{case_id}/facts/{fact_id}/disclosure", response_model=BrainFactResponse)
def set_fact_disclosure(
    case_id: str, fact_id: int, req: FactDisclosureRequest, db: Session = Depends(get_db)
) -> BrainFactResponse:
    """设置披露标记：'disclosed' | 'internal_only' | None；非法值 422。"""


@router.post("/{case_id}/facts/{fact_id}/amend", response_model=BrainFactResponse)
def amend_brain_fact(
    case_id: str, fact_id: int, req: FactAmendRequest, db: Session = Depends(get_db)
) -> BrainFactResponse:
    """人工修正事实：新行替换旧行（supersede 审计链）+ 新行自动锁定。"""
```

amend 行为（填空）：
1. `req.value.strip()` 空 → 422；
2. `append_context_event(case_id, source_type="manual_fact_amend",
   content=f"人工修正 [{old.key}]：{req.value}（原值：{old.value}）" + (f"；原因：{req.reason}" if req.reason else ""),
   db, trigger_distill=False, track=old.track, status="confirmed")`；
3. 新建 `BrainFact(case_id, key=old.key, value=req.value, category=old.category, track=old.track,
   event_id=event.id, locked_by_user=True)`；
4. 旧行 `superseded_by=新 id`、`conflict=True`、`valid_to=now`；
5. commit + refresh，返回新行。

lock/unlock/disclosure 端点：
- `_get_fact_or_404` 校验后改字段 + commit + refresh，返回该行；
- disclosure 值不在 `{None, 'disclosed', 'internal_only'}` → 422。

### 4. GET /facts 响应

现有 `list_brain_facts` 返回 `BrainFactResponse.model_validate(f)` 自动带新字段，无需改逻辑。

### 5. sync_brain_facts 锁定保护（core/facts/extract.py）

- 在"同 (case_id, key, track) 新值替换旧值"分支前检查：目标旧行 `locked_by_user=True` → **跳过覆盖**（不 supersede、不写新行、不标 conflict），`logger.info("跳过锁定事实: %s %s", case_id, key)`；
- 锁定行之外的派生逻辑一字不改；锁定行若已被 supersede（valid_to 非空）不参与保护。

## 实施步骤

### Step 1：ORM + 迁移
- [ ] `core/models/orm.py` BrainFact 追加 2 字段（契约 1）
- [ ] 手动编写迁移（**不要用 autogenerate**，dev 库含 sqlite-vec 虚拟表会反射失败，沿用 WO-43 惯例）：新增 2 列，upgrade/downgrade 对称
- [ ] 验证：`python -m alembic upgrade head` + `python -m alembic current` = 新 head；`python -m alembic downgrade -1` 后 `upgrade head` 可逆

### Step 2：schemas
- [ ] `server/api/schemas.py`：BrainFactResponse 追加 2 字段 + FactAmendRequest / FactDisclosureRequest
- [ ] 验证：`python -c "from server.api.schemas import FactAmendRequest; print(FactAmendRequest(value='x'))"`

### Step 3：4 个端点
- [ ] `server/api/cases.py`：`_get_fact_or_404` + lock/unlock/disclosure/amend（契约 3）
- [ ] 验证：`python -c "import server.api.cases"` 无报错

### Step 4：sync 锁定保护
- [ ] `core/facts/extract.py` `sync_brain_facts` 加锁定保护（契约 5）
- [ ] 验证：`python -c "import core.facts.extract"` 无报错

### Step 5：测试
- [ ] 新建 `tests/test_api/test_fact_maintenance.py`（用例见验收）
- [ ] 验证：`pytest tests/test_api/test_fact_maintenance.py -v` 全绿

## 验收标准

### 自动验证
- `pytest tests/test_api/test_fact_maintenance.py -v` → 全绿（用例 11）
- `pytest tests/ -q` → ≥ 1013 passed，0 failed / 0 skipped
- `ruff check`（改动文件）→ All checks passed
- `python -m alembic current` = 新 head；downgrade/upgrade 对称

### 测试用例（tests/test_api/test_fact_maintenance.py）
1. `test_lock_idempotent`：lock → locked_by_user=True；再 lock 幂等
2. `test_unlock_idempotent`：unlock → False；再 unlock 幂等
3. `test_lock_404`：不存在/其他案件事实 → 404
4. `test_disclosure_mark_and_clear`：'disclosed' → 200；'internal_only' → 200；None → 清除
5. `test_disclosure_invalid`：'xxx' → 422
6. `test_amend_replaces_with_chain`：amend → 新行 value 正确、locked_by_user=True；旧行 superseded_by=新 id、valid_to 非空、conflict=True
7. `test_amend_writes_event`：GET /context-events 可见 source_type=manual_fact_amend 的 confirmed 事件
8. `test_amend_blank_value`：value 空白 → 422
9. `test_amend_wrong_case`：fact 属于其他案件 → 404
10. `test_sync_skips_locked`：锁定事实后触发同 key 新事件派生 → 锁定行仍有效（valid_to IS NULL、未被 supersede）
11. `test_external_track_unchanged`：disclosure='internal_only' 事实在 ?track=external 不出现（红线保持）

### 手动验证
1. 客户全景页（F-30 落地后）事实卡出现 🔒 锁定 / 披露标记，可修正/解锁
2. 对话中 AI 再次生成同 key 事实 → 不覆盖锁定项（日志出现"跳过锁定事实"）

---
⚠️ 执行纪律：
1. 只修改"改动范围"表内文件，绝不碰其他文件
2. 契约中所有命名一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 验证命令
4. 验证失败 → 停下报告错误，不自作主张修计划外代码
5. 不引入技术约束外依赖；不创建范围外新文件
6. 完成后 git stage 范围表内文件，提交信息：`feat: WO-42 上下文维护 API — 事实锁定/修正/披露标记 + 蒸馏锁定保护`
