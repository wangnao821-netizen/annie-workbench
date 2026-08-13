# Semantica 调研与对照分析

> 日期：2026-08-14
> 来源：GitHub semantica-agi/semantica（README + docs/index.md）+ 多篇 GitHub Trending 解读
> 状态：调研结论（不引入，借鉴 2 点，登记 BACKLOG）

## 一、是什么

- **semantica-agi/semantica**：MIT，Python，v0.5.0，本周 GitHub 热榜黑马（3.8K → 5.5K+ 星，单日 +834）。自称「开源版 Palantir for AI agents」。
- 定位：**图原生**上下文与**可问责 AI** 基础设施。不替代 LLM / Agent 框架，而是垫在下面的"问责层"。
- 核心模块：
  - `semantica.context`：ContextGraph（实体关系图 + 时间模型 valid_from/valid_until + 任意时点快照 + SPARQL）、AgentContext、决策追踪（record_decision / find_precedents / analyze_decision_influence）
  - `semantica.semantic_extract`：NER、关系抽取、事件抽取、三元组生成
  - `semantica.vector_store`：FAISS / Pinecone / Weaviate / Qdrant / Milvus / PgVector（混合检索）
  - `semantica.graph_store`：Neo4j / FalkorDB / Apache AGE / Neptune
  - `semantica.reasoning`：前向链 / Rete / 演绎 / 溯因 / SPARQL / Datalog
  - `semantica.ontology`：SHACL / SKOS / 本体对齐
  - `semantica.provenance`：W3C PROV-O 血统、SHA-256 变更管理
  - `semantica.conflicts`：冲突检测与解决
  - `semantica.mcp_server`：MCP stdio server（12 工具）
- 主打场景：金融 / 医疗 / 法律 / 政府等**高合规**行业（HIPAA / SOX / GDPR / MiFID II）。

## 二、与我们架构的对照（已核实代码，非推测）

| Semantica 能力 | 我们现状（vera-workbench） | 结论 |
| --- | --- | --- |
| Context Graph（实体关系图 + 时间模型 + 时点快照） | CaseContextEvent 不可变事件流 + BrainFact 派生事实（superseded_by 替换链 / valid_from / valid_to / conflict）——轻量同构，单 SQLite 文件 | ✅ 方向已被外部验证，保持现状；**缺时点回溯查询层**（见借鉴点 2） |
| Decision Intelligence / find_precedents（决策先例检索） | PendingAction / Action / CaseTimelineEvent 是"决策记录"雏形，但**无"决策→结果"一等对象、无可检索先例** | 🔧 借鉴点 1：结构化决策记录 + 场景维度先例检索 |
| Full Provenance（事实溯源到原始文档） | BrainFact.event_id → 事件 → source_ref 溯源链已具备 | ✅ 已满足业务需求，无需 W3C 合规级 |
| Conflict Detection（冲突检测与解决） | conflict 标记 + supersede 机制 + 前端 ⚠️ 角标已具备 | ✅ 已有大半；**缺"冲突提示 Vera 拍板"流程卡**（低优先） |
| Vector Store（多后端混合检索） | WO-24 sqlite-vec + 本地 BGE，desensitize→embed→rehydrate 红线闭环 | ✅ 够用；多后端不适用（零新依赖铁律） |
| Reasoning Engines（Rete / Datalog / SPARQL） | policy engine YAML 规则 + LLM 判定，简单够用 | ❌ 不需要（复杂度远超场景） |
| Ontology Hub / SHACL | config/*.yaml + Pydantic 启动校验 | ❌ 不需要可视本体编辑器 |
| MCP server | 工具准入三关已定，MCP 延后 V2 评估 | ❌ V1 不引入 |
| 合规级审计（HIPAA/SOX/GDPR） | 单人工位（Vera 工作台），非监管系统 | ❌ 定位错位，不为其付复杂度 |

## 三、为什么不引入本体（4 个硬理由）

1. **依赖重量违背铁律**：Neo4j / FalkorDB / FAISS / Pinecone / RDF / SPARQL 全套，而我们的原则是零新依赖 + 单 SQLite 文件 + Electron 桌面 + NAS 备份。引入即推翻部署模型。
2. **预览期项目**：v0.5.0，刚修完 12 个安全漏洞，迭代极快，同 dsh 结论——V1 不押注。
3. **PII 红线**：出站唯一真源是 desensitize→占位符→rehydrate；其 ingest/LLM 模块是通用数据管道，接入要么绕红线要么包大适配器。
4. **定位错位**：它面向高合规审计（HIPAA/SOX），我们是 Vera 的记忆中心 / 统计中心 / AI 建议中心，为用不上的特性付复杂度不值。

## 四、值得借鉴的 2 点（可小 WO 落地，无需图数据库）

### 借鉴点 1：决策先例检索（find_precedents）

- 痛点：现在建议一致性靠团队经验知识库 + BrainFact 语义召回，但**没有"决策→结果"的一等对象**。
- 做法：把 PendingAction / Action + CaseTimelineEvent 结构化为可检索的"决策记录"（场景维度：bank / lvr / purpose / OS + 决策 + 结果），下次同类场景先例自动进上下文。
- 价值：解决 Vera 最关心的"同客户、同类案件建议别飘"。

### 借鉴点 2：时间点回溯（point-in-time snapshot）

- 痛点：老客户从半截接手、缺上下文（2026-08-14 用户明确提及）。
- 做法：数据已具备（created_at / superseded 链），只差查询层——"这个案件在 X 日 / 递交前的全景快照"（当时有效事实 + 当时事件 + 当时阶段）。
- 价值：老客户建档、复盘、审计时快速重建"当时知道什么"。

### 附加（低优先）：冲突解决闭环

- conflict 标记 / supersede 机制 / 前端 ⚠️ 角标已有；缺"冲突发生时主动提示 Vera 拍板哪个版本生效"的流程卡。可并入现有结果卡体系，排在上述两点之后。

## 五、结论

1. **不引入 Semantica 本体**（理由见三）。
2. 借鉴 2 点：决策先例检索 WO、时间点回溯 WO（均已登记 BACKLOG，排 WO-35 会话压缩与技能路由之后）。
3. 记忆架构方向（事件流 + 派生事实 + 冲突 + 时间模型）被热榜项目验证为行业共识，保持现状不重构。

