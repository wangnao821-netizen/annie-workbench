# 任务：执行 WO-28 技能包系统施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告，不要带病交付。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试、alembic 都用它，裸 alembic 不在 PATH）
- 施工单：docs\flash_specs\wo-28-skill-package.md（**唯一契约**）
- 背景草案：docs\技能包架构草案.md
- 前置单（WO-26b/26c/27）已验收；当前基线以最新 `pytest tests/ -q` 结果为准

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件；严禁修改 config/agent_flows/*.yaml、core/chat/loop.py、server/api/schemas.py 之外的既有 schema 语义、前端 ui/ 目录
2. 人闸：AI 提议只生成 draft，**绝不自动激活**；激活必须 Vera 显式操作，测试必须覆盖
3. 白名单强制：manifest.steps[].tool 必须 ∈ 现有工具白名单（core/agents/flows.py），违规创建返回 422
4. 技能无任意代码执行：assets 只能是数据（提示词/邮件模板），拒绝可执行脚本字段
5. 新代码文件 ≤200 行；迁移用 batch 模式；新增列可空
6. 契约先行：字段名按施工单/草案写死，禁止改名或简化

## 实施步骤
1. 读施工单 + 草案 + 相关现状：core/models/orm.py、server/api/schemas.py、server/main.py、core/agents/flows.py
2. 先写迁移（skill_versions 表）+ ORM 模型 → `alembic upgrade head` 验证通过
3. 实现 core/skills/manifest.py（Pydantic schema 校验）→ core/skills/registry.py（CRUD / 状态机 draft→active→deprecated / 版本回滚 / 白名单强制）
4. 实现 server/api/skills.py（列表/详情/创建 draft/更新新版本/激活/停用/回滚/提议）+ 注册路由 + schemas
5. 写测试：tests/test_core/test_skill_manifest.py（≥8）、tests/test_api/test_skill_endpoints.py（≥8），必须含红线用例（不自动激活、白名单违规 422、非 Vera 确认无法激活）
6. 跑全部门禁，写交付报告，提交

## 门禁（全绿才算完成）
- 专项 16 用例全绿；`pytest tests/ -q` → 最新基线 + 新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- `alembic upgrade head` 成功；skill_versions 表就位；`alembic current` = 最新 head
- TestClient：技能 CRUD + 提议→确认闭环全通（冒烟脚本用 UTF-8 保存，避免中文乱码）
- `git diff` 核对：除「改动范围」表内文件外零改动

## 提交
- 只 stage 本单文件；提交信息用施工单给定文案
- 提交后输出交付报告：改动文件清单 + 行数、迁移结果、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，说明卡点，不要自行扩大范围。