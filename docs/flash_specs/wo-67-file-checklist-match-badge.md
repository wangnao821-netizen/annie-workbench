# WO-67 文件↔清单匹配角标（后端返回匹配关系 + 前端角标）

> 状态：规划（待实施）

## 背景

右栏「案卷资料夹」是纯文件管理器形态，看不出哪个文件对应清单哪一项、哪些文件还没被认领。目标：文件列表直接标注「已匹配到 N 项清单 / 未匹配」，让 Vera 一眼看到材料与清单的对应关系。

## 技术约束

- 后端 Python 3.11 / FastAPI；禁止新增依赖
- 前端 React + TS；改动限 checklist/file 相关组件
- 复用现有匹配存储：`case_checklist.received_file_id` / `candidate_file_ids`（JSON 数组，存 file_id）
- 复用 `core/file_ops/service.py::list_files` 已有的 `file_id` 关联（按绝对路径关联 `processed_files`）

## 改动范围（严禁超出）

| 文件 | 操作 | 内容 |
|---|---|---|
| `core/file_ops/service.py` | 修改 | `list_files` 增加 `matched_checklist`（引用该 file_id 的清单项名列表，≤3 个 + 计数） |
| `server/api/schemas.py` | 修改 | `FileItem` 增加 `matched_checklist: list[str]`（默认 []） |
| `server/api/file_ops.py` | 修改 | 透传新字段（list 端点响应不变结构，只加字段） |
| `frontend/src/types/api.ts` | 修改 | `FileItem` 增加 `matchedChecklist?: string[]` |
| `frontend/src/components/brain/FileDeckContent.tsx` | 修改 | 文件行匹配角标：已匹配（绿标 `清单 N 项`）/未匹配（灰标 `未匹配`）；点击角标跳转清单 tab 并高亮对应项（可选 Step） |
| `tests/test_api/test_file_match_badge.py` | 新建（≤160 行） | 后端匹配角标专项测试 |

## 接口契约

`GET /api/cases/{case_id}/folder/files` 的 `items[]` 每项新增：

```json
{ "matched_checklist": ["2025 NOA 税单", "BAS 申报"] }
```

- 匹配判定：文件 `file_id` ∈ 某清单项的 `received_file_id` 或 `candidate_file_ids`
- 未落库（file_id=None）文件 → `matched_checklist: []`（前端显示「未匹配」）
- 不改变既有字段与分页/排序行为

## 实施步骤

1. 后端：`list_files` 中构建 `file_id → 清单项名` 倒排（一次查询 `case_checklist` 该案件行，解析 candidate_file_ids），为每个文件附加 `matched_checklist`（保留原顺序，超出 3 个截断显示但计数完整由前端处理）
2. schema + 端点透传
3. 前端：FileItem 类型 + 角标渲染（有匹配 → 绿标；无 → 灰标「未匹配」；hover 显示清单项名全列表）
4. 测试：file_id 匹配单清单、多清单、未匹配、file_id 为 None、candidate 引用

## 验收

- 专项测试全绿；全量 pytest 0 failed；tsc/build 通过
- 打包版：文件行显示匹配角标；「重新匹配」后角标更新

## 纪律

- 只改上表文件；不重写匹配算法（matcher 不动）
- 完成后不 commit，等检查者核对
