# WO-74 右栏两段式清单工作台 + 手动匹配闭环 — 施工单

> **状态**：待执行
> **关联**：[新建客户AI协同体验规划.md](../新建客户AI协同体验规划.md) §五b；WO-75（首次模板与主库，本单 Step 5 依赖其模板文件）；现有 `ChecklistDeck.tsx` / `FileDeckContent.tsx`；WO-67/68（右栏清单既有实现）
> **前置**：WO-75 的 `preliminary_assessment.yaml` 需先落地（Step 5 种子依赖）；其余步骤可并行设计。

---

## 一、背景与决策记录（2026-08-25 Vera 拍板）

- **两段式**：清单分 `initial`（首次材料：模板驱动、少而全、照 Vera 邮件 8 板块）与 `condition`（银行/OS 追加：动态增长、带来源与截止日）两个阶段，同一张 `case_checklist` 表，`phase` 字段区分。
- **D-1 总进度口径**：左栏进度条 = 全部必选项已收 / 全部必选项（简单诚实）；右栏两 tab 分别显示各自进度。
- **D-2 追加项入口**：手动新增（带 `source/deadline`）本轮实现；OS 共创确认自动沉淀 → **WO-75b**。
- **手动匹配**：自动匹配（`match-files`）保留为批量兜底；新增清单项↔文件双向手动绑定、多文件追加、替换、解绑（闭环：可撤销/可替换）。

---

## 二、数据模型（Step 1）

`CaseChecklist` 追加 4 列（alembic 迁移 1 个，接当前 head）：

| 列 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `phase` | String | `"initial"` | `initial`（首次材料）/ `condition`（银行/OS 追加） |
| `deadline` | DateTime | null | 追加项截止（condition 常用；initial 可空） |
| `source_ref` | String | null | 来源说明，如 `"flow:draft_email"`、`"CBA OS 条件 #12"` |
| `item_kind` | String | `"document"` | `document`（文档）/ `info`（结构化信息，走 Fact Find） |

迁移要求：`downgrade -1` → `upgrade head` 对称可逆；ORM 与迁移一致。

---

## 三、后端契约（Step 2-5）

### Step 2 — GET /api/cases/{id}/checklist 补字段（修复断链）

响应每项补齐：`phase`、`deadline`、`source_ref`、`item_kind`、`master_category`、`bank_specific`、`applicable_when`、`matched_file_id`、`matched_file_name`、`file_ids`（= `received_file_ids`）。

> 现状问题：前端 `ChecklistDeck` 已读 `matched_file_*` 但后端从未返回，导致"已自动关联"行真机不显示。本步必须闭环。

### Step 3 — 手动匹配端点（新增 3 个）

```text
POST /api/cases/{case_id}/checklist/{item_id}/match
  body: { "file_id": "file_xxx", "replace": false }
  → 追加 file_id 到 received_file_ids；status=received；received_file_id=file_id
  → replace=true：清空旧 received_file_ids 后只留新 file_id

POST /api/cases/{case_id}/checklist/{item_id}/unmatch
  body: { "file_id": "file_xxx" }   # 缺省 = 解绑全部
  → 从 received_file_ids 移除；移除后空则 status=pending、received_file_id=None

POST /api/cases/{case_id}/files/{file_id}/match
  body: { "item_id": 12, "replace": false }
  → 文件侧绑定，等价于清单侧 match
```

- 幂等：同一 `file_id`+`item_id` 重复 match 不报错、不重复入列。
- 校验：case 存在、item 属于该 case、file 属于该 case；否则 404。
- 副作用：更新 `case.gathering_progress` + `mark_case_summary_dirty(case_id, db)` + 触发前端 `checklist_updated` 事件。

### Step 4 — 追加项新增（扩展既有端点）

`POST /api/cases/{case_id}/checklist`（既有）扩展入参：

```text
ChecklistAddRequest 增加（可选）：
  phase: "initial" | "condition"      # 默认 "initial"
  deadline: datetime | null
  source_ref: string | null
```

`phase="condition"` 时 `deadline` 允许填写；分类沿用既有白名单。同名+同分类幂等沉淀逻辑不变（仅影响 `ChecklistLibraryCustom`，与 phase 无关）。

### Step 5 — 首次清单种子（模板驱动）

新建 `core/checklist/initial_generator.py`：

```python
def generate_initial_checklist(case_id: str, db: Session) -> list[CaseChecklist]:
    """读 preliminary_assessment 模板 + 案件画像裁剪 → 写 CaseChecklist(phase="initial")。"""
```

- 建案成功（`POST /api/cases` + 拓扑导入）后调用；替换/收敛现有 `pick_checklist` 预选入口（`master_picker` 保留，作为追加/重新生成的数据源）。
- **重新生成清单（`regenerate`）只作用于 initial**：删除旧 initial 项 + 按模板重建；**condition 项一律不动**（防银行追加被误删）。
- 模板 `ref` 未命中 master → 生成失败返回 422 提示，不静默跳过。

---

## 四、前端契约（Step 6）

### ChecklistDeck.tsx 整体重构

**顶部工具栏**：
- tab 切换胶囊：`[首次材料 X/Y] [追加要求 M/N]` + 右侧总进度 + 缺件待收胶囊（作用于当前 tab）。
- 保留：重新匹配（批量自动）、新增（tab 感知）、重新生成（仅 initial，弹确认）。

**Tab 1 首次材料（initial）**：
- 按模板 8 大板块分组（ID / Income / Employment History / Living Expense / Liability / Living History / Asset / Solicitor），板块标题带进度。
- 文档项（📄）：勾选确认 / 📎 手动关联文件 / 预览已关联 / 撤销。
- 信息项（✍️ 填写）：不可勾选文件，点击提示"该信息请在全景 Fact Find 填写"（WO-77 前为占位跳转）。

**Tab 2 追加要求（condition）**：
- 平铺或按 `source_ref` 分组；deadline 倒计时红黄绿（复用右栏关键截止样式）；无 deadline 项排后。
- 卡片复用现有行样式 + 📎 手动关联 + 撤销；新增按钮带「来源 / 截止日」字段（phase=condition）。

**手动匹配交互（两 tab 共用）**：
- 📎 → 弹文件选择器（该案件文件夹文件列表，未匹配置顶）→ 选中 → `match` 端点。
- 已匹配行：显示文件名 + 预览 + 解绑（`unmatch`）。

### FileDeckContent.tsx

- 文件行操作区加「匹配到清单」图标 → 弹该案件 pending 清单项选择器 → `matchFileToItem`。
- 已匹配到清单项的文件显示徽标（清单项名），点击可跳清单 tab。

### 类型与 API 客户端

- `frontend/src/types/api.ts`：`ChecklistItemResponse` 补 `phase/deadline/source_ref/item_kind/master_category/bank_specific/applicable_when/matched_file_id/matched_file_name/file_ids`；`AddChecklistItemRequest` 补 `phase/deadline/source_ref`。
- `frontend/src/services/api/cases.ts`：新增 `matchChecklistItem / unmatchChecklistItem / matchFileToItem`。

---

## 五、自动化测试与验收标准

### 新增测试
- `tests/test_api/test_checklist_manual_match.py`：双向绑定、多文件追加、replace 替换、解绑恢复 pending、幂等、跨案件/不存在 404、进度联动。
- `tests/test_core/test_checklist_initial_seed.py`：模板→initial 种子、裁剪正确、regenerate 不碰 condition、模板 ref 缺失报 422。
- 迁移对称测试：`downgrade -1` → `upgrade head`。

### 门禁
1. 专项测试 0 failed；全量 `pytest tests/ -q` 0 failed（基线 1177+）。
2. `ruff check` 本单全部改动 py = 0 errors / 0 warnings。
3. 前端 `npx tsc --noEmit` 0 error。
4. 失败标准：手动绑定后 `GET /checklist` 必须返回 `matched_file_*`；`regenerate` 后 condition 项保留、initial 重建。

---

*v1.1 · 2026-08-25 · WO-74 两段式清单工作台 + 手动匹配闭环（对齐规划文档 §五b）*
