# Vera Workbench V2 架构重构规划：通用 Harness 底座 + 全栈可插拔资产包（Plugin-First）

> **版本**：2.1.0-PROPOSAL（修订版：从「领域资产包」扩展为「全栈插件化」，对齐 DeepSeek Harness 一切皆插件理念）
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

*v2.1.0-PROPOSAL · 2026-08-22 · 全栈插件化修订（对齐宪法 v1.3 Plugin-First 理念）*
