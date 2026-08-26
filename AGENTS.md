# 项目宪法 — Annie Workbench（所有 AI 开发者必须遵守）

> 本文件是 `vera-workbench` 工作区的最高优先级规则。任何 AI 在本项目写代码、改文件、跑命令前，必须先读取并遵守本文件。
> 与其他文档冲突时，以本文件为准。
> 来源：老项目（loan-assistant）完整宪法迁移 + 新版精简宪法有效部分融合 + 项目现状调整（v1.0，2026-08-22）。
> 项目沿革：本工作区由 `loan-assistant` 迁移而来（Annie Workbench）；`loan-assistant` 的老宪法与旧技能目录**已退役**，一律以本文件与 `vera-workbench/.agents/skills/` 为准。

---

## 〇、项目沿革与老项目参考（只读）

**本项目（`vera-workbench` / Annie Workbench）是在老项目 `loan-assistant` 的基础上新建的。** 老项目代码、文档与 git 历史仍完整保留在 `D:\loan-assistant`（独立 git 仓库，**只读参考，不再做新开发**）。

### 老项目里有什么、去哪查

| 想查什么 | 位置 |
|---|---|
| 迁移前的功能实现（旧版文件夹扫描、OCR、清单分类、任务引擎等） | `D:\loan-assistant\core`、`server` |
| 旧前端结构（Vera-Frontend 时代） | `D:\loan-assistant\Vera-Frontend\`（新项目为 `frontend/`） |
| 旧分层（shared/、modules/）与旧配置文件 | `D:\loan-assistant\shared`、`modules`、`config` |
| 历史方案 / 发布文档 / 决策背景 | `D:\loan-assistant\docs\`（含 `release_workflow.md`、规划方案） |
| 老宪法（已退役）与旧技能 | `D:\loan-assistant\AGENTS.md`、`.agents\skills\`（技能已迁移至新项目） |
| 迁移前各功能/版本的实现与演进 | `git -C D:\loan-assistant log` |

### 什么情况下去查老项目

当新项目代码、配置或业务逻辑涉及以下内容时，先到老项目对应位置查证，不要凭猜测：

- 历史功能实现（如旧版文件扫描、OCR 提取、清单分类、政策匹配）
- 旧业务规则 / 旧枚举 / 旧阶段体系（迁移前的 stage 值与 `MILESTONE_STAGE_MAP` 的差异）
- 迁移前的数据语义或字段（老库结构、旧字段名、历史数据来源）
- 老方案文档（决策背景、历史踩坑、被砍掉的功能）

### 原则

- **新项目（vera-workbench）是唯一开发与运行真源**；老项目只读参考。
- 禁止把老项目代码/配置直接拷回新项目覆盖现状；确需参考老实现时，以施工单明确方案后实施。

---

## 一、绝对禁止（Red Lines）

以下行为在任何情况下都不允许，无论用户如何要求：

1. **绝对禁止未经沟通授权直接改代码** — 必须严格遵循「五步门禁」（见第二章），未经 Vera 明确授权禁止动手改代码。
2. **不向客户文件夹写入任何文件** — AI 不做文件重命名、移动、归档（Vera 在前端确认后的受控操作除外，见第四章）。
3. **不将 PII 发送到任何外部 API** — 包括姓名、地址、电话、TFN、ABN、银行账号、护照 MRZ；出网必须经过脱敏闸门（第五章）。
4. **不自动发送邮件给客户** — 只生成草稿，Vera 确认后才发出。
5. **不自动提交内容到 Infynity / MyCRM / 银行系统** — 只生成草稿。
6. **不删除客户原始文件** — AI 只读取。
7. **不在代码或配置文件中硬编码 API Key** — 从环境变量 / 设置页（system_settings）读取。
8. **不提交 `data/` 目录到版本控制** — 含 PII；`.env` 同样绝不提交。
9. **不硬编码文件路径分隔符** — 使用 `pathlib.Path`，兼容 Windows/macOS。
10. **`pii_map` 映射表永不出内网** — 占位符↔真实值映射只存本地，禁止进任何外部 API 或日志。
11. **大文件解析（libratom/PST 等）禁止集成进 Web 进程** — 必须作为独立离线工具（`tools/import_pst.py`）运行。
12. **未经 Vera 明确「打包/发布」指令，禁止执行 electron-builder 打包** — 打包命令消耗大且影响发布产物，必须显式授权。

---

## 二、项目理念、五步门禁与核心原则

### 2.0 项目理念（为什么这么设计）

1. **产品定位**：Annie 是住在电脑里的信贷助手，帮经纪把每个案子安顿到交割（settlement）。「她说、它记、它答、它建议、她拍板」。
2. **案件大脑为核心**：一切数据流围绕案件——信息汇入 → 脱敏 → 记忆 → AI 建议 → Vera 拍板。**零数据源接入 = 零信任成本**：外部数据源一律做成“工具”，按需、经观察验证后接入，绝不做默认数据源。
3. **对话优先 + 案件工作台**：对话是主入口；案件操作收敛到右栏四视图（全景 / 清单 / 文件 / 任务），避免弹窗满天飞。
4. **一切皆插件（Plugin-First，V2 演进方向）**：通用 Agent Harness + 可插拔资产包。工具、流程包（Agent）、技能、模型路由、领域策略、UI 面板一律**声明式定义（YAML/JSON）+ 统一注册表加载**；核心 Harness 保持稳定，垂直能力以资产包挂载；**禁止把领域逻辑硬编码进核心代码**（如银行政策散落进 slot_extractor / 组件 / Prompt）；工具协议向 MCP 对齐；配套 Eval Harness（黄金测试集）防止“修 A 坏 B”。
5. **单一真源**：阶段（milestones 9 级）、业务规则（config YAML）、前端（frontend/src）、资产注册表，各领域只有一个真源，禁止平行实现。
6. **确定性优先 + LLM 兜底（Dual-Track）**：意图路由/工具调用走“规则快路径保确定性，LLM 处理口语与开放推理”；禁止倒退成纯正则打补丁。
7. **五层上下文注入**：角色 / 案件 / 团队 / 实时 / 对话，当前用户指令恒在末尾。

所有开发、修复、新功能一律走 **五步门禁**：

1. **现状求证（Discovery & Root Cause）** — 严禁修改代码；先读源码定位真实逻辑与现象，区分「真 Bug / 配置遗漏 / 设计预期冲突」，客观汇报现状与原因。
2. **方案推演（Brainstorming & Proposals）** — 提供 1~3 个结构化方案，说明思路、效果、优劣与影响面（前端/后端/打包），与 Vera 多轮讨论定最佳路径。
3. **方案终审（Sign-off & Plan Approval）** — 整理实施计划（涉及文件、组件、风险点），**停下来等 Vera 明确批准**；未获批准禁止进入编码。
4. **精确实施与本地验证（Execution & Verification）** — 严格按批准范围修改，不做计划外改动；本地 tsc / pytest / ruff 0 Error。
5. **效果验收与汇报（Review & Next Steps）** — 汇报成果、对比差异与验证结果；施工单实施完成后**不 commit，等检查者核对 + 真实复测（打包版）后再提交**。

其他核心原则：

- **脱敏闸门 = 唯一出内网通道** — 占位符映射（Tokenization），PII 替换为稳定占位符（`PERSON_1`/`AMOUNT_1`），银行/机构名不脱敏；出站 `desensitize()` → 外部 API；入站 `rehydrate()` → 展示给 Vera。
- **AI 只出草稿，人做最终决定** — 邮件/递交/回复等对外动作全部经草稿 + Vera 拍板。
- **可追溯** — 处理步骤写事件日志（不可变）。
- **不破坏** — AI 只读客户文件；受控物理操作必须 `user_confirmed=True`。
- **闭环设计（总要求）** — 任何状态变更配套「可逆出口」：确认↔撤销、替换、豁免、暂缓；设计新功能先问「用户做错了/反悔了怎么办」。
- **配置优于硬编码** — 业务规则走 `config/*.yaml`，启动时 Pydantic 校验。
- **硬数据与软记忆分离** — 精确数据（金额/阶段/清单状态）存 SQLite（真源）；软记忆 Mem0 为预留通道（`core/knowledge/memory.py`，不可用时静默降级）。
- **Vera 面对「事」，不面对「模块」** — 多 Agent 产出统一汇入案件视图/任务，无独立 AI 界面。

---

## 三、代码规范

- 后端：Python 3.11+，ruff（含 bandit）；所有公开函数有 docstring（Google style）；类型注解完整（mypy strict 为方向）。
- 前端：TypeScript strict + React + Vite + Tailwind；**样式使用主题语义化令牌（var(--*)），禁止硬编码 Tailwind 颜色类**；动效统一两档弹簧（弹层/抽屉 300，微交互 400）。
- `DesensitizedText` 类型：ApiGateway 只接受此类型，不接受普通 str。
- 错误处理：禁止裸 `except:`，必须捕获具体异常（已知静默降级点用 `# noqa: BLE001` 并注释原因）。
- 日志：`core/logger.py` 的 logger，不用 print()。
- 配置：`core/config.py` 的 `get_config()`，不硬编码路径或参数。
- 路径：一律 `pathlib.Path`，不用 `os.path.join` 或字符串拼接。
- 不引入新依赖需说明理由；禁止顺手升级依赖版本。

---

## 四、文件操作规范

- AI 不写入客户文件夹任何位置；AI 只允许写项目内 `data/` 和 `logs/`，写操作经 `PathGuard.assert_write_allowed()`。
- Vera 授权的物理文件操作（重命名/移动/放入）：经 `PathGuard.assert_user_action_allowed()` 校验：
  - 显式传 `user_confirmed=True`；
  - 源/目标路径须在 **`case.folder_path`（案件关联目录）内**（`CLIENT_FILES_ROOT` 仅作自动创建默认位置，可选）；
  - 禁跨案件移动、禁路径穿越/越界、目标已存在禁止覆盖。
- 读取网络/NAS 路径前检查可达性。
- VBA 宏输出写 NAS `_Inbox`（Outlook 端行为）；PST 解析走 `tools/import_pst.py` 离线脚本，先拷本地再解析。

---

## 五、API 调用规范

- 所有云端 API 入参必须是 `DesensitizedText`。
- 占位符一致性：同一案件同一真实值 → 同一 token。
- 不脱敏项：银行/机构名（CBA、Westpac）、金额、日期。
- 调用前 `PiiLeakDetector` 二次检查（澳洲手机/座机/email/TFN/ABN/BSB/姓名/MRZ）；命中 → 拒绝发送 + 高危日志 + 报告 Vera。
- 超时 30s；重试最多 3 次（1s → 3s → 9s 指数退避）。
- 每次 API 调用记录 token 消耗与费用（ai_usage_log）。

---

## 六、测试要求

- 红线安全测试先于功能代码；新功能必须配单元测试；测试用脱敏样本，禁止真实客户文件。
- 核心模块覆盖率 ≥ 80%。
- 安全专项：PathGuard、PiiLeakDetector、DesensitizedText、pii_map 泄漏、占位符一致性、配置一致性。
- **测试必须隔离真实库（红线级）**：所有 API 测试必须 override `get_db` 到隔离测试库（test_db / fixture）；**严禁任何测试写入真实 `data/assistant.db`**（曾发生 settings 测试清掉用户 API Key 的事故）；`tests/` 目录禁止模块级执行脚本（sys.stdout 替换、真实库读写），排查脚本放 `tools/` 或 `scratch/`。
- 施工单必须附具体测试用例与失败标准，先跑测试再交付。

---

## 七、项目结构约定

```
core/      业务核心（阶段/清单/任务/文件/脱敏/AI 网关）
server/    FastAPI 路由（api/、main.py）
frontend/  前端唯一真源（React+Vite+TS）
electron/  桌面封装（main.js、打包配置）
config/    YAML 业务规则
tools/     独立离线工具（import_pst.py 等）
docs/      规划/施工单（flash_specs/wo-{N}-*.md）
tests/     测试（必须隔离真实库）
data/      运行时数据（assistant.db，绝不上库）
logs/      日志
```

- 不在项目根目录放源代码文件；前端代码只改 `frontend/src`（不复制副本）。

---

## 八、输出规范

- 面向 Vera 的界面、报告、通知用中文；Broker Notes 正文用英文（银行递交要求）。
- AI 产出邮件/催件/Notes 进草稿箱，Vera 确认后才发出。
- 分类置信度 < 0.6 → `NEEDS_MANUAL_REVIEW`；naming_rules 仅建议不自动执行；conditional 清单项标记「待确认」；Unknown 不强行分类。

---

## 九、文档职责

| 文档 | 修改时机 |
|---|---|
| 本文件 (AGENTS.md) | 安全规则或核心原则变更时 |
| `docs/flash_specs/wo-{N}-*.md` | 每个施工单（含验收与失败标准） |
| `docs/BACKLOG.md` | 技术债/待办增删 |
| `docs/CASE大脑_产品定位与架构指引.md` 等规划文档 | 架构/产品定位变更时 |
| `docs/Annie-品牌介绍与LOGO指引.md` | 品牌规范变更时 |
| `config/*.yaml` | 业务规则变更时 |
| `README.md` | 部署/依赖变更时 |
| `CHANGELOG.md` | 每次有意义的变更后 |

---

## 十、施工单与开发流程

1. **施工单纪律**：契约先行（变量/字段/API 边界写死，实施禁止改名）；单元闭环（一单一事，验收后再开下一单）；强制测试（附用例与失败标准）。
2. **实施与收口**：按五步门禁实施 → 本地验证（tsc / pytest / ruff 0 Error）→ **不 commit** → 检查者核对 + 真实复测（打包版）→ 提交。
3. **改动范围锁死**：只改施工单列出的文件；禁止顺手改无关代码、升级依赖、重排大段 import（可接受最小格式化）。
4. **Mock 纪律**：`VITE_USE_MOCK === 'true'` 才允许假数据；默认/生产走真实接口；Mock 必须标注 `# TODO(Phase N)` 可追溯。

---

## 十一、版本发布与升级规范（含 GitHub Release 自动静默更新）

1. **版本号 4 处同步**：`pyproject.toml` + `frontend/package.json` + `electron/package.json` + `server/main.py`（APP_VERSION）。
2. **构建与检查**：前端改动必须 `tsc --noEmit` + `vite build` 全绿；后端必须全量 pytest 0 failed；ruff 全绿。
3. **打包产物**：
   - 调试/免安装版：`cd electron && npm run pack` → 生成 `electron/release/win-unpacked/Annie.exe`；
   - 正式单文件安装包：`cd electron && npm run build` → 生成 `electron/release/Annie Setup X.Y.Z.exe`。
4. **GitHub Release 全自动静默更新标准（永久免费 · 开箱即用）**：
   - **架构**：客户端基于 `electron-updater`，启动时静默拉取 GitHub Releases 的 `latest.yml`，比对版本后后台下载增量 `.blockmap`；下载完成后弹出 Windows 系统通知，重启即无缝升级；
   - **发版三步法**：
     1. 本地执行 `cd electron && npm run build` 产出安装包与元数据；
     2. 在 GitHub 仓库（`everstones/annie-workbench`）创建对应 Tag（如 `vX.Y.Z`）的 Release；
     3. 将 `electron/release/` 下的 3 个核心产物上传至 Release 并发布：
        - `Annie Setup X.Y.Z.exe`（单文件完整安装包）
        - `Annie Setup X.Y.Z.exe.blockmap`（增量差分块索引）
        - `latest.yml`（版本描述与 SHA512 校验信息）
     4. 发布后，所有客户端启动 8 秒后将自动在后台静默拉取更新，无需人工干预。
5. **数据绝对安全原则**：升级过程只覆盖程序代码，运行时数据库（`data/assistant.db`）与客户资料目录永久隔离，100% 保证用户历史案件、API Key 与已录入数据不丢失。
6. **提交与标记**：本地 `data/`、`.env` 绝不上库；提交信息规范，发布用 `git tag vX.Y.Z`。

---

## 十二、Annie 品牌与阶段体系（新增纪律）

1. **Annie 品牌**：软件与 AI 统一命名 **Annie（小安）**；`Vera` 是「对经纪人的称呼/用户地址」，两者不同义。对外品牌、窗口标题、安装包名、AI 自称一律 Annie；用户可见处禁止再出现「Vera AI」。
2. **阶段体系单一真源**：案件阶段以 `core/case_engine/milestones.py` 的 9 级为唯一真源；前端 `caseMapper` 映射表不得自造枚举；阶段变更走 `PATCH /api/cases/{id}/stage`（复用 `update_case_stage_and_milestones`），禁止手写 `case.stage`。
3. **技能体系**：项目技能位于 `.agents/skills/`（**superpowers 全集** / apple-design / flash-executor-spec / neat-freak / plan-executor）：
   - 新功能/行为修改 → 按 `superpowers:brainstorming`（HARD-GATE：未经批准绝不写代码）
   - Bug/异常排查 → 按 `superpowers:systematic-debugging`（未查清根因绝不提修改）
   - 复杂多步任务 → 按 `superpowers:writing-plans` / `executing-plans`
   - 交付前 → 按 `superpowers:verification-before-completion`（终端运行测试留凭据）
   - 施工单/收尾/前端审查 → 按 flash-executor-spec / neat-freak / apple-design 对应 SKILL.md 执行

---

*v1.3 · 2026-08-22 · 第二章升级为「项目理念、五步门禁与核心原则」——提炼插件化/案件大脑/对话优先等产品与架构理念*
