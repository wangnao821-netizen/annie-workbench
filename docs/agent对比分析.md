Searched web: "pi agent github"
Searched web: "pi agent framework github prime intellect or minimalist"

对 **Pi Agent / Prime Agent** 的架构特点进行了梳理，并结合我们刚刚落地的 **Vera Workbench (WO-26 Agent 编排层)** 进行了对比分析。

以下是关于 Vera Workbench Agent 体系提升空间的想法与建议：

---

### 一、 Pi Agent / Prime Agent 的核心设计理念

1. **极简底座 (Minimalist Harness)**：
   不搞膨胀的硬编码框架，底座仅保留最基础的会话循环、模型接驳与工具调用，把控制权交给极简的声明式指令与模块化扩展。
2. **上下文即变量 (Context as Variable / RLM)**：
   将上下文、长记忆和中间步骤输出视为可随程序流转的变量（例如在 REPL 环境中传递），而不是死板地在全局 Prompt 字符串中拼接。
3. **树状会话分支 (Tree-Structured Sessions)**：
   会话不是单一线性列表，而是树状结构。用户/Agent 可以随时回到之前的节点分叉深谈（例如对比方案 A 与方案 B）。
4. **自扩展能力 (Self-Improving Harness / Dynamic Skills)**：
   系统支持 Agent 自身生成、修正和持久化 Skill YAML / 规则配置，使 Agent 具备自我演进能力。

---

### 二、 Vera Workbench 当前 Agent 现状对比

在 **WO-26「Agent 编排层 + 流程包框架」** 中，我们已经建立起非常清晰且稳固的骨架：
- 声明式流程包（`config/agent_flows/*.yaml`）与白名单机制；
- 规则匹配路由与降级保障；
- 呈现分类契约（`result_card` 结果卡 / `dialog` 共创弹窗）。

这为系统带来了很高的确定性和可控性，符合金融/贷款经纪业务的严谨要求。但在**灵活性、上下文流转与共创体验**上，Pi Agent 的思路能给我们带来不少启发。

---

### 三、 我们 Agent 体系的提升空间与借鉴点

#### 1. 流程包内部步骤的数据流转与上下文共享 (Context Pooling)
- **现状**：目前 WO-26 V1 的 `run_flow` 在路由触发时参数 `args` 为空，多步骤间主要依赖固定的工具调用，步骤间的输入输出透传较为简单。
- **提升方向**：借鉴 Pi Agent “上下文即变量”的思路，建立一个轻量级的 `FlowContextPool`。前一步工具输出的字段（如 `declaration_check` 解析出的 `findings`），可自动作为变量供下一步（如 `explanation_draft` 或 `policy_check`）直接消费，而无需显式依赖上层拼装。

#### 2. 支持共创类（Dialog）的“树状分支对话”与方案对比
- **现状**：目前 `CaseChatMessage` 是线性的对话记录。当用户在 `dialog`（如贷款能力计算器或解释信调整）中反复微调参数时，线性记录会导致上下文变得混乱。
- **提升方向**：借鉴 Pi Agent 的 **Tree-structured Sessions** 机制：
  - 在共创类 `dialog` 交互中，引入 `parent_message_id` 或 `session_branch` 概念；
  - 允许经纪人在计算器弹窗中生成“方案 A（CBA 银行）”和“方案 B（ANZ 银行）”两条并行分支，并且在对话界面中随时自由切换与对比呈现卡片。

#### 3. 流程包的“动态扩展与自我演进” (Dynamic Flow Generation)
- **现状**：目前的 `config/agent_flows/*.yaml` 是人工编写的静态 YAML 配置文件。
- **提升方向**：在未来的 WO-26b 或更高版本中：
  - 允许 Agent 根据高级经纪人的典型操作习惯或特殊案件类型，**动态提炼并生成新的流程包 YAML 模板**；
  - 结合校验器（`load_flows` 的 schema 校验）确保新生成的流程包依然符合白名单和呈现安全红线。

#### 4. 呈现层 (Presentation) 的双向状态联动与卡片重构
- **现状**：目前 `ToolCard` 增加了 `presentation`（`result_card` | `dialog`），前端根据 type / presentation 渲染静态卡片或弹窗。
- **提升方向**：
  - 将卡片 payload 从“单向展示数据”升级为“状态卡片（Stateful Card）”；
  - 当用户在前端 `dialog` 弹窗中更改了数值（例如调高客户年收入），卡片状态自动回传给 `runner.py` 刷新分析结论，实现更流畅的“人机共创”交互。

---

### 四、 总结与建议

- **当前步骤**：WO-26 已经完成了极其扎实、干净的轻量骨架和门禁覆盖，建议保持当前版本的稳定和简洁。
- **后续规划（如 WO-26b / WO-27）**：可以在不破坏现有白名单与安全红线的前提下，逐步吸收 Pi Agent 在 **上下文变量流转** 和 **状态化卡片共创** 方面的优点。

**Pydantic AI 与 Pi Agent 的定位侧重完全不同，它们更像是“强力引擎”与“灵活环境”的关系。**

对于刚才列出的 4 个改进方向，**Pydantic AI 原生解决了核心的数据与类型流转问题，但在会话结构和 UI 呈现上，仍需要我们在 Vera 的业务层进行封装。**

以下是详细对比与 4 个改进点的匹配度分析：

---

### 一、 定位对比：Pydantic AI vs Pi Agent

| 维度 | **Pydantic AI** | **Pi Agent (及 Prime Agent)** |
| :--- | :--- | :--- |
| **本质定位** | **后端生产级 Agent 库 / 执行引擎** | **Agent 运行环境 / 终端应用 (Harness)** |
| **核心哲学** | **强类型、工程化、防错**。死磕 Schema 校验、依赖注入与单元测试能力。 | **极简、高自由度、自演进**。强调把上下文当变量 (REPL)、树状分支、自由拓展。 |
| **适用场景** | **嵌入到现有 Web 系统（如 FastAPI）**，负责稳定执行复杂结构化任务。 | 独立终端 AI 助手、代码/研究探索型 Agent、需要多分支尝试的场景。 |

---

### 二、 刚才提到的 4 个改进点，Pydantic AI 的覆盖情况

#### 1. 流程包内部数据流转 (Context Pooling) —— **完美支持**
- **Pi Agent 的做法**：把上下文放在 IPython REPL 变量池里流转。
- **Pydantic AI 的做法**：通过 `RunContext[Deps]` 和强类型 `Tool` 返回值。前一步工具输出的 Pydantic Model，可以无缝变成下一个工具的入参或校验条件。
- **结论**：**Pydantic AI 原生支持且做得更工程化。**

#### 2. 树状分支对话与方案对比 (Branching Sessions) —— **底层支持，需业务层存表**
- **Pi Agent 的做法**：在 Harness 底座里内置了树状 Session 节点和分支切换功能。
- **Pydantic AI 的做法**：它是一个无状态/轻状态的引擎，允许在调用 `agent.run(..., message_history=history)` 时传入任意历史消息链。
- **结论**：如果我们在 Vera 数据库中保存 `parent_message_id`（分支树），**Pydantic AI 能够完美接管并运行指定分支的历史**，但数据库存储和分支切换逻辑需由 Vera 后端处理。

#### 3. 流程包动态拓展 (Dynamic Flows) —— **支持动态 Tool，需 YAML 桥接**
- **Pi Agent 的做法**：允许 Agent 直接生成或修改配置文件/Skill 脚本。
- **Pydantic AI 的做法**：它提供了 Python 代码级别的动态工具注册和动态 System Prompt 变更。
- **结论**：我们现有的 `config/agent_flows/*.yaml` 是声明式的。如果要实现“Agent 动态生成流程包”，我们需要在 `flows.py` 中写一个简单的转换器，把 YAML 动态映射为 Pydantic AI 的 `Agent` 实例。

#### 4. 呈现层 (Presentation) 双向状态联动 —— **支持结构化流式输出**
- **Pi Agent 的做法**：面向 Terminal 终端 UI 的状态交互。
- **Pydantic AI 的做法**：纯后端库，不关注 UI 怎么画，但支持 **Streamed Structured Results（流式结构化输出）**。
- **结论**：Pydantic AI 可以实时将增量生成的结构化数据推给前端，为前端渲染 `result_card` 或 `dialog` 弹窗提供极佳的数据源。

---

### 三、 总结：如何组合使用？

- **Pydantic AI** 最适合充当 Vera Workbench 的 **“后端 Agent 执行引擎”**：负责打通 FastAPI、数据库依赖注入、工具调用的强类型校验与自动重试。
- **Pi Agent 的设计思想** 可以作为 Vera 的 **“业务与交互架构参考”**：参考其树状分支会话、灵活的流程上下文流转。

因此，我们在 **WO-26b** 引入 Pydantic AI 作为底座引擎，结合 Vera 自身的流程包与双轨呈现架构，是兼具**工程稳定性**与**业务灵活性**的最佳路线。