# WO-41 任务 Agent（聊天建任意任务）— 执行规范

> 依据：docs/CASE大脑_客户上下文维护与任务视图_定稿.md §10.1 / §十一。
> 执行者：opencode / Gemini，逐 Step 执行，每步跑验证命令。

## 范围说明（V1 只做"建任务"）

- 本单**只做 task_create**（对话建任意任务）；
- 查任务 / 完成 / 委派 / 改截止由 **F-29 前端任务抽屉**直接调既有端点（GET /api/tasks/、dispatch、delegate）承担；
- 升级老板已由 **WO-40 escalate_to_boss** 独立承担，本单不重复；
- chat 层 task_query / task_update 工具列入后续（WO-41b / V2），不在本单。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；alembic 用 `python -m alembic`
- 禁止：引入任何新 pip 依赖；新建计划外文件/目录；修改改动范围表以外的文件
- 红线：不触碰前端 ui/；不修改 config/bank_registry.yaml；不发送 PII 出网（工具参数不脱敏直接进 DB，走既有链路）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `server/api/schemas.py` | 修改 | L212 `CreateTaskRequest` 类内追加字段 |
| `core/task_engine/dispatcher.py` | 修改 | L64 `create_task()` 签名与实现 |
| `server/api/tasks.py` | 修改 | L46 `create_task_endpoint()` 参数解析与传递 |
| `core/chat/tools.py` | 修改 | `TOOL_SCHEMAS` 追加 create_task；`execute_tool()` 加分支；新增 `_create_task()` |
| `config/agents.yaml` | 修改 | `items` 末尾追加 agent-task 一项 |
| `config/agent_flows/task_ops.yaml` | 新建 | 流程包（见契约） |
| `core/agents/flows.py` | 修改 | `_TOOL_WHITELIST` 加 `task_create` |
| `core/agents/runner.py` | 修改 | `run_flow()` 内加 `elif tool_name == "task_create"` 分发 |
| `core/agents/pai.py` | 修改 | `_tools()` 列表加 `_task_create`；新增 `_task_create(ctx)` |
| `tests/test_api/test_task_agent.py` | 新建 | 测试（见验收） |
| `tests/test_api/test_agents.py` | 修改 | L36 断言 `len(agents) == 11` → `12`（+ docstring"11 项"→"12 项"）；本单新增 agent-task 的必要收尾，仅此一处 |

⚠️ 严禁修改上表以外任何文件；严禁重命名/移动/删除既有文件。

## 接口契约（一个字符都不能改）

### 1. CreateTaskRequest 扩展（server/api/schemas.py L212 类内追加）

```python
class CreateTaskRequest(BaseModel):
    case_id: str | None = None
    task_type: str = "general"
    source_channel: str = "manual"
    title: str
    context: dict = {}
    # ── WO-41 追加 ──
    deadline: str | None = None          # ISO 8601，可选；端点解析为 datetime 写 scheduled_at
    priority: str = "normal"             # urgent | high | normal | low
    assignee: str | None = None          # 空 → 默认 "vera"；老板用 "brandon"
```

### 2. create_task 签名扩展（core/task_engine/dispatcher.py）

```python
def create_task(
    case_id: str,
    task_type: str,
    source_channel: str,
    title: str,
    context: dict,
    routing_options: list[dict] | None = None,
    deadline: datetime | None = None,
    priority: str | None = None,
    assignee: str | None = None,
    db: Session = ...,
) -> Action:
```

行为（填空）：
- `priority` 为 None 时回退 `str(context.get("priority", "low"))`（保持既有调用不破坏）；非 None 时校验枚举 `{"urgent","high","normal","low"}`，非法抛 `ValueError`
- `assignee` 空 → `"vera"`
- `deadline` 非空 → `action.scheduled_at = deadline`
- `action.priority = priority`（不再只从 context 读）

### 3. chat 工具（core/chat/tools.py TOOL_SCHEMAS 追加）

```python
{
    "type": "function",
    "function": {
        "name": "create_task",
        "description": (
            "Vera 在对话里要创建任意任务（含截止时间/优先级/负责人）时调用。"
            "任务与当前案件自动关联；升级给老板用 escalate_to_boss，不要用本工具。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "任务标题（必填，中文）"},
                "deadline": {"type": "string", "description": "截止时间 ISO 8601（可选）"},
                "priority": {"type": "string", "enum": ["urgent", "high", "normal", "low"], "description": "默认 normal"},
                "assignee": {"type": "string", "description": "负责人，默认 vera"},
                "context": {"type": "object", "description": "补充上下文（可选）"},
            },
            "required": ["title"],
        },
    },
},
```

`execute_tool()` 加：`if name == "create_task": return _create_task(arguments, case_id, db)`

`_create_task(arguments: dict, case_id: str, db: Session) -> dict`：
- `case_id` 为空 → `{"ok": False, "error": "创建任务必须在案件对话中进行"}`
- `title` 空 → `{"ok": False, "error": "title 不能为空"}`
- `deadline` 字符串 → `datetime.fromisoformat`，失败返回 `{"ok": False, "error": "deadline 不是合法 ISO 时间"}`
- 调 `dispatcher.create_task(...)`，返回：
  `{"ok": True, "task_id": action.id, "title": action.title, "priority": action.priority, "deadline": action.scheduled_at.isoformat() if action.scheduled_at else None, "assignee": action.assignee}`
- 异常捕获返回 `{"ok": False, "error": str(exc)}`，不阻断对话（仿 `_escalate_to_boss`）

### 4. agents.yaml 追加（items 末尾）

```yaml
  - key: agent-task
    name: "任务 Agent (Task Ops)"
    description: "自然语言建任务/查任务/委派/改截止/升级老板"
    category: agent
    status: available
    triggers: ["帮我建个任务", "创建任务", "提醒我", "周五前", "记得", "建一个待办"]
    # V1 只挂"建任务"触发语；查/委派/升级触发语 V2（升级已由 WO-40 escalate_to_boss 处理）
    flow_key: task_ops
    capability: "任务 CRUD + 委派 + 升级"
    permission: "仅本系统任务，不触外部"
    enabled_default: true
```

### 5. task_ops.yaml（新建）

```yaml
key: task_ops
name: "任务操作"
description: "在对话中创建任意任务（关联当前案件）"
triggers: ["帮我建个任务", "创建任务", "提醒我", "周五前", "记得", "建一个待办"]
presentation: result_card
steps:
  - tool: task_create
    params:
      title: "$arg.title"
      deadline: "$arg.deadline"
      priority: "$arg.priority"
      assignee: "$arg.assignee"
    output: result
confirm_required: false
acceptance: []
```

### 6. runner.py 分发（run_flow 内，仿 gap_analysis 分支）

```python
elif tool_name == "task_create":
    from core.task_engine.dispatcher import create_task as create_task_action
    title = str(params.get("title") or args.get("title") or "").strip()
    if not title:
        res = {"status": "error", "message": "任务标题不能为空", "summary": "任务标题不能为空"}
    elif not case_id:
        res = {"status": "error", "message": "创建任务必须在案件对话中进行", "summary": "创建任务必须在案件对话中进行"}
    else:
        deadline_raw = params.get("deadline") or args.get("deadline")
        try:
            deadline = datetime.fromisoformat(str(deadline_raw)) if deadline_raw else None
        except ValueError:
            deadline = None
        action = create_task_action(
            case_id=case_id,
            task_type="general",
            source_channel="manual",
            title=title,
            context={"wo41": True},
            deadline=deadline,
            priority=str(params.get("priority") or args.get("priority") or "normal"),
            assignee=params.get("assignee") or args.get("assignee"),
            db=db,
        )
        res = {"status": "success", "task_id": action.id, "title": action.title, "summary": f"已创建任务：{action.title}"}
```

文件顶部补 `from datetime import datetime`（若缺失）。

### 7. pai.py 工具（仿 _gap_analysis）

```python
def _task_create(ctx) -> dict:
    """创建任务（WO-41）。"""
    title = str(ctx.get("title") or "").strip()
    if not title:
        return {"status": "error", "message": "任务标题不能为空", "summary": "任务标题不能为空"}
    if not ctx.get("case_id"):
        return {"status": "error", "message": "创建任务必须在案件对话中进行", "summary": "创建任务必须在案件对话中进行"}
    from core.task_engine.dispatcher import create_task as create_task_action
    action = create_task_action(
        case_id=ctx["case_id"],
        task_type="general",
        source_channel="manual",
        title=title,
        context={"wo41": True},
        deadline=ctx.get("deadline"),
        priority=str(ctx.get("priority") or "normal"),
        assignee=ctx.get("assignee"),
        db=ctx.get("db"),
    )
    return {"status": "success", "task_id": action.id, "title": action.title, "summary": f"已创建任务：{action.title}"}
```

`_tools()` 返回列表追加 `_task_create`。

## 实施步骤

### Step 1：schemas.py 扩展
- [ ] 文件：`server/api/schemas.py` L212 `CreateTaskRequest`
- [ ] 类内最后追加 3 字段（契约 1），保留既有字段
- [ ] 验证：`python -c "from server.api.schemas import CreateTaskRequest; print(CreateTaskRequest(title='x').priority)"` → normal

### Step 2：dispatcher.create_task 扩展
- [ ] 文件：`core/task_engine/dispatcher.py` L64
- [ ] 签名追加 3 参数（契约 2）；实现 priority 回退/校验、assignee 默认、deadline 写 scheduled_at
- [ ] 验证：`python -c "import core.task_engine.dispatcher"` 无报错

### Step 3：tasks.py 端点透传
- [ ] 文件：`server/api/tasks.py` `create_task_endpoint`
- [ ] deadline 字符串 ISO 解析（仿 L96-101 delegate 解析），非法 422；priority/assignee 透传
- [ ] 验证：`pytest tests/test_api/test_context_events.py -q` 仍全绿（回归）

### Step 4：chat 工具
- [ ] 文件：`core/chat/tools.py`：TOOL_SCHEMAS 追加 + execute_tool 分支 + `_create_task`
- [ ] 验证：`python -c "from core.chat.tools import TOOL_SCHEMAS; assert any(t['function']['name']=='create_task' for t in TOOL_SCHEMAS)"`

### Step 5：能力中心注册
- [ ] 文件：`config/agents.yaml` 追加 agent-task（契约 4）
- [ ] 验证：`python -c "import yaml; d=yaml.safe_load(open('config/agents.yaml',encoding='utf-8')); assert any(i['key']=='agent-task' for i in d['items'])"`

### Step 6：流程包 + 白名单
- [ ] 新建 `config/agent_flows/task_ops.yaml`（契约 5）
- [ ] `core/agents/flows.py` `_TOOL_WHITELIST` 加 `"task_create"`
- [ ] 验证：`python -c "from core.agents.flows import load_flows; f=load_flows(); assert 'task_ops' in f"`

### Step 7：runner + pai 分发
- [ ] `core/agents/runner.py` 加 `elif tool_name == "task_create"`（契约 6）
- [ ] `core/agents/pai.py` 加 `_task_create` + `_tools()` 注册（契约 7）
- [ ] 验证：`python -c "import core.agents.runner, core.agents.pai"` 无循环导入

### Step 8：测试
- [ ] 新建 `tests/test_api/test_task_agent.py`（用例见验收）
- [ ] 验证：`pytest tests/test_api/test_task_agent.py -v` 全绿

## 验收标准

### 自动验证
- `pytest tests/test_api/test_task_agent.py -v` → 全绿（用例 ≥ 8）
- `pytest tests/ -q` → 全量 ≥ 基线 978，0 failed / 0 skipped
- `ruff check`（本次改动文件）→ All checks passed
- `python -m alembic current` → 不产生新迁移（本单无迁移）

### 测试用例（tests/test_api/test_task_agent.py）
1. `test_create_task_minimal`：POST /api/tasks/ 仅 title → **200**（既有端点默认 200，FastAPI 未显式 status_code，回归 test_context_events.py 断言 200 且不可改），priority=normal、assignee=vera、deadline=None
2. `test_create_task_full`：title+deadline(ISO)+priority=high+assignee=brandon → 落库字段正确、scheduled_at 生效
3. `test_create_task_invalid_deadline`：deadline 非 ISO → 422
4. `test_create_task_invalid_priority`：priority=xxx → 400/422
5. `test_create_task_no_case`：case_id 空 → 422
6. `test_chat_tool_create_task`：execute_tool("create_task", {title, deadline, priority}, case_id, "internal", db) → ok=True、task_id 存在
7. `test_chat_tool_no_case`：case_id="" → ok=False
8. `test_flow_task_ops`：run_flow(task_ops flow, case_id, {title:"测试任务"}, db) → summary 含"已创建任务"
9. `test_agent_registry`：GET /api/agents/ 含 agent-task
10. `test_legacy_priority_backward`：context={"priority":"high"}、priority 参数缺省 → 仍 high（向后兼容）

### 手动验证
1. 中栏案件对话输入"帮我建个任务：周五前催客户交 NOA，高优先" → LLM 调 create_task → 返回确认，任务出现在任务列表
2. 待办工作台/首页今日待办可见新任务，deadline/priority/assignee 正确

---
⚠️ 执行纪律：
1. 只修改"改动范围"表内文件，绝不碰其他文件
2. 契约中所有命名一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 验证命令
4. 验证失败 → 停下报告错误，不自作主张修计划外代码
5. 不引入技术约束外依赖；不创建范围外新文件
6. 完成后 git stage 范围表内文件，提交信息：`feat: WO-41 任务 Agent — 聊天建任意任务（deadline/priority/assignee + 流程包）`
