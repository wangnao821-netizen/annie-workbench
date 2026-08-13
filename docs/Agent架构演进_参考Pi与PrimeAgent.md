# Agent 架构演进 — 参考 Pi / Prime Agent

> 状态：决策参考（方向已定稿，待实施）
> 日期：2026-08-13
> 来源：GitHub 调研（earendil-works/pi、PrimeIntellect-ai/prime-agent）+ Gemini 对比分析（docs/agent对比分析.md）+ Codex 复核
> 关联：docs/技能包架构草案.md、docs/flash_specs/wo-26b-pydantic-ai.md

## 一、背景与澄清

用户提出参考 "Pi Agent / Prime Agent" 演进我们的 Agent 体系。先澄清两个容易混淆的概念：

- **Pydantic AI**（WO-26b 将引入的 Python 编排库）≠ **Pi / Prime Agent**。前者是"后端 Agent 执行引擎"，后两者是 GitHub 上的开源"编程 Agent 平台/产品"（Node 生态）。二者定位互补：**引擎用 Pydantic AI，交互与业务架构参考 Pi / Prime Agent**。

## 二、Pi 与 Prime Agent 是什么

### 2.1 Pi（earendil-works/pi）

- MIT 协议，报道约 8.6 万 star；一句话：**"给你造 AI 助手的工厂，而不是给你一个 AI 助手"**（Claude Code 是"给你一个 AI 助手"）。
- Monorepo：`pi-ai`（统一 20+ 家模型 API）、`pi-agent-core`（Agent 运行时）、`pi-coding-agent`（CLI）、`pi-tui`（终端 UI）、`pi-telemetry`（遥测契约）、`pi-web-ui`、`pi-chat`（Slack 自动化）。
- **极简底座**：默认只给模型 4 个工具——读文件、写文件、改文件、执行命令；其余能力全部通过扩展（extension/skill/package）按需安装。
- **DeepSeek 原生适配**：保留 `reasoning_content`、推理强度映射到 DeepSeek 思考级别；配合"提示词/工具定义稳定 + 会话只向后追加"，用户实测缓存命中率 99.9%+。Composio 用 DeepSeek V4 Flash 横向测 8 款 Harness：Pi 平均约 $0.028/成功任务，Claude Code 约为其 7 倍（量子位/Composio 报道数据）。

### 2.2 Prime Agent（PrimeIntellect-ai/prime-agent）

- 官方明确：**构建在 Pi 之上**的"自我改进 RLM Agent"，面向编程/研究长任务。
- 两大抽象：**RLM**（上下文即变量 `prompt-as-a-variable`；子代理即函数调用 `rlm(...)`）+ **Continual Harness**（持久保存补充提示词/记忆/技能描述，`/refine` 可做小步证据化更新并回滚）。
- 特性：persistent IPython 作为主工具；`rlm()` 派生真子代理（并行/后台）；daemon 后台续跑、heartbeat/定时、持久目标、带预算的 autonomous 模式（质量闸门）；agent-to-agent 直接通信；技能=可导入的 Python 包。
- 警告：它不是安全沙箱，会以用户权限执行模型生成的代码。

### 2.3 定位结论

Pi / Prime Agent 是 **Node 生态的编程 Agent 平台**，不能直接嵌入我们的 Python/FastAPI 后端；但它们的**设计哲学**几乎每条都命中我们的需求，值得逐条吸收。

## 三、核心设计理念（7 条）

1. **极简底座 + 可组合扩展**：核心只留会话循环、模型接驳、工具调用；能力按需装配。
2. **上下文即变量（RLM）**：步骤中间产物像变量一样在程序中流转，而不是全塞进全局 Prompt 字符串。
3. **全链路 Hooks**：四层状态机（Session → Agent 外循环 → 内循环 → 工具管道 → Provider），25+ 事件；`tool_call` 可 block、`tool_result` 可改写、`before_provider_request` 可注入、`session_shutdown` 可审计。
4. **会话生命周期显式化**：创建/恢复/分叉/切换/压缩/结束都是显式状态转换，每个转换都有 hook（如压缩前自定义摘要）。
5. **DeepSeek 缓存友好**：系统提示词与工具定义字节级稳定、会话只向后追加不回头改、保留 reasoning_content → 缓存命中率 99.9%+。
6. **后台长任务与调度**：daemon 续跑、heartbeat、定时、持久目标、预算 + 质量闸门。
7. **自我改进（/refine）**：经验写回 harness 状态、可回滚；社区对 RLM 刷榜有争议，需谨慎。

## 四、我们的现状对照（WO-26 / WO-26b 视角）

| 维度 | 已有 | 差距 |
| --- | --- | --- |
| 工具白名单 | 4 个：declaration_check / calculator_assess / policy_check / context_event_write | runner 内 if/elif 硬编码，工具未真正"注册" |
| 流程包 | YAML 声明式（triggers/presentation/steps） | YAML 已声明 `params: $arg.x` 与 `output:`，但 runner **未解析接线**；chat/loop.py 里 `args = {}` 写死 |
| 呈现分类 | result_card / dialog | 卡片 payload 无版本，状态联动未做 |
| 触发 | 规则触发（正则） | 无语义触发、无触发参数抽取 |
| 会话 | 线性 CaseChatMessage | 无 parent_message_id / 分支 / 版本链 |
| 用量 | AiUsageLog 已记 prompt_cache_hit_tokens | 流程包路径不调 LLM，用量空白 |
| 合规 | 白名单 + 降级 | 无工具级参数校验/确认闸门，合规逻辑分散 |
| 调度 | Phase 2 APScheduler（备份等） | 未用于业务流程（催件/跟进） |

## 五、采纳判定（逐条）

| # | 借鉴点 | 判定 | 落地 |
| --- | --- | --- | --- |
| 1 | DeepSeek 缓存友好 | ✅ 采纳（最高优先） | WO-26b：提示词/工具定义字节级稳定、只追加不重排；flow 路径补 AiUsageLog（缓存命中 token） |
| 2 | 全链路 Hooks（合规闸门） | ✅ 取其价值子集，砍通用框架 | WO-26b：工具参数校验 + 确认钩子（含扫描/读文件类强制 Vera 显式指定路径）；通用 before/after/on_error 钩子框架**不单列**（价值已被覆盖，V2 可不做） |
| 3 | 上下文显式流转 | ✅ 采纳 | WO-26c：StepContext 显式契约（解析 `$arg/$step.output`），不搞隐式变量池 |
| 4 | 会话版本链 + 一层分叉 | ✅ 采纳（简化版） | WO-27：CaseChatMessage + parent_message_id/branch_label；V1-V3 版本链 + 方案 A/B 对比卡；不做树导航 |
| 5 | 定时后台流程 | ✅ 采纳 | 催件/跟进/OS 回复：APScheduler 定时触发流程包 → 草稿进 Action Inbox；**不做 autonomous 自动完成** |
| 6 | 子代理 / 子流程 | ⏳ 后置 | 先做"流程包互相调用"，再评估 agent-to-agent |
| 7 | 动态生成 / 自我改进 | ✅ 人闸采纳 | AI 提议技能/规则 → Vera 确认 → 入库；拒绝 AI 自主改配置（见技能包架构草案） |
| 8 | 状态卡片 | ✅ 采纳 | 提交 → 重跑 flow → 替换卡片 payload；payload 版本化；V1 不流式 |

## 六、Gemini 对比分析（docs/agent对比分析.md）的采纳判定

Gemini 提出 4 个改进点，逐一判定：

| Gemini 建议 | 判定 | 说明 |
| --- | --- | --- |
| 1. FlowContextPool 数据流转 | ✅ 采纳 | 但要"显式契约"（YAML 声明 inputs/outputs），不做隐式魔法变量池；Pydantic AI `RunContext[Deps]` 原生支持 |
| 2. 树状分支对话 | ✅ 概念采纳 | 砍成"版本链 + 一层分叉"；Vera 不需要树导航，需要 V1/V2/V3 + 方案 A/B 对比 |
| 3. 动态生成流程包 | ⚠️ 人闸采纳 | 拒绝"AI 自主生成配置"；改为 Vera 手动创作 + AI 提议→确认 |
| 4. 状态卡片双向联动 | ✅ 采纳 | 做"提交→重跑→替换"，不做实时双向绑定；payload 版本化 |

**Gemini 遗漏的三点**（Pi 最值钱的）：
1. DeepSeek 缓存友好（成本量级差异，最高优先）；
2. Hooks 合规闸门（tool_call 可 block = 红线落点）；
3. 定时后台流程（催件/跟进/OS 回复）。

## 七、明确不采纳 / 不照搬

| 项 | 原因 |
| --- | --- |
| persistent IPython 任意代码执行 | 违反红线；我们的"工具"必须是固定业务函数 |
| Pi 无内置权限系统（以启动者权限运行） | 我们有更强的 PathGuard / PII / 草稿闸门 |
| 引入 Node harness 依赖 | 语言栈不符；只借鉴设计，不引入依赖 |
| 树状导航 UI | 过度设计，Vera 认知负担 |
| AI 自主生成/修改配置（/refine 无闸） | 违反人闸决策；RLM 自我改进有争议 |
| autonomous 自动完成任务 | 红线要求人做最终决定；只做"自动触发 + 草稿 + 提醒" |

## 八、Pydantic AI 能力边界与采纳分档（Vera 定稿 2026-08-13）

- **V1 原则（WO-26b）**：只吃 Pydantic AI 核心能力——结构化输出、依赖注入、工具注册、降级回退；**不碰 Harness / MCP / Logfire 等重件**，保持依赖面小（唯一新依赖 = pydantic-ai 本体，版本锁定）。
- **能力对照 10 条分档（Vera 定稿）**：**1/2/3/6/10 进 WO-26b**；**4/5/7/8/9 按需排 WO-27+**（完整清单见下节）。
- **WO-26b 施工单显式补**：**工具参数校验 + 确认钩子**（确认钩子含：扫描/读文件类强制 Vera 显式指定路径；已同步写入 docs/flash_specs/wo-26b-pydantic-ai.md §技术约束/§三/§五/§六）。

### 对照清单（10 条，Vera 定稿 2026-08-13）

| # | 提升点 | 要点 | 分档 |
| --- | --- | --- | --- |
| 1 | 流程包 = 天然 Capability | flow YAML 直接映射为 Pydantic AI capability（id/description/instructions/toolset），不手写逐 step runner——少写一半胶水 | WO-26b |
| 2 | 意图路由升级 | 关键词规则 → LLM 从流程包目录选一个 + 规则兜底（ToolSearch 思路），触发更准、规则保底 | WO-26b |
| 3 | 结构化输出 | flow 结果用 Pydantic 模型约束（findings / calculator result），替代手写 dict——卡片契约稳、前端消费安全 | WO-26b |
| 4 | 多 Agent 编排 | 复杂链路（建档→清单预选→政策提示；申报检查→解释信草稿）用 Agent 委托/子 Agent 串，不重写 runner | WO-27+ 按需 |
| 5 | MCP 接入工具包 | 文件系统/日历/邮件进度等工具准入候选，经本地 MCP server 接入（路径守卫、只读在 server 内）；红线不变：本地、脱敏、不越界 | WO-27+ 按需 |
| 6 | 依赖注入 | deps_type 把 db/case 上下文注入工具，替代手动传参；测试模式更规范 | WO-26b |
| 7 | 验收自动化 | Pydantic Evals 用真实案例做代码化回归，把 flow YAML 留空的 acceptance 填起来——"Agent 也要验收测试" | WO-27+ 按需 |
| 8 | 观测闭环 | token/延迟/provider 路由（DeepSeek↔Gemini）/缓存命中接到 ai_usage_log——"测量工具只预警不限额"落地 | WO-27+ 按需 |
| 9 | 确认点前移 | confirm_required 从"事后卡片"改为"工具执行前暂停等确认"（共创类弹窗骨架），比事后更安全 | WO-27+ 按需 |
| 10 | 降级双轴 → 三轴 | provider 降级（§十 #10 已定）+ 能力降级（LLM 路由→规则路由）+ 执行器降级（PAI→轻量），健康探测统一管理 | WO-26b |

### 风险提醒（最重要，已落实进 WO-26b 施工单）

Pydantic AI 的工具调用是 **LLM 驱动**的——比规则灵活，但不可控面也变大。引入它最大的风险不是"跑不起来"，而是**模型自作主张调工具**（比如扫了不该扫的路径、改了不该改的东西）。因此 WO-26b 除脱敏红线外，显式要求：

1. **工具参数 schema 校验**——非法参数拒绝执行（已入施工单 §三/§五/§六）；
2. **扫描/读文件类工具强制 Vera 显式指定路径**——默认拒绝（已入施工单确认钩子）；
3. **confirm_required 工具级拦截**——执行前暂停等确认（已入施工单确认钩子）。
### 决策复盘：为什么当初 WO-26b 只选核心几条

1. **施工单纪律（一单只做一件事）**：WO-26b 目标是"替换执行内核、接口契约不变"，把 10 条全塞进去会让单子爆炸、验收面失控；
2. **前置依赖**：多 Agent 需多步流程、确认点前移需 dialog 流程、Evals 需真实用例集、MCP 需工具准入三关明确——当时都不具备；
3. **依赖面与风险控制**：MCP/Logfire/Harness 是重件；LLM 驱动工具调用本身有不可控面，V1 先钉死闸门（参数校验/确认钩子/路径强制）；
4. **流程疏漏（如实记录）**：当时只写了"核心 4 条"，没有把"为什么其他 6 条不进 26b"逐条落盘——本清单与分档即是补上这个决策记录缺口。

### 实施注记（#2 意图路由升级）

- 分档记录为 WO-26b，但**实际施工单范围未含**（受"对话路由不变"约束）；建议独立小单（WO-26c 或 WO-27 前置），**待 Vera 确认**。
- "WO-27+ 按需"即对应主文档 §十四 V2 延后清单；延后项以主文档为准。

## 九、结论与落地映射

| 单 | 内容 | 吸收点 |
| --- | --- | --- |
| WO-26b（已建单） | Pydantic AI 编排内核 + 模型路由（DeepSeek 默认/Gemini 英文）+ 脱敏红线 + 版本锁定 | #1 缓存纪律、工具参数校验 + 确认钩子（#2 价值子集）、flow 路径用量 |
| WO-26c（待开） | StepContext 显式契约 + 多步流程 | #3 |
| WO-27（待开） | 三个 dialog 共创流程（邮件/催件/OS 回复）+ 版本链 + CardSchema | #4、#8 |
| WO-28（待开） | 技能包系统（schema/注册表/CRUD/版本回滚/AI 提议→确认） | #7 + SKILL |
| 后续（V2，主文档 §十四） | 语义触发、流程包互调、技能定时属性 | #5、#6 |

## 十、参考

- https://github.com/earendil-works/pi
- https://github.com/PrimeIntellect-ai/prime-agent
- docs/agent对比分析.md（Gemini）
- 量子位报道：缓存命中率 99.93%，Composio 8 款 Harness 横测
- docs/技能包架构草案.md（本系列落地设计）