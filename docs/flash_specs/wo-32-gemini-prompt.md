# 任务：执行 WO-32 按需自主取施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-32-folder-lookup.md（**唯一契约**）
- 主文档背景：CASE大脑_产品定位与架构指引.md §十三（三档渐进第 2 档：按需自主取）
- 前置单已完成（WO-29 关联 / WO-31 自动发现）；当前基线 `pytest tests/ -q` = 884

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件：core/case_folder/lookup.py（新建）、core/case_folder/__init__.py、core/agents/flows.py、core/agents/runner.py、core/agents/pai.py、config/agent_flows/folder_lookup.yaml、tests/test_core/test_folder_lookup.py
2. 严禁修改：core/chat/loop.py、core/models/orm.py、core/case_folder/discovery.py、server/api/*、前端 ui/ 目录
3. 只读红线：检索/解析只读（PathGuard 校验）；**不主动枚举全量目录**（按 Vera 指定的关键词/类型/路径提示过滤）；不写客户内容
4. 白名单三处同步：flows.py 白名单 + runner 分支 + pai.py 工具（pai.py 保持 ≤200 行）
5. 无 folder_path → 可读错误；query 含 `..` → 拒绝
6. 新代码文件 ≤200 行；契约先行（字段名按施工单写死）

## 实施步骤
1. 读施工单 + core/case_folder/discovery.py（风格参考）+ core/agents/runner.py + core/agents/pai.py + config/agent_flows/ 现有 YAML
2. 实现 core/case_folder/lookup.py：lookup_files(case, query, client_root) -> list[dict]（rel_path/size/mtime/doc_type，只读元数据）；parse_one(case, rel_path, db)（复用现有解析入口，输出脱敏摘要）
3. 加白名单 + runner 分支 + pai.py 工具 + folder_lookup.yaml（triggers：["去文件夹找","找一下文件","folder lookup","在案件文件夹里找"]）
4. 写测试 tests/test_core/test_folder_lookup.py（≥8 用例）
5. 跑全部门禁，写交付报告，提交

## 门禁（全绿才算完成）
- 专项 8 用例全绿；`pytest tests/ -q` → 884 + 新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- TestClient/直测：检索命中、`..` 拒绝、无 folder_path 报错、只读断言（mtime/内容不变）、parse 摘要、三触发语命中、白名单三处一致
- `git diff` 核对：除「改动范围」表内文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单文件；提交信息用施工单给定文案
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。