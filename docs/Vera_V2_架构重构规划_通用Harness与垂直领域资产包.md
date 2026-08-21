# Vera Workbench V2 架构重构规划：通用 Harness 底座 + 全栈可插拔资产包（Plugin-First）

> **版本**：2.1.1-PROPOSAL（修订版：从「领域资产包」扩展为「全栈插件化」，对齐 DeepSeek Harness 一切皆插件理念；2026-08-22 补充范式转移评估与底座/自建盘点）
> **更新时间**：2026-08-22
> **定位**：指导 Annie Workbench 从 V1（混合硬编码/单体业务脚本 + 已有插件雏形）向 V2（Universal Agent Harness + 全栈资产包 + Domain Cockpit）演进的总体技术纲领。
> **宪法关系**：本规划落实项目宪法 v1.3「项目理念」第 4 条（一切皆插件 Plugin-First）。

---

## 一、战略背景与重构动因

### 1. 软件范式转移
未来的垂直企业级软件不再是从零手写所有调度逻辑的单体系统，而是：

$$\text{垂直信贷 AI 操作系统} = \text{通用 Agent Harness 底座} \times \text{全栈可插拔资产包} \times \text{金融驾驶舱 (Domain Cockpit)}$$

核心原则：**内核薄、资产厚**。Harness 只负责「加载、调度、安全、评测」，一切能力都是可插拔资产。

### 2. V1 现状与已有插件雏形

**痛点（保留）**：
- 领域资产缝合在代码中：ANZ/CBA/ORDE 等银行政策、审贷偏好和模版散落在 `slot_extractor.py`、`OsStrategyColumn.tsx` 与 Prompt 中，新增银行成本高；
- 工具调用非标准化：自定义 Tool Schema 未对齐 MCP / 标准 Harness Schema；
- 缺乏自动化回归评测（Eval Harness）。

**V1 已有插件雏形（本修订版新增认知）**——不是从零开始，而是收编统一：

| 已有资产形态 | 位置 | 说明 |
|---|---|---|
| 流程包（Agent） | `config/agent_flows/*.yaml` | 天然 capability：instructions + tools + presentation + confirm_required |
| 工具 Schema | `core/chat/tools.py TOOL_SCHEMAS` | 已声明式定义，未对齐 MCP |
| 能力中心 | `config/agents.yaml` | Agent & 工具管理（启用/关闭/版本） |
| 技能（Skills） | `.agents/skills/` | superpowers 全集 + 项目技能 |
| 模型路由 | `config/settings.yaml ai.routing` | provider 切换/前缀路由 |
| 领域策略 | `config/*.yaml`（stage_signals / checklist_master / bank_registry 等） | 已有声明式基础，散落未统一 |

**核心判断**：V2 不是另起一套「领域资产包」，而是把上述 V1 已有资产 + 新资产统一到**同一套资产协议与注册表**之下，真正实现「一切皆插件」。

---

## 二、V2 核心架构：三层 + 统一资产协议

```mermaid
graph TD
    subgraph 1. 表现层: 金融驾驶舱 (Domain Cockpit)
        UI1[Bento 优先级看板 & 任务队列]
        UI2[OS 攻坚双语工作台 & 诚信护栏]
        UI3[右栏四视图: 全景/清单/文件/任务]
        UI4[UI 资产: Deck/卡片可插拔]
    end

    subgraph 2. 调度与安全层: Dual-Track 智能路由器
        FP[⚡ Fast-Path 确定性通道: 状态流转/建任务/排期 - 0.8s 直出]
        HR[🧠 Universal Agent Harness: 多轮反思/工具编排/模型解耦]
        GW[🛡️ 金融合规与诚信拦截器 (Integrity Guardrail)]
    end

    subgraph 3. 统一资产层: 全栈可插拔资产 (Asset Registry)
        R[📦 统一资产注册表: 声明式 YAML/JSON + 版本 + 验收]
        P1[🏦 领域策略资产: policies/checklists/templates]
        P2[🔧 工具资产: MCP/函数 Schema]
        P3[🤖 流程包资产: agent_flows/*.yaml]
        P4[🎓 技能资产: .agents/skills/*]
        P5[🧠 模型资产: provider 路由/模型切换]
        P6[🧪 评测资产: evals/benchmark_cases.jsonl]
    end

    UI1 & UI2 & UI3 & UI4 --> FP
    UI1 & UI2 & UI3 & UI4 --> HR
    HR --> GW
    GW --> R
    R --> P1 & P2 & P3 & P4 & P5 & P6
    HR -.->|自动化质检| P6
```

### 资产协议（Asset Protocol，核心新增）

每种资产统一为声明式定义：

```yaml
asset:
  id: au_mortgage.policy.cba
  type: policy | tool | flow | skill | model | deck | eval   # 全栈类型
  version: 1.2.0
  enabled: true
  schema: <引用统一 Schema 定义>
  acceptance: <验收用例引用>
  meta: { owner, updated_at, status }
```

- **注册表（Registry）**：启动时扫描资产目录，校验声明（Pydantic）、构建索引、提供热插拔（启用/关闭/版本回退）
- **治理**：资产改版必须过验收（Eval）；废弃资产标记不删除；能力中心（V1 已有）升级为资产治理面
- **对齐 MCP**：工具类资产暴露为标准 MCP / OpenAI Tool 协议，模型与底层数据库彻底解耦

---

## 三、全栈资产分类清单

| 资产类型 | 示例 | V1 现状 | V2 动作 |
|---|---|---|---|
| 领域策略 policy | 银行 LVR/缓冲率/自雇核算 | 散落代码+部分 YAML | 收敛为 `policies/*.yaml` 热插拔 |
| 工具 tool | create_task / query_lender_policy / file_ops | TOOL_SCHEMAS 已声明 | 对齐 MCP 协议入注册表 |
| 流程包 flow | declaration_check / followup / os_reply | `agent_flows/*.yaml` 已有 | 纳入统一注册表 + 版本/验收 |
| 技能 skill | superpowers / apple-design / neat-freak | `.agents/skills/` 已有 | 纳入注册表（可随包分发） |
| 模型 model | DeepSeek / Gemini / 本地量化 | routing 已配置 | 资产化（provider 配置即资产） |
| UI 面板 deck | 全景/清单/文件/任务 四视图 | 右栏已实现 | Deck 声明式注册（可插拔卡片） |
| 评测 eval | 200~500 真实信贷案例基准 | 无 | 新建 `evals/` + 一键跑分 |
| 话术模板 template | 催件/OS 回信中英文 | 部分硬编码 | `templates/*.md` 变量注入 |

---

## 四、核心实施模块与任务清单

### 模块 A：领域策略资产包（`assets/au_mortgage/policies/` 等）
- [ ] A-1 银行信贷政策解耦：ORDE/ANZ/CBA/NAB/Westpac 的 LVR、核身口径、自雇核算、缓冲利率抽取为声明式 YAML；新增机构只加文件
- [ ] A-2 双语攻坚/补件模板库：`templates/*.md`，注入 `{client_name}/{lender}/{condition_items}/{evidence_files}`
- [ ] A-3 材料清单与 OCR 拓扑规则：64 项分类、关键字段提取、正反向匹配字典独立打包

### 模块 B：Harness 内核 + 统一资产注册表
- [ ] B-1 资产协议与注册表：定义 `asset` 声明格式、Pydantic 校验、启动扫描与索引、热插拔 API
- [ ] B-2 工具协议标准化：内部工具重构为 MCP / OpenAI Tool 协议，模型与 DB 解耦
- [ ] B-3 流程包收编：`agent_flows/*.yaml` 挂入注册表，带版本与验收
- [ ] B-4 保持 Fast-Path + Harness 混合调度（Dual-Track）：高频确定操作走 Fast-Path；开放推理走 Harness 资产池
- [ ] B-5 诚信护栏拦截管道：Harness 前置/后置中间件，强制拦截无凭证的「已提供材料」虚假声明

### 模块 C：自动化评测基准（Eval Harness）
- [ ] C-1 澳洲信贷黄金测试集：200~500 案例（复杂自雇、海外收入、多套投资房、租金折算、OS 疑难补件）
- [ ] C-2 一键回归：`scripts/run_eval.py` 输出意图命中率/政策匹配率/参数完整度/Token 消耗/响应耗时

### 模块 D：UI 资产化（Domain Cockpit）
- [ ] D-1 右栏四视图 Deck 声明式注册（全景/清单/文件/任务），新增视图不加路由硬编码
- [ ] D-2 卡片类型注册表：tool_cards 按 type 注册渲染器，新增卡片不动主组件

### 模块 E：V1 → V2 渐进迁移路径（不推倒重来）
- [ ] E-1 盘点 V1 资产清单（agent_flows / TOOL_SCHEMAS / skills / config yaml），建立映射表
- [ ] E-2 分批收编：先统一注册表与资产协议（基础层），再逐类迁移（工具 → 流程 → 策略 → UI）
- [ ] E-3 每批过 Eval 回归，保持 Dual-Track 可回退（Fast-Path 不受 Harness 迁移影响）
- [ ] E-4 能力中心升级为资产治理面（启用/关闭/版本/验收）

---

## 五、预期收益与商业价值

1. **多模型/本地模型一秒切换**：模型即资产，DeepSeek-V3/R1、本地量化、Claude 无缝切换
2. **极速多区域/多业务复制**：新西兰房贷、澳洲商业贷、资产抵押贷仅换 Domain Pack（领域策略+模板+评测），主体零重构
3. **企业级合规与确定性**：Fast-Path 保丝滑，Guardrail 保金融合规底线，Eval 保「修 A 不坏 B」
4. **技能/工具生态开放**：对齐 MCP 后，外部工具生态可插拔接入（日历/邮件/搜索等仍走工具准入三关）

---

## 六、落地纪律（对齐项目宪法）

- 一切资产声明式、入注册表；**禁止把领域逻辑硬编码进核心代码**
- 每批迁移过 Eval + 全量门禁（pytest/tsc/ruff 0 Error）
- 施工单模式：本规划拆为 WO 系列施工单，一单一件、验收后提交
- 工具准入三关（观察→判定→转正）不变；PII/脱敏闸门/只出草稿红线一步不退

---

## 七、范式转移评估：通用底座 vs 自建盘点（2026-08-22）

> 本节回答：软件范式是否正从"人操作界面"转向"AI 作为运行时"，以及在本项目里哪些能力本可直接用通用底座、哪些必须自建。结论用于校准 V2 各模块的投入优先级。

### 1. 范式转移判断（表述修正）

范式转移是**真实发生**的，但"以人为中心 → 以 AI 为中心"需要修正为更准确的表述：**未来软件不是"以 AI 为中心"，而是 AI 成为运行时（Runtime），人仍然是委托方与治理者**。

- 变化的是操作范式：从"人操作界面"变为"人用自然语言指挥 AI，AI 操作工具，人拍板"；UI 从产品本身降级为驾驶舱（Domain Cockpit）。本产品的"她说、它记、它答、它建议、她拍板"即此范式。
- 底座商品化的证据已在发生：MCP（工具协议）、各家 Agent SDK/Harness（Pydantic AI / OpenAI Agents SDK / LangGraph / DeepSeek Harness）、SKILL 化（superpowers / apple-design）。本产品已在复用其中一部分（Pydantic AI、Vercel AI SDK、sqlite-vec、LiteParse、APScheduler）。
- **"标准 Harness + 领域包即可快速建软件"只在水平型/工具型场景成立**（Dify/Coze 已验证）。在合规垂直软件中，Harness 只解决约 10-20% 的 agent 运行时，其余 80% 是领域资产包 + 合规护栏 + 驾驶舱。
- 因此 V2 公式保持不变：**垂直软件 = 通用底座 × 领域资产包 × 驾驶舱**。底座商品化后，价值沉淀在资产与护栏上，而非 harness 本身。

### 2. 本软件"底座 vs 自建"盘点

| 层 | 我们自建 | 底座本可提供 | 判断 |
|---|---|---|---|
| 意图路由 / 工具分发 | `core/chat/loop.py`、`intent_router.py`、`tools.py` 自研 TOOL_SCHEMAS、`flows.py`/`runner.py`/`pai.py` 三分发 | Pydantic AI tool calling、MCP 协议 | ⚠️ 部分重复造轮子——这层正是底座会商品化的部分 |
| 任务槽位提取 | `core/chat/slot_extractor.py` 正则清洗 | LLM tool calling / structured output | ❌ 反模式（WO-70 已证明并纠正方向） |
| 流程包 | `config/agent_flows/*.yaml`（12 个）+ 自研 schema | dsh profile、SKILL、MCP | ✅ 形态正确，但协议私有、无法与生态互通 |
| 记忆 L0-L6 | 事件账本 + BrainFact + 蒸馏 + sqlite-vec | Mem0 / Zep / Letta | ✅ 自建正确——确认闸门、内外双线、"账本为王"是合规要求，底座给不了 |
| 工具协议 | 自研 TOOL_SCHEMAS | MCP | ⚠️ 应对齐（模块 B-2） |
| 评测 | `evals/` 尚未建立 | promptfoo / DeepEval 等现成底座 | ❌ 最该用底座的地方反而还没建（模块 C） |
| 调度 / OCR / 流式 | — | APScheduler / LiteParse / Vercel AI SDK | ✅ 已正确复用 |

### 3. 自建的优势与劣势（诚实盘点）

**自建优势（为什么不算白干）：**
1. **合规是护城河，底座给不了**：脱敏闸门、PiiLeakDetector、只出草稿、内外双线、PathGuard——宪法级能力必须长在内核里；
2. **确定性与可测性**：1177 条测试、Fast-Path 0.8s 直出、工具白名单——行为可钉死；通用 Harness 是黑盒且版本漂移严重（dsh v0.1 官方明示会有破坏性变更，2026-08-14 调研结论"借鉴 3 点、不引入"正确）；
3. **领域资产已大部分声明式**：12 个流程包、`agents.yaml`、`checklist_master`、银行政策、技能库都已是"插件形态"，V2 是"收编统一"而非推倒重来；
4. **模型已解耦**：routing 即资产，DeepSeek/Gemini/本地量化可切换，天然符合"模型即插件"。

**自建劣势（要承认）：**
1. **内核胶水花掉了本可省下的预算**：意图路由、槽位提取、工具分发正是会被底座免费商品化的部分（WO-70 即案例：系统已有 `create_task` tool schema，TASK_CREATE 分支却绕道自研正则）；
2. **生态孤岛**：工具协议不对齐 MCP，社区现成的日历/搜索/邮件工具接不进来；flow schema 私有，跨项目复用难；
3. **评测欠账**：没有 Eval 底座，"修 A 不坏 B"只能靠人工回归；
4. **内核不够薄**：每加一个工具要动 `flows.py`/`runner.py`/`pai.py` + 测试，成本高于"只加一个资产 yaml"。

### 4. 对 V2 的落地含义（行动优先级）

- 姿势：**薄内核 + 厚资产 + 合规驾驶舱**；持续把"内核胶水"让位给商品化底座；
- 优先级：B-1 资产注册表 → B-2 工具协议对齐 MCP → C 模块 Eval 用现成底座搭建 → 自研槽位提取替换为 tool calling / structured output（WO-70 已定方向）；
- 重仓自建领域资产（政策/清单/模板/评测集）与合规护栏；未来竞争不取决于谁 harness 写得好，而取决于**领域资产深度、合规护栏可信度、驾驶舱体验**——这正是本产品的定位。

---

*v2.1.1-PROPOSAL · 2026-08-22 · 全栈插件化修订（对齐宪法 v1.3 Plugin-First 理念）+ 范式转移评估补充（底座 vs 自建盘点）*
