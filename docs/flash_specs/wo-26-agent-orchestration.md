# WO-26：Agent 编排层 + 流程包框架（V1 轻量自建；Pydantic AI → WO-26b）

> 来源（Vera 定稿 2026-08-13）：主文档 §二「业务流程 Agent 层」落地——V1 固化 5 核心 Agent，但实际只完成申报一致性（WO-20），建档/计算器流程有未包装，跟进/催件/OS 回复为空壳；**Agent 呈现方式分类定稿**（纯信息类→结果卡 / 共创类→弹窗深谈 / 后台自主类→通知待办）。
> 执行方：Gemini 3.5。检查方：Codex。
> **架构决定（Vera 认可 2026-08-13）**：本单 V1 用现有 ApiGateway + 自建轻量编排器（不引 Pydantic AI）；Pydantic AI 作为 WO-26b 的执行内核替换（主文档 §五 选型保留，分期实现）。
> 前置：WO-20 申报检查 / WO-21 计算器 / WO-18 建档流程均已实现；chat 链路 = `core/chat/loop.py::run_chat_with_tools(case_id, message, track, db) -> {reply, tool_cards, recorded_facts}`；当前 alembic head = f6e5d4c3b2a1；全量测试基线 761。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / PyYAML
- **禁止：引入任何新 pip 依赖**（Pydantic AI 明确 WO-26b）；禁止修改本表以外文件；禁止改前端
- 流程包定义放 `config/agent_flows/*.yaml`（与 checklist_master/calculator 配置一致；主文档 §二示例路径 `agents/` 为概念示意，落地到 config/agent_flows/）
- 红线：流程包工具只走白名单（本单 4 个：declaration_check / calculator_assess / policy_check / context_event_write）；扫描类必须 Vera 指定路径；关键动作 confirm_required；执行器任何异常降级不抛
- 新代码文件全部 ≤200 行；`config/agent_flows/*.yaml` 数据文件不受限

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/agent_flows/declaration_check.yaml` | **新建** | 流程包（呈现 result_card） |
| `config/agent_flows/calculator.yaml` | **新建** | 流程包（呈现 result_card） |
| `config/agent_flows/case_intake.yaml` | **新建** | 流程包（呈现 dialog → 前端建案表单） |
| `core/agents/flows.py` | **新建** | 流程包加载/校验/触发匹配（≤200 行） |
| `core/agents/runner.py` | **新建** | 流程包执行器（≤200 行） |
| `core/chat/loop.py` | 修改 | run_chat_with_tools 开头插入意图路由（命中流程包→runner；未命中→原工具循环） |
| `server/api/schemas.py` | 修改 | ToolCard + presentation 字段（result_card \| dialog） |
| `tests/test_core/test_agent_flows.py` | **新建** | ≥8 用例 |
| `tests/test_core/test_agent_runner.py` | **新建** | ≥8 用例 |
| `tests/test_api/test_agent_router.py` | **新建** | ≥6 用例 |

⚠️ 严禁修改上表以外文件。不得改动：core/agents/registry.py（WO-25 开关注册表，只读）、core/agents/declaration_check.py、core/calculator/、core/chat/ 其他文件、前端任何文件。

---

## 一、流程包定义（`config/agent_flows/*.yaml`）

统一 schema（字段名契约，一字不改）：

```yaml
key: declaration_check              # 唯一
name: "申报一致性检查"
description: "比对申报画像与指定材料，输出分层结论"
triggers: ["申报一致性", "检查一下申报", "比对材料与申请表"]   # 规则命中词（含 1 个主词）
presentation: result_card           # result_card（纯信息） | dialog（共创/表单引导）
steps:
  - tool: declaration_check
    params: { case_id: "$case_id", files: "$arg.files", folder: "$arg.folder" }
    output: findings
confirm_required: false
acceptance: []                       # 验收用例（本期留空，WO-26b 填）
```

**三个流程包内容（直接抄入）**：

1. `declaration_check.yaml`：key=declaration_check；presentation=result_card；triggers=["申报一致性","检查一下申报","比对材料与申请表"]；steps 1 步 tool=declaration_check（params 见上）。
2. `calculator.yaml`：key=calculator；presentation=result_card；triggers=["计算器","贷款能力","算一下贷款","服务能力计算"]；steps 1 步 tool=calculator_assess，params：`{ bank: "$arg.bank", request: "$arg.request" }`（V1 流程包只做触发+卡片壳，实际评估走前端 F-13 面板：执行器命中 calculator 流程包时返回 dialog 提示卡？——**修正**：计算器是多参数表单，呈现应为 **dialog**（前端 CalculatorPanel 已有）。故 calculator.yaml presentation=dialog，triggers 同上。
3. `case_intake.yaml`：key=case_intake；presentation=dialog；triggers=["帮我建个案件","新建贷款案件","给.*建个壳","建档"]；steps 1 步 tool=context_event_write（记录"用户发起建档"事件），实际建档表单由前端 NewCaseSheet 承接。

> 说明：呈现分类定稿落地——result_card（申报一致性）与 dialog（计算器/建档）均由前端已有面板/卡片承接；**共创类弹窗深谈（邮件/催件/OS）本单不实现，只保留 schema 契约**。

## 二、流程包加载与触发（`core/agents/flows.py`，≤200 行）

```python
"""流程包注册表 — config/agent_flows/*.yaml 加载/校验/触发匹配（WO-26）。"""

FLOW_DIR: Path  # 项目根 / config / agent_flows

def load_flows() -> dict[str, dict]:
    """读取全部 *.yaml 流程包；校验：key 唯一、presentation ∈ {result_card, dialog}、
    steps 非空且每步 tool 在白名单。失败抛 ValueError。"""

def match_flow(message: str) -> dict | None:
    """规则触发：消息包含任一 triggers 关键词 → 返回流程包 dict；否则 None。
    匹配大小写不敏感；triggers 含正则时用 re.search。"""

def flow_tool_whitelist() -> frozenset[str]:
    """白名单：declaration_check / calculator_assess / policy_check / context_event_write。"""
```

- 降级：FLOW_DIR 缺失/损坏 → load_flows 返回 {}，match_flow 返回 None（对话走原链路，不阻断）

## 三、执行器（`core/agents/runner.py`，≤200 行）

```python
"""流程包执行器 — 按 steps 顺序执行白名单工具，写事件，返回呈现契约（WO-26）。"""

def run_flow(flow: dict, case_id: str, args: dict, db: Session, track: str = "internal") -> dict:
    """执行流程包。

    Args:
        flow: 流程包 dict（load_flows 产物）。
        case_id: 案件 ID（可为空，如全局建档）。
        args: 流程参数（{files, folder, bank, request, ...}，来自路由/对话提取）。
        db: SQLAlchemy session。
        track: 事件轨（默认 internal）。

    Returns:
        {"reply": str, "tool_cards": list[dict], "recorded_facts": list[dict],
         "presentation": "result_card" | "dialog"}

    行为：
    1. 逐 step：查白名单 → 调对应工具函数（import 惰性）；
       - declaration_check → core.agents.declaration_check.run_declaration_check
       - calculator_assess → core.calculator.assess.assess（构造 AssessRequest 最小输入）
       - policy_check → core.policy.engine 入口（未接线则跳过并 warning）
       - context_event_write → core.context.accumulator.append_context_event
    2. 每步成功写一条 internal 事件：source_type=f"flow:{flow['key']}"，content=结果摘要（≤200 字）；
    3. 组装 ToolCard：type=f"flow_{key}"，title=flow.name，presentation=flow.presentation，
       payload=步骤结果（result_card 用结果数据；dialog 用 {} 让前端开面板）；
    4. reply=流程包 name + 结果一句话；任何异常 → 降级返回友好 reply + 空 cards。
    """
```

- 工具函数签名不匹配时（如 calculator_assess 需要结构化 request）：V1 只做"触发+卡片壳"，calculator 流程包执行器**不真算**，payload 空、由前端 CalculatorPanel 承接完整表单——执行器内实现为：calculator_assess 工具=校验 bank 参数存在 → 返回 {"needs_form": true}。

## 四、对话路由（`core/chat/loop.py` 修改）

在 `run_chat_with_tools` 函数体**最前面**（现有逻辑之前）插入：

```python
    # ── Agent 流程包路由（WO-26）：命中 → 执行流程包；未命中 → 原工具循环 ──
    from core.agents.flows import match_flow
    from core.agents.runner import run_flow

    flow = match_flow(message)
    if flow is not None:
        args = {}  # V1：参数由前端/对话补全，流程包先做触发与卡片壳
        return run_flow(flow, case_id, args, db, track=track)
```

- 返回结构 {reply, tool_cards, recorded_facts} 与现有约定一致；chat.py 无需改动（ToolCard 多 presentation 字段）

## 五、ToolCard schema（`server/api/schemas.py` 修改）

`ToolCard`（L228 附近）增加字段：

```python
class ToolCard(BaseModel):
    type: str
    title: str
    payload: dict = {}
    presentation: str = "result_card"   # result_card | dialog
```

## 六、测试

### tests/test_core/test_agent_flows.py（≥8）
1. load_flows 返回 3 个流程包（declaration_check/calculator/case_intake）
2. 每个流程包 key 唯一、presentation 合法、steps 非空且 tool 在白名单
3. match_flow("帮我检查一下申报一致性") 命中 declaration_check
4. match_flow("算一下 CBA 贷款能力") 命中 calculator
5. match_flow("帮我建个案件") 命中 case_intake
6. match_flow("今天天气怎么样") 返回 None
7. FLOW_DIR 缺失（monkeypatch）→ load_flows {} / match_flow None（降级）
8. 非法流程包（presentation=bogus）→ load_flows 抛 ValueError

### tests/test_core/test_agent_runner.py（≥8）
1. run_flow(declaration_check, 无外线画像案件) → status=fail 结论卡，tool_cards 1 张 presentation=result_card
2. run_flow(declaration_check, 有画像+文件) → findings 卡（monkeypatch run_declaration_check 返回固定值）
3. run_flow(calculator) → payload.needs_form=true、presentation=dialog、不真算
4. run_flow(case_intake) → presentation=dialog，写 context_event（source_type=flow:case_intake）
5. 每步成功写 internal 事件（断言 CaseContextEvent 出现）
6. 工具抛异常 → 降级 reply 非空、cards 空、不抛
7. 未知工具（flow 手工注入 tool=bogus）→ 该步跳过 + warning
8. 结果摘要 ≤200 字

### tests/test_api/test_agent_router.py（≥6）
1. POST /api/chat "检查一下申报一致性"（案件无外线画像）→ 200，tool_cards[0].type=flow_declaration_check、presentation=result_card
2. POST /api/chat "算一下贷款能力" → flow_calculator、presentation=dialog
3. POST /api/chat "帮我建个案件"（全局）→ flow_case_intake、presentation=dialog
4. POST /api/chat "今天有什么安排" → 走原工具循环（tool_cards 不含 flow_*）
5. 案件对话命中流程包后，历史正常写入 CaseChatMessage
6. 对话记录不含 PII（消息本身脱敏由 chat 链路保证；断言响应 reply 无占位符泄漏）

## 七、验收标准（全量门禁）

- 专项 3 文件全绿；`python -m pytest tests/ -q` → 761 基线 + 新增，0 failed / 0 skipped
- `ruff check`（本单文件）→ All checks passed
- TestClient 实测：三条触发语 → 对应 flow 卡（result_card/dialog）；无关语走原链路
- 无新 pip 依赖（pip freeze 对比）；前端零改动
- `python -c "import core.agents.flows, core.agents.runner"` 无循环导入

## 提交建议（一次）

```
git add config/agent_flows/ core/agents/flows.py core/agents/runner.py core/chat/loop.py
git add server/api/schemas.py
git add tests/test_core/test_agent_flows.py tests/test_core/test_agent_runner.py tests/test_api/test_agent_router.py
git commit -m "feat: WO-26 Agent 编排层 — 流程包框架 + 对话路由 + 呈现分类（result_card/dialog）"
```

⚠️ 执行纪律：只改「改动范围」表内文件；Pydantic AI 不引；呈现分类字段名一字不改；每步完成立即验证；失败停下报告。
