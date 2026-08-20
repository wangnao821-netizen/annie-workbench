# WO-66 案件阶段统一映射 + 看板拖拽持久化与多端联动

> 状态：评审后定稿（对照表已获 Vera 确认：按推荐方案执行）
> 关联：WO-03（看板 TODO 遗留）、WO-26b（能力边界）、WO-65（阶段上下文）

## 技术约束

- 后端：Python 3.11 / FastAPI / SQLAlchemy / pathlib；**禁止新增 pip 依赖**
- 前端：React + Zustand + Vite；**禁止引入新依赖**（不装 dnd 库，沿用现有 pointer 拖拽）
- 阶段体系唯一真源：`core/case_engine/milestones.py` 的 `MILESTONE_SEQUENCE` / `MILESTONE_STAGE_MAP`；**禁止在前端再造一套 stage 枚举**
- 红线：`TERMINAL_STAGES` 终态不可改回；AI 信号链路（stage-advance）保持不动
- 前端代码直接改仓库 `frontend/src`（已固化，不再经 AI Studio）

## 背景与根因

看板拖拽（`KanbanBoard.tsx` `handlePointerUp`）只更新前端内存，`TODO(WO-03): POST /api/cases/{id}/stage-advance` 未实现，刷新即回退；右栏全景优先读 `context.facts.stage` 且拖拽不触发刷新；左栏百分比是清单收集率（`checklistProgress`）而非阶段进度。

更深根因：**三套阶段体系互不对齐** —— 后端 9 级（真源）↔ 看板 5 列 ↔ 左栏 6 节点。现有 `stageCategoryFromStage` 靠中文子串匹配且兜底返回 `submitted`，导致数据库默认值 `gathering`（英文）与 `valuing`/`reviewing` 全被错分到“递件阶段”列。

## 阶段统一对照表（已确认，实施必须照此表）

| 后端 key | 后端规范中文（落库值） | 看板 5 列 | 左栏 6 节点 |
|---|---|---|---|
| `gathering` | 收集资料 | pre_review | 收集 |
| `reviewing` | 审核中 | submitted | 递交 |
| `to_submit` | 待递交 | pre_review | 递交 |
| `submitted` | 已递交(等银行) | submitted | 递交 |
| `os_requested` | 银行补件 | os_condition | 补件 |
| `valuing` | 估值中 | os_condition | 补件 |
| `approved` | 已批准 | approval | 批准 |
| `settling` | 结算中 | settlement | 结算 |
| `settled` | 已结算 | settlement | 结算（终态） |

**看板拖拽列 → 落库代表值**（粗粒度修正，中间态仍由 AI 信号链路到达）：

| 拖拽目标列 | 落库 stage key | 落库中文 |
|---|---|---|
| pre_review | `gathering` | 收集资料 |
| submitted | `submitted` | 已递交(等银行) |
| os_condition | `os_requested` | 银行补件 |
| approval | `approved` | 已批准 |
| settlement | `settling` | 结算中（**非终态**，保证可回退） |

## 改动范围（严禁超出）

| 文件 | 操作 | 内容 |
|---|---|---|
| `server/api/schemas.py` | 修改 | 新增 `StageUpdateRequest{stage: str}`（末尾追加，不动既有） |
| `server/api/cases.py` | 修改 | 新增 `PATCH /api/cases/{case_id}/stage` |
| `tests/test_api/test_case_stage.py` | 新建（≤180 行） | 端点专项测试 |
| `frontend/src/services/caseMapper.ts` | 修改 | 显式映射表 + `stageCategoryFromStage` 修复 + 列→stage 映射 + 左栏索引映射 |
| `frontend/src/services/api/cases.ts` | 修改 | 新增 `updateCaseStage(caseId, stage)` |
| `frontend/src/stores/caseStore.ts` | 修改 | 新增 `stageVersion` + `bumpStageVersion()` |
| `frontend/src/components/cases/KanbanBoard.tsx` | 修改 | 拖拽落库 + 失败回滚 + 多端联动 |
| `frontend/src/components/brain/CaseListSidebar.tsx` | 修改 | `getStageIndex` 改查表；建档节点恒亮 |
| `frontend/src/components/brain/CasePanorama.tsx` | 修改 | 依赖 `stageVersion` 重载 context |

⚠️ 禁止修改：`core/case_engine/milestones.py`、`core/case_engine/progression.py`、`config/stage_signals.yaml`、`core/constants.py`、其他前端组件。

## 接口契约（一字不改）

### 后端 `PATCH /api/cases/{case_id}/stage`

```json
// 请求
{ "stage": "已递交(等银行)" }   // 或英文 key：submitted

// 200 成功
{ "case_id": "CASE-XXX", "stage": "已递交(等银行)", "stage_key": "submitted" }
```

- 校验顺序：
  1. 案件不存在 → 404
  2. `get_stage_key(stage)` 不在 `MILESTONE_SEQUENCE` → 422 `{"detail": "非法阶段: ..."}`
  3. 当前 stage 属 `TERMINAL_STAGES` → 409 `{"detail": "案件处于终态，不可变更阶段"}`
  4. 目标与当前相同 → 幂等返回 200（不重复写事件）
- 成功路径：`update_case_stage_and_milestones(case_id, stage, db)` → `append_context_event(case_id, "flow:stage_manual", "阶段由『旧』变更为『新』", db)` → `mark_case_summary_dirty(case_id, db)` → commit

### 前端映射契约

`caseMapper.ts` 新增导出：

```ts
export const STAGE_CATEGORY_MAP: Record<string, CaseStageCategory>; // 9 级 key/中文 → 列
export const KANBAN_COLUMN_STAGE: Record<Exclude<CaseStageCategory,'all'>, string>; // 列 → 落库 stage key
export const STAGE_INDEX_MAP: Record<string, number>; // 9 级 key/中文 → 左栏 6 节点索引(1..5)
```

- `stageCategoryFromStage(stage)`：先精确查 `STAGE_CATEGORY_MAP`（含英文 key 与规范中文），未命中兜底返回 **pre_review**（不再返回 submitted）
- `getStageIndex`（CaseListSidebar）：改查 `STAGE_INDEX_MAP`；建档节点恒亮（案件存在即 passed）

## 实施步骤

### Step 1：后端 PATCH 端点
- [ ] `schemas.py` 追加 `StageUpdateRequest`
- [ ] `cases.py` 追加 PATCH 端点（复用 `get_stage_key` / `update_case_stage_and_milestones` / `TERMINAL_STAGES` / `append_context_event` / `mark_case_summary_dirty`）
- [ ] 验证：`python -c "import server.main"` 无错；非法/终态/成功三分支

### Step 2：后端测试
- [ ] `tests/test_api/test_case_stage.py`：成功落库+事件+dirty、422 非法、409 终态、404、幂等同值、英文 key 输入
- [ ] 验证：`pytest tests/test_api/test_case_stage.py -q` 全绿

### Step 3：前端映射层
- [ ] `caseMapper.ts` 三张表 + `stageCategoryFromStage` 修复
- [ ] `cases.ts` 新增 `updateCaseStage`
- [ ] 验证：`npx tsc --noEmit` 零错误

### Step 4：看板拖拽落库
- [ ] `KanbanBoard.tsx`：`handlePointerUp` 调 `updateCaseStage`（乐观更新 → 成功 `bumpStageVersion()` → 失败回滚 + error toast）；移除“（演示）”文案与 `TODO(WO-03)` 注释
- [ ] 拖拽中防重入（简单 `saving` 标志）

### Step 5：左栏 + 右栏联动
- [ ] `CaseListSidebar.tsx`：`getStageIndex` 查表；建档节点恒亮
- [ ] `CasePanorama.tsx`：`loadData` 的 useEffect 增加 `stageVersion` 依赖

### Step 6：构建与全量回归
- [ ] `tsc --noEmit` + `vite build`
- [ ] 后端全量 `pytest tests/ -q`（沿用 `-s -p no:cacheprovider --basetemp` 约定，排除两个已收口脚本）全绿

## 验收标准

### 自动验证
- `pytest tests/test_api/test_case_stage.py` 全绿；全量 pytest 0 failed
- `tsc --noEmit` 零错误；`vite build` 成功
- ruff（后端改动文件）All checks passed

### 手动验证（打包版）
1. 看板把案件拖到“递件”列 → 刷新/重开软件后仍在该列
2. 右栏全景徽章、左栏 6 节点、首页统计、顶部检索同步更新
3. 新案件（stage=gathering）显示在“预审”列；左栏“建档”恒亮、当前节点“收集”
4. 已结算案件拖拽被后端拒绝（409）且前端回滚 + 提示
5. 断网/接口失败时拖拽回滚并提示，不产生假状态

## 执行纪律

1. 只改“改动范围”表 9 个文件；阶段值一律用对照表规范中文/英文 key，禁止自造字符串
2. 后端禁止手写 `case.stage = ...`，必须走 `update_case_stage_and_milestones`
3. 拖拽失败必须回滚，禁止残留乐观状态
4. 完成后不 commit，等检查者核对 + 真实复测（打包版）
