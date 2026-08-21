# OpenCode 任务提示词：WO-70 首页右栏「客户任务」全面修复与重设计（双轨 Tool-Calling 版）

请作为全栈资深开发工程师，严格按照 `docs/flash_specs/wo-70-task-deck-fix-prompt.md` 施工单执行代码修改。

## 核心任务（5 大修复项，10 个文件）

1. **后端任务创建升级为双轨 Tool-Calling（根治口语废话）**：
   - 详细规范：`docs/flash_specs/wo-70-task-tool-calling.md`；
   - 文件：`core/chat/loop.py` — `TASK_CREATE` 分支升级为双轨机制（轨道 A 规则快路径 0 延迟 + 轨道 B 精准 `create_task` Tool Calling）；
   - 文件：`core/chat/slot_extractor.py` — 优化快路径正则与高置信度判定标准（有废话词则降级至轨道 B）。

2. **修复点击任务标题全部跳转 OS 工作台**：
   - 文件：`frontend/src/components/brain/TaskDeckContent.tsx` 第 421 行
   - 文件：`frontend/src/components/brain/TaskDrawer.tsx` 第 315 行
   - 两处 `onClick={() => openOsWorkbench(task.id)}` → `onClick={() => useUiStore.getState().openTaskDetail(task.id)}`。

3. **清理任务详情页假邮件/假附件/乱码数据**：
   - 文件：`frontend/src/types/index.ts` — `TaskItem` 接口末尾追加 5 个可选邮件字段；
   - 文件：`frontend/src/components/panel/details/EmailDispatchDetail.tsx` — 删除 `MOCK_ATTACHMENTS`，改为动态读取 + 优雅空状态；
   - 文件：`frontend/src/components/panel/details/GeneralEmailDetail.tsx` — 执行相同改动。

4. **OS 工作台草稿框扩大 + 移除 TODO 噪音**：
   - 文件：`frontend/src/components/os/OsDraftColumn.tsx` — rows 扩大（中文 8、英文 10）、`resize-y`、删除 TODO、列宽改为 `xl:flex-1`；
   - 文件：`frontend/src/components/os/OsConditionsColumn.tsx` 与 `OsStrategyColumn.tsx` — 删除 TODO 文字。

5. **「客户任务」页签 UI 重设计**（`TaskDeckContent.tsx`）：
   - 顶部增加完成进度动效条；
   - 卡片增加优先级全色系左色条；
   - 增加 AI 摘要预览行；
   - 操作按钮行改为 hover 完全显示；
   - 逾期任务截止 badge 增加 `animate-pulse`；
   - 美化空状态。

## 纪律红线
- 严禁修改施工单列出的 10 个文件以外的任何文件；
- 严禁更改 CSS 变量、theme 文件或引入新 npm 依赖；
- 严禁删除与本次修改无关的注释和 docstring；
- 必须严格按照 `docs/flash_specs/wo-70-task-deck-fix-prompt.md` 逐条对照执行。

## 验收命令
```powershell
# 后端
cd D:\vera-workbench
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
python -m pytest tests/test_slot_extractor.py -v
python -m pytest tests/test_intent_driven_tools.py -v
python -m ruff check core/chat/loop.py core/chat/slot_extractor.py

# 前端
cd D:\vera-workbench\frontend
npx tsc --noEmit
npm run build
```
全部测试 pass、ruff 零报错、前端编译零报错后汇报。
