# 任务：执行 WO-29 案件文件夹关联施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-29-case-folder-link.md（**唯一契约**）
- 主文档背景：CASE大脑_产品定位与架构指引.md §十三（V2 案件文件夹机制）
- 前置单已完成（WO-26b/26c/27/28 + F-15 补丁）；当前基线 `pytest tests/ -q` = 855

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件：core/case_engine/folder.py（新建）、server/api/cases.py、server/api/schemas.py、tests/test_api/test_case_folder.py
2. 严禁修改：core/models/orm.py（folder_path 已有）、config/agent_flows/*.yaml、core/chat/loop.py、前端 ui/ 目录
3. 路径安全红线：关联路径必须位于 CLIENT_FILES_ROOT 下；resolve 后拒绝 `..` 穿越与越界；**不写客户文件夹内容**（只读校验 + 记录路径）
4. 幂等：重复关联同一路径返回当前状态；换路径需显式操作
5. 新代码文件 ≤200 行；无新依赖；契约先行（字段名按施工单写死）

## 实施步骤
1. 读施工单 + server/api/cases.py 现有结构 + server/api/schemas.py + core/agents 现有路径校验写法（PathGuard 可参考）
2. 实现 core/case_engine/folder.py：link_existing / auto_create（越界拒绝、冲突检测、幂等）
3. 实现 POST /api/cases/{id}/folder（body {mode: existing|auto, path?}）+ schemas（CaseFolderRequest/Response）
4. 写测试 tests/test_api/test_case_folder.py（≥8 用例，含越界/穿越/404/422/幂等）
5. 跑全部门禁，写交付报告，提交

## 门禁（全绿才算完成）
- 专项 8 用例全绿；`pytest tests/ -q` → 855 + 新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- TestClient：existing / auto / 越界拒绝 / 幂等四条路径实测通过
- `git diff` 核对：除「改动范围」表内文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单文件；提交信息用施工单给定文案
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。