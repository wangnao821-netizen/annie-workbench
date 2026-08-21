# WO-69 右栏案件级汇总胶囊（缺 X 项 · Y 文件未匹配 · N 任务待办）

> 状态：规划（待实施）；依赖 WO-67（未匹配文件数）

## 背景

右栏顶部 tab 已有数量徽章（清单缺件/文件数/任务数/逾期），但缺「文件未匹配数」，且四个 tab 各自计数、没有案件级一句话汇总。目标：右栏顶部一行胶囊「缺 X 项材料 · Y 文件未匹配 · N 任务待办」，切换任何 tab 都可见，扫一眼知道这个案件的整体状态。

## 技术约束

- 前端 React + Zustand；无后端改动
- 复用 `useRightDeckCounts`（已有 checklistPendingCount/fileCount/taskCount/overdueCount）
- 未匹配文件数依赖 WO-67 返回的 `matched_checklist`

## 改动范围（严禁超出）

| 文件 | 操作 | 内容 |
|---|---|---|
| `frontend/src/hooks/useRightDeckCounts.ts` | 修改 | 增加 `unmatchedFileCount`（`items` 中 `matched_checklist` 为空且非目录的文件数） |
| `frontend/src/components/brain/RightDeckTabs.tsx` | 修改 | 胶囊渲染：`缺 {X} 项 · {Y} 未匹配 · {N} 待办`（颜色：缺件/未匹配 >0 用红/琥珀，全清用绿） |
| `frontend/src/components/layout/AppShell.tsx` | 修改 | 右栏 header 胶囊挂载位置（RightDeckTabs 内即可，视布局定） |

## 实施步骤

1. `useRightDeckCounts`：`fetchCounts` 时统计未匹配文件数（`fileData.items` 过滤 `!is_dir && (!matchedChecklist || matchedChecklist.length === 0)`），空 caseId 归 0
2. 胶囊 UI：紧凑一行，`ml-auto` 或独立行；文案 `缺 {checklistPendingCount} 项 · {unmatchedFileCount} 未匹配 · {taskCount} 待办`；任务逾期时待办标红
3. 监听既有 `checklist_updated/files_updated/task_updated` 事件自动刷新（已实现）

## 验收

- tsc/build 通过
- 打包版：右栏顶部胶囊随清单勾选、文件匹配、任务完成实时更新；空 caseId 不显示

## 纪律

- 不改后端；不改变 tab 徽章既有行为（胶囊为新增信息层）
- 若 WO-67 未合入，`unmatchedFileCount` 先按「无字段」降级为 0（不阻断合入）
- 完成后不 commit，等检查者核对
