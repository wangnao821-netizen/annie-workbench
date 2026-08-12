# GitHub 开源项目深度调研 — 寻找 CASE 大脑的"通用底座"

> 搜索范围：15+ 个项目 → 筛选出 7 个最契合的完整项目 → 逐一对照 vera-workbench 现有架构评估

---

## 一、我们在找什么样的"底座"？

根据 CASE 大脑构想和 vera-workbench 现有架构，理想的底座需要满足：

```
✅ 对话引擎：多轮对话 + 对话历史注入 prompt
✅ 记忆系统：事实提取 → 持久化 → 注入 → 确认/撤销
✅ Function Calling：LLM 调用工具 → 执行 → 结果回传循环
✅ Python 后端：与现有 FastAPI + SQLAlchemy 兼容
✅ SQLite 友好：桌面应用，不能依赖 PostgreSQL/Redis
✅ PII 合规：可插入脱敏层（我们已有 desensitize/rehydrate）
✅ 模型无关：支持 Gemini/DeepSeek/本地模型切换
✅ 轻量级：pip install 即可用，不需要 Docker 编排
```

---

## 二、7 个候选项目全景对比

### 总览表

| 项目 | GitHub | Stars | 类型 | 语言 | 数据库 | 许可证 | 与 vera 契合度 |
|------|--------|-------|------|------|--------|--------|---------------|
| **Agno** | [agno-agi/agno](https://github.com/agno-agi/agno) | 20k+ | Agent 引擎 | Python | SQLite ✅ | Apache 2.0 | ⭐⭐⭐⭐⭐ |
| **Letta** | [letta-ai/letta](https://github.com/letta-ai/letta) | 15k+ | Agent OS | Python | PostgreSQL ❌ | Apache 2.0 | ⭐⭐⭐ |
| **OpenLoaf** | [OpenLoaf/OpenLoaf](https://github.com/OpenLoaf/OpenLoaf) | 新兴 | AI 桌面工作台 | Rust+TS | 本地文件 | 开源 | ⭐⭐⭐ |
| **Quivr** | [QuivrHQ/quivr](https://github.com/QuivrHQ/quivr) | 38k+ | "第二大脑" | Python | PostgreSQL ❌ | Apache 2.0 | ⭐⭐ |
| **Onyx(Danswer)** | [onyx-dot-app/onyx](https://github.com/onyx-dot-app/onyx) | 14k+ | 企业 AI 助手 | Python | PostgreSQL ❌ | MIT | ⭐⭐ |
| **TryCompAI** | [trycompai/crm](https://github.com/trycompai/crm) | 新兴 | AI CRM | NestJS/TS | PostgreSQL ❌ | 开源 | ⭐⭐ |
| **Jan** | [janhq/jan](https://github.com/janhq/jan) | 25k+ | AI 桌面客户端 | TS/Electron | 本地文件 | AGPL-3.0 | ⭐⭐ |

---

## 三、Top 3 深度剖析

### 🥇 Agno（原 Phidata）— 最推荐的 Agent 引擎底座

**为什么它排第一**：

Agno 是唯一一个同时满足以下全部条件的项目：
- ✅ 纯 Python，`pip install agno` 即可
- ✅ 原生 SQLite 支持（`SqliteStorage` + `SqliteMemoryDb`）
- ✅ 内置记忆系统（自动事实提取 + 注入 prompt）
- ✅ 内置 Function Calling（tools 参数，工具定义为普通 Python 函数）
- ✅ 模型无关（OpenAI/Anthropic/Gemini/Ollama 全支持）
- ✅ 对话历史自动管理（`add_history_to_messages=True`）

**架构图（与 vera-workbench 对接后）**：

```
┌─────────────────────────────────────────────────────┐
│ vera-workbench 现有                                  │
│                                                      │
│  server/api/ ──── FastAPI 路由层 (保留)               │
│  core/pii/  ──── 脱敏闸门 (保留)                      │
│  core/models/ ── ORM 数据模型 (保留+扩展)              │
│  core/task_engine/ ── 任务引擎 (保留，变为工具)         │
│  core/ai/gateway.py ── AI 网关 (降级为备用)           │
│  frontend/ ──── React 前端 (保留+新增 BrainChat)      │
│                                                      │
├──────────── 新增底座层（Agno 提供） ────────────────────┤
│                                                      │
│  Agno Agent  ── 对话引擎 + 记忆管理 + 工具调用          │
│    ├── SqliteStorage ── 对话历史持久化                  │
│    ├── SqliteMemoryDb ── 用户记忆（事实提取+存储）       │
│    ├── Tools[] ── 自定义工具（接入 vera 业务逻辑）       │
│    │    ├── save_case_fact()    ← 记录案件事实          │
│    │    ├── query_checklist()  ← 查询清单              │
│    │    ├── create_task()      ← 创建待办              │
│    │    ├── draft_email()      ← 草拟邮件              │
│    │    └── search_knowledge() ← 搜索知识库            │
│    └── Model ── Gemini/DeepSeek（通过 Agno 的适配器）   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**核心代码示例（改造后的 brain 路由）**：

```python
# server/api/brain.py — 用 Agno 替代手写对话引擎

from agno.agent import Agent
from agno.memory.v2.db.sqlite import SqliteMemoryDb
from agno.memory.v2.memory import Memory
from agno.models.google import Gemini
from agno.storage.sqlite import SqliteStorage

from core.pii.gateway import desensitize, rehydrate
from core.brain.tools import (
    save_case_fact, query_checklist, create_task,
    draft_email, search_knowledge, get_case_panorama,
)

# 初始化 Agno Agent（单例）
def create_brain_agent(db_path: str = "data/brain.db"):
    return Agent(
        model=Gemini(id="gemini-2.0-flash"),
        memory=Memory(
            db=SqliteMemoryDb(
                table_name="brain_memories",
                db_file=db_path,
            )
        ),
        storage=SqliteStorage(
            table_name="brain_sessions",
            db_file=db_path,
        ),
        tools=[
            save_case_fact, query_checklist, create_task,
            draft_email, search_knowledge, get_case_panorama,
        ],
        system_prompt="你是 Vera 的贷款案件助手...",  # persona
        enable_user_memories=True,        # 自动提取事实
        enable_session_summaries=True,    # 会话摘要
        add_history_to_messages=True,     # 对话历史注入
        num_history_responses=10,         # 滑动窗口 10 轮
    )
```

**Agno 的 12 维度评分**：

| 维度 | 评分 | 说明 |
|------|------|------|
| 对话引擎 | ⭐⭐⭐⭐⭐ | 内置多轮 + 历史注入 + streaming |
| 记忆系统 | ⭐⭐⭐⭐ | 自动事实提取 + SQLite 持久化 + 注入 prompt |
| Function Calling | ⭐⭐⭐⭐⭐ | 工具定义为 Python 函数，自动循环 |
| Python 兼容 | ⭐⭐⭐⭐⭐ | 纯 Python，pip install |
| SQLite 支持 | ⭐⭐⭐⭐⭐ | 原生 SqliteStorage + SqliteMemoryDb |
| PII 合规 | ⭐⭐⭐ | 无内置脱敏，但可在工具层包装 desensitize |
| 模型无关 | ⭐⭐⭐⭐⭐ | OpenAI/Anthropic/Gemini/Ollama/DeepSeek |
| 轻量级 | ⭐⭐⭐⭐ | pip install 即可，无 Docker 依赖 |
| 可扩展性 | ⭐⭐⭐⭐⭐ | 工具/记忆/存储全可定制 |
| 社区活跃 | ⭐⭐⭐⭐⭐ | 20k+ stars，活跃维护 |
| 与现有代码兼容 | ⭐⭐⭐⭐ | Agent 作为服务嵌入 FastAPI，不侵入现有路由 |
| 改造工作量 | ⭐⭐⭐⭐ | 约 3-5 天集成（主要是写 tools 和 persona） |

> [!TIP]
> **Agno 的最大优势**：你不需要自己写对话引擎、历史管理、事实提取、tool-calling 循环这些基础设施。Agno 全部内置，你只需要：
> 1. 定义 tools（接入现有业务逻辑）
> 2. 写 system_prompt（人格化 persona）
> 3. 包装 PII 脱敏层

---

### 🥈 Letta (MemGPT) — 记忆架构最优但部署太重

**优势**：三层记忆分级（Core/Recall/Archival）是最完美的记忆架构
**劣势**：需要 PostgreSQL + pgvector，Server 模式启动，不适合桌面应用

| 维度 | 评分 |
|------|------|
| 记忆系统 | ⭐⭐⭐⭐⭐ (最强) |
| SQLite 支持 | ⭐ (不支持) |
| 轻量级 | ⭐ (需要 PostgreSQL + Docker) |
| 与现有代码兼容 | ⭐⭐ (架构差异大) |

> **结论**：借鉴它的记忆分级思想（已在上一份报告中采纳），但不引入它作为依赖。

---

### 🥉 OpenLoaf — 概念最像但技术栈不匹配

**概念对齐度极高**：
- 项目级工作空间 ≈ 案件级工作空间
- Secretary Agent ≈ CASE 大脑
- 项目记忆 ≈ 案件记忆
- 项目间知识共享 ≈ 跨案件经验传承

**问题**：
- 用 **Rust** 写核心，不是 Python
- 桌面 UI 完全自己的体系，与 vera-workbench 的 React+Vite 不兼容
- 太年轻，生态不成熟

> **结论**：产品设计理念值得学习，但代码不可用。

---

## 四、其他候选项目快评

| 项目 | 不推荐的理由 |
|------|-------------|
| **Quivr** | 定位是"文档问答"（RAG），不是"对话式助手"。需要 PostgreSQL。 |
| **Onyx (Danswer)** | 企业级搜索平台，需要 PostgreSQL + Vespa。太重。 |
| **TryCompAI** | AI CRM 方向正确，但用 NestJS（TypeScript），与 Python 后端不兼容。 |
| **Jan** | 通用 AI 客户端，无业务逻辑。AGPL 许可证有传染性。 |

---

## 五、最终推荐

### 方案 A（推荐）：Agno 做引擎底座 + vera-workbench 做业务壳

```
┌──────────────────── 职责分工 ────────────────────┐
│                                                   │
│  Agno 负责（不用自己写）：                          │
│  ├── 多轮对话引擎（历史管理、streaming）             │
│  ├── Function Calling 闭环（tool → execute → 回传） │
│  ├── 记忆系统（事实提取 → SQLite → 注入 prompt）     │
│  ├── 会话摘要（自动压缩旧对话）                      │
│  └── 多模型适配（Gemini/DeepSeek/Ollama）           │
│                                                   │
│  vera-workbench 负责（你的核心价值）：               │
│  ├── 贷款行业业务逻辑（清单/策略/OS/阶段机）          │
│  ├── PII 脱敏合规（desensitize/rehydrate）          │
│  ├── 前端 UI（BrainChat + 现有工作台）               │
│  ├── 人格化 Persona（贷款助手专属）                  │
│  ├── 自定义工具（save_fact/查清单/创任务/草拟邮件）    │
│  └── Electron 桌面壳（WO-05）                      │
│                                                   │
└──────────────────────────────────────────────────┘
```

**改造工作量估算**：

| 步骤 | 工作量 | 内容 |
|------|--------|------|
| 1. 安装 + 概念验证 | 0.5 天 | `pip install agno`，写一个最简 agent 跑通 |
| 2. 写 tools | 2 天 | 把现有 core/ 中的业务函数包装为 Agno 工具 |
| 3. PII 包装 | 1 天 | 在 Agent 的输入/输出层接入 desensitize/rehydrate |
| 4. brain 路由 | 1 天 | `server/api/brain.py` 接入 Agno Agent |
| 5. persona | 0.5 天 | 撰写 system_prompt |
| **合计** | **~5 天** | |

---

### 方案 B（备选）：纯自建（不引入任何框架）

就是上一份报告中设计的 BrainFact + BrainEvent + 手写对话引擎。

**与方案 A 的 trade-off**：

| 维度 | 方案 A（Agno 底座） | 方案 B（纯自建） |
|------|-------------------|-----------------|
| **对话引擎** | Agno 内置，0 行代码 | 自写 ~300 行（tool-calling 循环） |
| **记忆系统** | Agno 内置自动提取 | 自写 ~200 行（LLM 调用 + 存储） |
| **历史管理** | Agno 内置滑动窗口 | 自写 ~100 行 |
| **可控性** | ⭐⭐⭐ (Agno 记忆逻辑不完全透明) | ⭐⭐⭐⭐⭐ (每行代码你都控制) |
| **依赖风险** | ⭐⭐⭐ (Agno 版本升级可能 breaking) | ⭐⭐⭐⭐⭐ (无外部依赖) |
| **PII 定制** | 需要包装层 | 原生集成 |
| **开发速度** | ⭐⭐⭐⭐⭐ (5 天) | ⭐⭐⭐ (10-15 天) |
| **长期维护** | 跟随 Agno 社区 | 自己维护 |
| **学习成本** | 学习 Agno API | 无额外学习 |

> [!IMPORTANT]
> **关键决策点**：如果你希望**快速验证大脑概念**（Phase 0），方案 A 显著更快。如果你对**记忆系统的每一个细节都要完全掌控**，方案 B 更适合。两者不互斥——可以先用 Agno 快速原型，验证后决定是继续用还是自建替换。

---

## 六、如果选 Agno — 具体集成路径

### Step 1: 安装

```bash
pip install agno
# Agno 支持的 provider（按需安装）
pip install agno[google]    # Gemini
pip install agno[openai]    # OpenAI/DeepSeek
```

### Step 2: 定义工具（接入现有业务）

```python
# core/brain/tools.py

from agno.tools import tool

@tool(description="保存案件事实到记忆系统")
def save_case_fact(
    case_id: str,
    category: str,  # client_profile / loan_details / income / decision
    key: str,       # employment_type / bank / loan_amount
    value: str,     # "PAYG, $85,000"
    source: str = "vera_said",
) -> str:
    """将对话中提取的事实保存到案件全景。"""
    # 接入 vera-workbench 现有的 ORM
    from core.models.orm import BrainFact  # 新表
    ...
    return f"已记录: {key} = {value}"

@tool(description="查询案件清单状态")
def query_checklist(case_id: str) -> str:
    """查看案件的材料清单收集状态。"""
    from core.models.orm import CaseChecklist
    ...
    return checklist_summary

@tool(description="创建待办任务")
def create_task(
    case_id: str,
    title: str,
    task_type: str,
    priority: str = "normal",
) -> str:
    """创建一个新的待办任务供 Vera 确认。"""
    from core.task_engine.dispatcher import create_task
    ...
    return f"已创建任务: {title}"
```

### Step 3: PII 安全包装

```python
# core/brain/safe_agent.py

class SafeBrainAgent:
    """在 Agno Agent 上包装 PII 脱敏层。"""
    
    def __init__(self, agent: Agent):
        self._agent = agent
    
    def chat(self, message: str, case_id: str, db: Session) -> str:
        # 1. 输入脱敏
        safe_message = desensitize(message, case_id, db)
        
        # 2. 调用 Agno Agent
        response = self._agent.run(
            safe_message,
            user_id=case_id,
            session_id=f"brain_{case_id}",
        )
        
        # 3. 输出还原
        return rehydrate(response.content, case_id, db)
```

---

## 七、总结

| 推荐层级 | 项目 | 用法 |
|---------|------|------|
| 🥇 **强烈推荐** | **Agno** | 作为对话引擎 + 记忆系统底座，pip install 即用 |
| 🥈 思想借鉴 | **Letta** | 三层记忆分级思想（Core/Recall/Archival） |
| 🥉 产品参考 | **OpenLoaf** | 项目级 AI 工作台的产品设计理念 |
| 📖 算法参考 | **Mem0** | 事实提取 → 合并 → 矛盾检测算法 |
| ❌ 不推荐 | Quivr/Onyx/TryCompAI/Jan | 定位不匹配或技术栈差异过大 |

最核心的判断：**vera-workbench 的核心价值是贷款行业的业务逻辑和 PII 合规**，不是对话引擎本身。用 Agno 做底座，把精力花在业务工具和用户体验上，而不是重新发明对话轮子。
