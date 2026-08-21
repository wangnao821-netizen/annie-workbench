# 项目宪法调整草案 —— 老宪法迁移至 Annie 项目（对照现状）

> 状态：草案（待 Vera 审阅确认后合并进 `vera-workbench/AGENTS.md`）
> 背景：老项目（loan-assistant）完整宪法未随项目迁移；新项目当前 AGENTS.md 仅有协作流程（2.6KB），缺安全红线与工程规范。本草案 = 老宪法安全核心 + 新项目（Annie Workbench）现状调整。

---

## 一、总体策略

新宪法 = **老宪法安全红线（全保留）+ 新版精简宪法的有效部分（融合）+ 工程规范（按新项目结构调整）+ 新增现状条款**。
老宪法文件退役（保留在 loan-assistant 作历史），新项目以 `vera-workbench/AGENTS.md` 为唯一宪法。

> **关于新版精简宪法（2.6KB）三部分内容的处理决定：**
> 1. **五步门禁流程**（现状求证→方案推演→终审→实施验证→验收汇报）→ **保留并融合**为最终宪法主流程（老宪法“四步”升级为“五步”，补上实施验证与验收环节）。
> 2. **superpowers 联动** → **不保留原文**（`vera-workbench/.agents/skills` 未迁移，引用落空），替换为“施工单工作流 + 检查者核对 + 真实复测”；技能迁移后再恢复。
> 3. **三条红线**（抢跑编码/擅自打包/盲目修补）→ **保留并升级**：抢跑编码、盲目修补并入红线 1/铁律流程；“擅自打包”升级为**新增正式红线**（老宪法无此条）。

---

## 二、保留条款（安全核心，一字不改）

| # | 条款 | 说明 |
|---|---|---|
| 红线 1-10 | 未经授权不改代码 / 不写客户文件夹 / PII 不出网 / 只出草稿不自动发邮件 / 不自动提交 Infynity·MyCRM·银行 / 不删客户原始文件 / 不硬编码 API Key / 不提交 data/ / pathlib / pii_map 永不出内网 | 全部保留 |
| 红线 11 | 大文件解析（libratom/PST）独立离线工具，禁止进 Web 进程 | 保留（`tools/import_pst.py` 存在） |
| **红线 12（新增）** | **未经 Vera 明确“打包/发布”指令，禁止执行 electron-builder 打包**（抢跑编码并入红线 1；盲目修补并入铁律流程） | 新版精简宪法 3 条红线升级并入 |
| 核心原则 | 脱敏闸门（占位符映射）、可追溯（事件日志）、不破坏、闭环设计（可逆出口）、配置优于硬编码、跨平台 | 保留 |
| **主流程（新增列）** | **五步门禁**：现状求证 → 方案推演（1-3 方案对比）→ 终审（等明确批准）→ 精确实施 + 本地验证（tsc/pytest 0 Error）→ 效果验收汇报 | 新版精简宪法五步门禁，融合老宪法铁律流程 |
| API 调用规范 | DesensitizedText 类型强制 / 出入站 desensitize→rehydrate / PiiLeakDetector 二次检查 / 超时 30s / 重试 1s→3s→9s / token 费用记录 | 保留 |
| 测试要求 | 红线测试先行 / 脱敏样本 / 覆盖率 ≥80% / 安全专项测试 / pii_map 泄漏测试 / 配置一致性测试 / 施工单附测试与失败标准 | 保留 |
| 输出规范 | 中文界面 / Broker Notes 英文 / 草稿箱确认 / 置信度<0.6 人工复核 / naming_rules 仅建议 / conditional 待确认 | 保留 |
| 施工单纪律 | 契约先行 / 单元闭环 / 强制测试 | 保留 |

---

## 三、调整条款（对照新项目现状）

### 3.1 代码规范

| 老条款 | 新表述（依据现状） |
|---|---|
| 日志用 `shared/logger.py` | **`core/logger.py`**（新项目无 shared/） |
| 配置用 `shared/config_loader.py` | **`core/config.py` 的 `get_config()`** |
| 项目结构：shared/、modules/<name>/ | 实际结构：**`core/`（业务核心）、`server/`（FastAPI 路由）、`frontend/`（React+Vite+TS）、`electron/`（桌面封装）、`config/`、`tools/`、`docs/`、`tests/`、`data/`、`logs/`**；删除 shared/、modules/、tasks.py/Makefile 条款 |
| 后端 mypy strict | 维持 ruff（含 bandit）；mypy strict 保留为方向性要求 |
| 前端 ESLint+Prettier | 维持；补充：**样式使用主题语义化令牌（var(--*)），禁止硬编码 Tailwind 颜色类；动效统一两档弹簧（弹层 300 / 微交互 400）** |

### 3.2 文件操作规范

| 老条款 | 新表述 |
|---|---|
| `CLIENT_FILES_ROOT` 必须从环境变量读取 | **可选**（WO-29 起）：每案件手动关联任意绝对路径（`case.folder_path`），`CLIENT_FILES_ROOT` 仅作自动创建默认位置 |
| PathGuard 校验“CLIENT_FILES_ROOT 下同一案件子目录内” | 校验范围改为 **`case.folder_path` 内**（或 Vera 确认的目标目录）；仍要求 `user_confirmed=True`、禁穿越/越界、禁覆盖 |
| VBA `_Inbox` / PST 离线解析 | 保留（Outlook 端行为与 `tools/import_pst.py` 不变） |

### 3.3 核心原则（Mem0 / 技能体系）

| 老条款 | 新表述 |
|---|---|
| 硬数据与软记忆分离（Mem0 集成约定） | 原则保留；**Mem0 为预留通道**（`core/knowledge/memory.py` 存在，不可用时静默降级），SQLite 硬数据始终为真源 |
| 强制 Superpowers 技能工作流 | 新项目技能目录未迁移（`vera-workbench/.agents/skills` 为空）→ 调整为**施工单工作流**：发现需求 → 深查根因 → 方案沟通 → 授权 → 实施（不 commit）→ 检查者核对 + 真实复测 → 提交；技能迁移后按技能约定执行 |

### 3.4 版本发布与升级

| 老条款 | 新表述 |
|---|---|
| 版本号 3 处（pyproject/package.json/main.py） | **4 处**：`pyproject.toml` + `frontend/package.json` + `electron/package.json` + `server/main.py`（当前已对齐 2.2.0） |
| 构建与 dist | 维持 V4.3：dist 不入库，`cd electron && npm run build-web` 自动构建；提交前 tsc --noEmit + 全量 pytest |
| 发布产物 | electron-builder 安装包/免安装目录（`npm run build` / `npm run pack`）；**开发期手动同步 win-unpacked 时，resources/web 与 frontend/dist、resources/backend 与源码头必须一致（diff 检查）** |

### 3.5 开发流程与实施计划

| 老条款 | 新表述 |
|---|---|
| Phase 计划经 Antigravity 审查 | **施工单模式**：`docs/flash_specs/wo-{N}-*.md`，含技术约束/改动范围/接口契约/实施步骤/验收/纪律；检查者核对 + 真实复测后提交 |
| 完成有意义阶段直接 git commit | 调整为：**施工单实施完成后不 commit，等检查者核对 + 真实复测（打包版）再提交**（WO-65/66/70 现行模式） |
| 规划方案710.md | 新项目规划文档为 `docs/CASE大脑_产品定位与架构指引.md` 等（710 不存在） |

---

## 四、删除条款（过时）

- `shared/`、`modules/`、`tasks.py`/`Makefile` 结构约定（新项目无对应结构）
- Antigravity 审查（不存在）
- `UI重构规则.md` 文档职责行（新项目无此文档；前端规范见品牌文档/代码规范）

---

## 五、新增条款（新项目现状/教训）

### 5.1 测试必须隔离真实库（新增，红线级）
> 事故教训：`test_settings_ai` 曾直接写真实 `data/assistant.db`，清掉用户 API Key。

- 所有 API 测试必须 `override get_db` 指向隔离测试库（conftest/test_db 或 fixture）
- **严禁任何测试写入真实 `data/assistant.db`**（含 system_settings、cases、actions）
- 测试目录禁止模块级执行脚本（sys.stdout 替换、真实库读写）；排查脚本放 `tools/` 或 `scratch/`，不得进 `tests/` 收集

### 5.2 前端定稿直改（新增）
- 前端代码以仓库 `frontend/src` 为唯一真源，**直接修改（不再经 AI Studio 批次流转）**
- 前端改动必须 `tsc --noEmit` + `vite build` 全绿；发布前同步安装包 `resources/web`
- `VITE_USE_MOCK === 'true'` 才允许假数据，默认/生产走真实接口（门控默认关闭）

### 5.3 Annie 品牌（新增）
- 软件与 AI 统一命名 **Annie（小安）**；`Vera` 是“对经纪人的称呼/用户地址”（保留）
- 对外品牌、窗口标题、安装包名、AI 自称一律 Annie；不引入新的品牌词

### 5.4 阶段体系单一真源（新增）
- 案件阶段以 `core/case_engine/milestones.py` 的 9 级为唯一真源；前端 `caseMapper` 映射表不得自造枚举
- 看板拖拽/阶段变更走 `PATCH /api/cases/{id}/stage`（复用 `update_case_stage_and_milestones`），禁止手写 `case.stage`

### 5.5 施工单收口流程（新增，已列 3.5）
- 每张施工单：实施完成 → **不 commit** → 检查者核对代码/门禁 → 真实复测（打包版）→ 提交

---

## 六、新宪法最终结构建议

1. 绝对禁止（Red Lines）—— 11 条（保留）
2. 核心原则 —— 铁律流程 / 脱敏闸门 / 不破坏 / 闭环设计 / 硬软分离（Mem0 预留）等（调整）
3. 代码规范 —— core/server/frontend/electron 结构 + ruff/tsc + 主题令牌（调整）
4. 文件操作规范 —— case.folder_path + PathGuard（调整）
5. API 调用规范 —— 保留
6. 测试要求 —— 保留 + **5.1 测试隔离**（新增）
7. 项目结构约定 —— 新结构（调整）
8. 输出规范 —— 保留
9. 文档职责 —— 更新为实际文档（施工单/BACKLOG/品牌文档）
10. 施工单与开发流程 —— 施工单模式 + 检查者核对（调整）
11. 版本发布与升级 —— 4 处版本号 + Electron 打包（调整）
12. 新增纪律 —— 5.2 前端直改 / 5.3 Annie 品牌 / 5.4 阶段单一真源

---

*草案版本：v0.1 · 2026-08-22 · 待 Vera 审阅*
