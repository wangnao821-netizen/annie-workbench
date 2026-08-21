# Vera Workbench V2 架构重构规划：通用 Harness 底座与专属领域资产包 (Domain Pack)

> **版本**：2.0.0-PROPOSAL  
> **更新时间**：2026-08-21  
> **定位**：指导 Vera Workbench 从 V1（混合硬编码/单体业务脚本）向 V2（Universal Agent Harness + Domain Pack + Domain Cockpit）演进的总体技术纲领与工程实施路线。

---

## 一、 战略背景与重构动因

### 1. 软件范式转移
未来的垂直企业级软件不再是从零手写所有调度逻辑的单体系统，而是：
$$\text{垂直信贷 AI 操作系统} = \text{通用 Agent Harness 底座} \times \text{专属领域资产包 (Domain Pack)} \times \text{金融驾驶舱 (Domain Cockpit)}$$

### 2. V1 现状痛点
- **领域资产缝合在代码中**：ANZ/CBA/ORDE 等银行的信贷政策、审贷偏好和模版散落在 `slot_extractor.py`、`OsStrategyColumn.tsx` 与 Prompt 中，新增银行成本高；
- **工具调用非标准化**：自定义的工具 Schema，未能对齐 MCP（Model Context Protocol）或标准 Harness Schema；
- **缺乏自动化回归评测（Eval Harness）**：每次改动意图识别或政策规则，缺乏 200~500 个真实信贷 Case 的一键基准跑分。

---

## 二、 V2 核心架构三层设计

```mermaid
graph TD
    subgraph 1. 表现层: 垂直金融驾驶舱 (Domain Cockpit)
        UI1[Bento 优先级看板 & 任务队列]
        UI2[OS 攻坚双语工作台 & 诚信护栏]
        UI3[三段式 Broker 敏捷动作卡片]
    end

    subgraph 2. 调度与安全层: Dual-Track 智能路由器
        FP[⚡ Fast-Path 确定性通道: 任务状态流转/排期/归档 - 0.8s 直出]
        HR[🧠 Universal Agent Harness: 多轮反思/工具编排/模型解耦]
        GW[🛡️ 金融合规与诚信拦截器 (Integrity Guardrail Interceptor)]
    end

    subgraph 3. 领域资产层: 专属领域资产包 (Domain Pack: au_mortgage)
        P1[🏦 银行政策规则库 (policies/*.yaml: ANZ, CBA, NAB, Westpac, ORDE)]
        P2[📄 财务税务 OCR 解析器 (parsers/*.py: Payslip, BAS, Tax Return)]
        P3[📧 攻坚与补件双语话术 (templates/*.md: Assessor/BDM/Client)]
        P4[🧪 信贷自动化评测基准 (evals/benchmark_500_cases.jsonl)]
    end

    UI1 & UI2 & UI3 --> FP
    UI1 & UI2 & UI3 --> HR
    HR --> GW
    GW --> P1 & P2 & P3
    HR -.->|自动化质检| P4
```

---

## 三、 V2 核心实施模块与任务清单

### 模块 A：专属领域资产包工程化 (`/domain_packs/au_mortgage/`)
- [ ] **A-1 银行信贷政策解耦 (`policies/`)**：
  - 将 ORDE、ANZ、CBA、NAB、Westpac 的 LVR 上限、核身口径、自雇核算公式、缓冲利率（Buffer Rate）抽取为声明式 YAML/JSON 配置；
  - 实现热插拔加载机制，新增非银机构（如 Macquarie、La Trobe）只需增加单个 Policy 文件。
- [ ] **A-2 双语攻坚与回信模板库 (`templates/`)**：
  - 将 OS 攻坚中英文回信、补件催款信、BDM 政策核实话术标准化为模板引擎；
  - 注入变量：`{client_name}`, `{lender}`, `{condition_items}`, `{evidence_files}`。
- [ ] **A-3 材料清单与 OCR 拓扑规则 (`checklists/`)**：
  - 64 项信贷材料分类、关键字段提取规则与正反向匹配字典独立打包。

### 模块 B：Universal Harness 内核与工具协议标准化
- [ ] **B-1 标准化 Tool Schema (对齐 MCP / OpenAI Tool 规范)**：
  - 将 `create_task`、`update_case_status`、`query_lender_policy` 等内部工具重构为标准 MCP Server / Plugin 协议；
  - 彻底解耦大模型与底层数据库操作。
- [ ] **B-2 保持 Fast-Path + Harness 混合调度 (Dual-Track)**：
  - 确定性高频操作（状态流转、建任务、排期）继续走 Fast-Path（0 延迟、100% 确定性）；
  - 复杂开放式推理（OS 攻坚策略制定、政策交叉比对）交由 Harness 插件池。
- [ ] **B-3 诚信护栏拦截管道 (Integrity Guardrail Interceptor)**：
  - 作为 Harness 的前置/后置中间件，强制拦截无实体凭证的“已提供材料”虚假声明。

### 模块 C：自动化信贷评测基准 (Eval Harness)
- [ ] **C-1 建立澳洲信贷黄金测试集 (`evals/benchmark_cases.jsonl`)**：
  - 涵盖 200~500 个真实场景：包含复杂自雇报税、海外收入、多套投资房、租金折算、OS 疑难补件等。
- [ ] **C-2 一键回归与准确率报告 (`scripts/run_eval.py`)**：
  - CLI 一键运行：输出意图命中率、政策匹配准确率、参数完整度、Token 消耗与响应耗时；
  - 杜绝“修复 A 场景破坏 B 场景”的传统回归隐患。

---

## 四、 预期收益与商业价值

1. **多模型/本地模型一秒切换**：解耦后，后端可在 DeepSeek-V3/R1、本地量化模型、Claude 等不同模型间无缝平滑切换；
2. **极速多区域/多业务复制**：未来切入新西兰房贷、澳洲商业贷款（Commercial Loan）或资产抵押贷（Asset Finance），仅需更换 Domain Pack，主体软件零重构；
3. **企业级合规与确定性**：Fast-Path 保证日常使用的丝滑顺手，Guardrail 保证金融牌照合规底线。
