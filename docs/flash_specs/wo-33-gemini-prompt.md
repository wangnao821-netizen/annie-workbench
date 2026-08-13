# 任务：执行 WO-33 主动预判施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-33-gap-analysis.md（**唯一契约**）
- 主文档背景：CASE大脑_产品定位与架构指引.md §十三（三档渐进第 3 档：主动预判）
- 前置单已完成（WO-29 关联 / WO-31 自动发现 / WO-32 按需取）；当前基线 `pytest tests/ -q` = 884+WO-32

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件：core/case_folder/gap_analysis.py（新建）、core/agents/flows.py、core/agents/runner.py、core/agents/pai.py、config/agent_flows/gap_analysis.yaml、core/scheduler/jobs.py、core/config.py、config/settings.yaml、tests/test_core/test_folder_gap.py
2. 严禁修改：core/chat/loop.py、core/models/orm.py、core/case_folder/discovery.py、core/case_folder/lookup.py、server/api/*、前端 ui/ 目录
3. **只出建议红线**：不自动改清单状态、不自动推进度；产物 = 结果卡 + 建议（草稿，进 Action Inbox 语义）；调用后清单状态零变化（测试断言无副作用）
4. 缺口口径：期望清单（master_picker 预选）vs CaseChecklist 已收 vs 案件文件夹已发现材料
5. 申报一致性提示复用 WO-20 规则引擎（monkeypatch 测试）；只读比对，不扫未关联目录
6. 新代码文件 ≤200 行；开关 case_folder.auto_gap（默认 false）

## 实施步骤
1. 读施工单 + core/case_folder/discovery.py（风格参考）+ core/checklist/master_picker.py + core/scheduler/jobs.py（WO-31 已加 folder_discovery，参考其注册方式）
2. 实现 core/case_folder/gap_analysis.py：analyze_gaps(case, db) -> {missing[], matched[], suggestions[]}；build_suggestion（草稿文案，不落库改状态）
3. 加白名单 + runner 分支 + pai.py 工具 + gap_analysis.yaml（triggers：["缺什么材料","材料缺口","主动预判","gap analysis"]）
4. 配置 + 调度：case_folder.auto_gap（enabled/interval_hours，默认关；注册 gap_job 仿 folder_discovery）
5. 写测试 tests/test_core/test_folder_gap.py（≥8 用例，含"调用后清单状态不变"无副作用断言）
6. 跑全部门禁，写交付报告，提交

## 门禁（全绿才算完成）
- 专项 8 用例全绿；`pytest tests/ -q` → 884 + WO-32 新增 + 本单新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- TestClient/直测：缺材料检测、已收不报缺口、无副作用断言、无 folder_path 跳过、开关关闭、declaration 复用、三触发语命中、WO-26 契约
- `git diff` 核对：除「改动范围」表内文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单文件；提交信息用施工单给定文案
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。