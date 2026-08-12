# DeepSeek × Antigravity 记忆方案对照分析

> 将 DeepSeek 的 [记忆系统_重设计与开源选型.md](file:///D:/vera-workbench/docs/记忆系统_重设计与开源选型.md) 与 Antigravity 的 [CASE大脑_记忆系统深度调研.md](file:///D:/vera-workbench/docs/CASE大脑_记忆系统深度调研.md) 和 [CASE大脑_GitHub底座项目调研.md](file:///D:/vera-workbench/docs/CASE大脑_GitHub底座项目调研.md) 进行深度对照。

---

## 一、两份方案在哪里高度一致

| 共识 | DeepSeek | Antigravity |
|------|---------|------------|
| **账本/事实为唯一真相源** | ✅ "CaseContextEvent = 事实账本，其余都是投影" | ✅ "事实不做 UPDATE，只做版本递增" |
| **确认闸门** | ✅ "AI 记录的待确认不进正式记忆层" | ✅ "高置信自动确认 + 低置信反问" |
| **PII 脱敏不放松** | ✅ "任何向量/嵌入也走脱敏" | ✅ "在工具层包装 desensitize" |
| **保留现有资产** | ✅ "L1 账本、蒸馏、对话历史全部保持不变" | ✅ "accumulator/context_builder 保留不改" |
| **不引入重型服务** | ✅ "不建议 Qdrant/Weaviate/Postgres" | ✅ "纯 SQLite，无外部依赖" |
| **Mem0 保留但不作核心** | ✅ "规划已定，保留" | ✅ "降级为可选增强" |

> [!NOTE]
> **三条设计原则完全一致**——这是最重要的。两份方案可以合并，不存在方向性冲突。

---

## 二、关键分歧点逐一对照

### 分歧 1：是否需要新增结构化事实表（BrainFact）？

| | DeepSeek | Antigravity |
|---|---------|------------|
| **立场** | **不新增**。CaseContextEvent 就是账本，L2/L3 是派生索引 | **新增 BrainFact 表**。结构化 KV 对，补充 CaseContextEvent 的非结构化缺陷 |
| **理由** | 保持单一真相源，减少数据冗余 | CaseContextEvent 是文本 blob，无法查"收入是多少" |

**我的判断**：

> [!IMPORTANT]
> **两者不矛盾，可以共存**。DeepSeek 说的"账本为王"是正确的——CaseContextEvent 继续作为不可变事件流（audit trail）。但 Antigravity 说的"结构化覆盖层"也是必需的——AI 需要快速查"这个客户的银行是什么"，在非结构化文本中做 LIKE 搜索效率和准确率都不够。
> 
> **综合方案**：BrainFact 是 CaseContextEvent 的**结构化索引/视图**，不是第二个真相源。BrainFact 确认后自动写入 CaseContextEvent（保持账本完整），BrainFact 本身可以从 CaseContextEvent 重建。

---

### 分歧 2：时序知识图谱（Zep/Graphiti）

| | DeepSeek | Antigravity |
|---|---------|------------|
| **立场** | ⭐ **建议引入 Graphiti**（新增 L2 时序知识图谱） | ❌ **不引入图数据库**（Graphiti 需要 Neo4j/FalkorDB，桌面应用不可行） |
| **理由** | "谁·何时·说了什么·与什么相关"关系图谱 | 图数据库太重，用 SQLite 表 + valid_from/superseded_at 实现轻量版 |

**我的判断**：

> [!WARNING]
> DeepSeek 提到的"先 PoC 一周验证"是明智的。但 Graphiti 依赖 **Neo4j 或 FalkorDB**——这意味着桌面应用需要额外启动一个图数据库服务。对单用户 Electron 桌面应用来说，这个代价太大。
>
> **综合方案**：采纳 Graphiti 的**思想**（时序事实、关系追踪），但用 **SQLite 实现**（BrainFact 的 superseded_by + category 分类就是轻量版的时序图谱）。如果未来案件量增长到需要图查询，再考虑引入。

---

### 分歧 3：本地向量检索（sqlite-vec）

| | DeepSeek | Antigravity |
|---|---------|------------|
| **立场** | ⭐ **推荐 sqlite-vec**（SQLite 原生向量扩展，零新增服务器） | 未提及 sqlite-vec，认为 "< 100 案件用 category + key 查询足够" |

**我的判断**：

> [!TIP]
> DeepSeek 的 sqlite-vec 建议**非常好**。它解决了一个我之前忽略的问题——当 BrainFact 积累到几千条时，纯 LIKE 查询不够用，语义搜索是必要的。而 sqlite-vec 是 SQLite 原生扩展（`pip install sqlite-vec`），零新增服务器，完美契合我们的技术约束。
>
> **综合方案**：采纳 sqlite-vec 作为 BrainFact 的语义搜索能力。嵌入模型走本地 BGE（也是 DeepSeek 推荐的，零出网）。

---

### 分歧 4：Agent 引擎选型

| | DeepSeek | Antigravity |
|---|---------|------------|
| **立场** | ⭐ **Pydantic AI**（类型化 Agent，FastAPI 同族） | ⭐ **Agno**（完整 Agent 框架，内置 SQLite 记忆） |

**我的判断**：

这是**最需要你拍板的分歧**。两者对比：

| 维度 | Pydantic AI | Agno |
|------|------------|------|
| **与 FastAPI 亲和度** | ⭐⭐⭐⭐⭐（同一个 Pydantic 生态） | ⭐⭐⭐⭐（独立框架，可嵌入 FastAPI） |
| **内置记忆系统** | ❌ 无，需自己实现 | ✅ SqliteMemoryDb（自动事实提取） |
| **内置对话历史** | ❌ 无，需自己实现 | ✅ SqliteStorage + 滑动窗口 |
| **控制粒度** | ⭐⭐⭐⭐⭐（每一步你都控制） | ⭐⭐⭐（框架封装了很多逻辑） |
| **轻量程度** | ⭐⭐⭐⭐⭐（极轻，只做工具编排） | ⭐⭐⭐（中等，完整框架） |
| **学习成本** | ⭐⭐⭐⭐⭐（Pydantic 你已经会了） | ⭐⭐⭐（新 API 需要学） |
| **开发速度** | ⭐⭐⭐（记忆/历史需自建） | ⭐⭐⭐⭐⭐（开箱即用） |

> **综合判断**：DeepSeek 推荐 Pydantic AI 更**稳健**——它只做 Agent 编排（工具定义 + schema 自动生成），记忆系统由我们自己控制（BrainFact + sqlite-vec），不依赖框架的记忆黑盒。Agno 的优势是快速出原型，但长期来看 Pydantic AI + 自建记忆层的**可控性更高**。

---

### 分歧 5：前端对话 UI

| | DeepSeek | Antigravity |
|---|---------|------------|
| **立场** | **Vercel AI SDK**（主流稳定）或 CopilotKit | 未明确推荐，说"新增 BrainChat 页面" |

**我的判断**：

DeepSeek 的 Vercel AI SDK 推荐很实际——流式对话、工具调用渲染都有现成方案。我们现有前端是 React + Vite，Vercel AI SDK 直接 npm install 就能用。

---

### 分歧 6：嵌入模型

| | DeepSeek | Antigravity |
|---|---------|------------|
| **立场** | **本地 BGE/bge-m3**（零出网，首选） | 未明确讨论（只说"Phase 1 不需要向量搜索"） |

**我的判断**：

DeepSeek 说的对——嵌入走本地模型 BGE 是最安全的选择。如果用 sqlite-vec，就必须有嵌入模型，本地 BGE 避免了 PII 出网风险。

---

## 三、综合推荐方案

结合两份方案的优点：

```
┌──────────────── 综合记忆架构 ────────────────────────┐
│                                                       │
│  L0 会话记忆：CaseChatMessage（已有）                   │
│      → 滑动窗口注入 prompt                             │
│                                                       │
│  L1 事实账本：CaseContextEvent（已有，不动！）           │
│      → DeepSeek 的"唯一真相源"原则                     │
│                                                       │
│  L1.5 结构化视图：BrainFact（🆕 Antigravity 方案）      │
│      → CaseContextEvent 的结构化索引                   │
│      → 确认后自动写入 L1                               │
│      → 可从 L1 重建                                   │
│      → sqlite-vec 提供语义搜索（DeepSeek 方案）         │
│                                                       │
│  L2 行为日志：BrainEvent（🆕 Antigravity 方案）         │
│      → Vera 的决策/问题/纠正/AI 建议                    │
│                                                       │
│  L3 语义记忆：Mem0（已有，保留但可选）                    │
│                                                       │
│  L4 蒸馏记忆：context_summary + brief（已有）           │
│                                                       │
│  L5 被动录入：Screenpipe（🆕 新构想）                   │
│      → 每半天摘要 → 写入 L1.5 和 L2                     │
│                                                       │
│  Agent 编排：Pydantic AI（DeepSeek 推荐）               │
│  本地向量：sqlite-vec + BGE（DeepSeek 推荐）            │
│  对话 UI：Vercel AI SDK（DeepSeek 推荐）                │
│                                                       │
└───────────────────────────────────────────────────────┘
```

> **修订注记（2026-08-12）**：Screenpipe 层**架构保留**，但**数据暂不进入记忆系统**（V2 评估）；CopilotKit 移出 V1（V2 候选）。权威口径见 [CASE大脑_产品定位与架构指引.md](./CASE大脑_产品定位与架构指引.md)。

### 关键决策总结

| # | 决策点 | 综合推荐 | 理由 |
|---|--------|---------|------|
| 1 | 真相源 | **CaseContextEvent（DeepSeek）** | 账本不动，BrainFact 是索引 |
| 2 | 结构化事实 | **新增 BrainFact（Antigravity）** | 解决"查不到"的问题 |
| 3 | 时序图谱 | **SQLite 实现（Antigravity）** | 不引入 Neo4j，用 superseded_by |
| 4 | 本地向量 | **sqlite-vec + BGE（DeepSeek）** | 零出网，零新增服务 |
| 5 | Agent 引擎 | **Pydantic AI（DeepSeek）** | 与 FastAPI 同族，控制粒度高 |
| 6 | 对话 UI | **Vercel AI SDK（DeepSeek）** | 流式 + 工具渲染，React 友好 |
| 7 | 被动录入 | **Screenpipe（新构想）** | 补充"Vera 不用输入"的终极形态 |
| 8 | Mem0 | **保留但降级（共识）** | 可用则用，不作为核心依赖 |
| 9 | Graphiti | **不引入（Antigravity）** | 思想借鉴，实现用 SQLite |

---

## 四、两份方案最大的互补价值

- **DeepSeek 的强项**：设计原则清晰（账本为王 + 确认闸门 + 投影理论），选型更贴合现有技术栈（Pydantic AI、sqlite-vec、BGE 都是"同族"思维）
- **Antigravity 的强项**：具体数据模型设计（BrainFact 的字段定义、category 枚举、版本管理机制），代码级对接方案（与 accumulator/context_builder 的具体接入点）

**两者结合 = 完整方案**：DeepSeek 定原则 + Antigravity 出设计 + 代码实现。
