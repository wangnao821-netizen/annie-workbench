# 任务：执行 WO-41 任务 Agent 施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff/alembic 都用它，不要用裸 python）
- 施工单：docs\flash_specs\wo-41-task-agent.md（**唯一契约**，接口签名/字段名一字不改）
- 背景：AI First 下 VERA 在聊天里要能直接建任意任务（含截止/优先级/负责人）；能力中心已有 11 项 Agent/Tool（config/agents.yaml），本单新增任务 Agent
- 范围：本单只做"建任务"（task_create）；查/完成/委派/改截止由 F-29 前端抽屉调既有端点承担；升级老板已由 WO-40 承担
- 当前基线：`pytest tests/ -q` = 978 passed，0 failed / 0 skipped
- 前置单已完成：WO-40 老板拍板链路（聊天 escalate_to_boss 工具，本单仿照它扩展）

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内 11 个文件：schemas.py / dispatcher.py / tasks.py / chat/tools.py / agents.yaml / task_ops.yaml(新建) / core/agents/flows.py / runner.py / pai.py / tests/test_api/test_task_agent.py(新建) / **tests/test_api/test_agents.py（L36 断言 11→12 + docstring，本单新增 agent-task 的必要收尾）**
2. 严禁修改：`core/models/orm.py`、`core/migrations/*`、`config/bank_registry.yaml`、`config/checklist_master.yaml`、前端 `ui/`；本单**无数据库迁移**
3. `create_task` 的 priority 参数必须向后兼容：参数为 None 时回退 `context.get("priority", "low")`，既有调用零影响
4. chat 工具 `_create_task` 失败必须返回 `{"ok": False, "error": ...}` 不抛异常（仿 `_escalate_to_boss`），不阻断对话
5. 不引入任何新 pip 依赖；不创建改动范围外文件

## 接口契约速览（完整见施工单，一字不改）

```python
# server/api/schemas.py CreateTaskRequest 追加
deadline: str | None = None          # ISO 8601
priority: str = "normal"             # urgent|high|normal|low
assignee: str | None = None          # 空 → "vera"

# core/task_engine/dispatcher.py create_task 追加参数（签名见施工单）
# deadline → action.scheduled_at；priority 校验枚举；assignee 空 → "vera"

# core/chat/tools.py 新增工具
{"type": "function", "function": {"name": "create_task", ...}}  # title 必填
```

流程包 `config/agent_flows/task_ops.yaml`：key=task_ops，presentation=result_card，steps 一步 `task_create`。
能力中心 `config/agents.yaml` 追加 `agent-task`（key/flow_key=task_ops；**triggers 只挂建任务类**：帮我建个任务/创建任务/提醒我/周五前/记得/建一个待办；查/委派触发语 V2）。
`core/agents/flows.py` 白名单加 `"task_create"`；`runner.py` + `pai.py` 各加 task_create 分发/工具。

## 参考代码（先读再写）
- `core/chat/tools.py`：`escalate_to_boss` 的 TOOL_SCHEMAS 定义 + `execute_tool` 分支 + `_escalate_to_boss`（本单仿照）
- `server/api/tasks.py` L96-101：delegate 的 deadline ISO 解析（422 写法）
- `core/task_engine/dispatcher.py` L64 `create_task` 现有实现 + L162 `to_task_response`
- `core/agents/runner.py` L171 `elif tool_name == "gap_analysis"` 分发写法
- `core/agents/pai.py` L87 `_gap_analysis(ctx)` + L99 `_tools()` 注册写法
- `core/agents/flows.py` L22 `_TOOL_WHITELIST`

## 实施步骤
1. 读施工单全文 + 上述参考代码
2. Step 1 schemas.py：`python -c "from server.api.schemas import CreateTaskRequest; print(CreateTaskRequest(title='x').priority)"` → normal
3. Step 2 dispatcher.py：`python -c "import core.task_engine.dispatcher"` 无报错
4. Step 3 tasks.py 端点透传：`pytest tests/test_api/test_context_events.py -q` 回归全绿
5. Step 4 chat 工具：`python -c "from core.chat.tools import TOOL_SCHEMAS; assert any(t['function']['name']=='create_task' for t in TOOL_SCHEMAS)"`
6. Step 5 agents.yaml：yaml 校验含 agent-task
7. Step 6 流程包 + 白名单：`python -c "from core.agents.flows import load_flows; assert 'task_ops' in load_flows()"`
8. Step 7 runner + pai：`python -c "import core.agents.runner, core.agents.pai"` 无循环导入
9. Step 8 写 10 个测试用例（施工单验收清单）：`pytest tests/test_api/test_task_agent.py -v`

## 门禁（全部通过才算完成）
- `pytest tests/test_api/test_task_agent.py -v` → 10 passed
- `pytest tests/ -q` → ≥ 978 passed，0 failed / 0 skipped
- `ruff check`（改动文件）→ All checks passed
- `python -m alembic current` → 仍 d7a8b9c0e1f2（本单无迁移）

## 提交
- 只 stage 改动范围 10 个文件；提交信息：`feat: WO-41 任务 Agent — 聊天建任意任务（deadline/priority/assignee + 流程包）`
- 提交前先报告专项/全量测试结果，不要静默提交

---
⚠️ 执行纪律：只改范围表文件；契约命名一字不改；每步跑验证命令；失败停下报告，不自作主张修计划外代码。
