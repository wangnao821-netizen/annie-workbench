# 任务：执行 WO-43 清单 Agent 施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff/alembic 都用它）
- 施工单：docs\flash_specs\wo-43-checklist-agent.md（**唯一契约**，接口签名/字段名一字不改）
- 背景：建档已自动预选清单（case_creation L310 纯规则）；本单补齐"新增项落库 + 沉淀到清单总项库 + 下次预选可用 + 对话查缺口/AI按需重选"
- 范围：checklist_query（查缺口+按需 AI 重选）+ checklist_preview（纯规则预选推荐）+ 新增端点与沉淀表；标记已收复用既有 confirm/revoke；递交检查复用 WO-20；建档联动提示由 F-29 前端承担
- 当前基线：`pytest tests/ -q` = 978 passed，0 failed / 0 skipped
- 已拍板：新增项"名称+分类"必填、"指定银行/适用条件"可选不强制；AI 选只在 VERA 对话询问时执行；use_count V1 只埋点不统计
- 前置单已完成：WO-26 流程包框架 / WO-33 gap_analysis（runner+pai 分发可仿照）

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内 16 个文件（orm.py / 新迁移 / schemas.py / files.py / master_picker.py / chat/tools.py / agents.yaml / checklist_ops.yaml(新建) / flows.py / runner.py / pai.py / 2 个测试文件(新建) / **3 个既有测试计数断言收尾**：test_agents.py L36、test_agents_registry.py L33/L49/L53/L60、test_pai_orchestration.py L93——仅数字与注释，WO-41 同款惯例）
2. **严禁修改 config/checklist_master.yaml**（只读真源）；严禁修改前端 ui/；严禁新增 pip 依赖
3. 迁移 down_revision = d7a8b9c0e1f2（当前 head）；autogenerate 只允许新增 checklist_library_custom 一张表，若生成其他差异立即停下报告
4. `_load_master(db=None)` 无 db 时必须保持仅加载 config（离线/测试兼容），有 db 才合并自定义项
5. AI 重选（use_ai=True）只返回推荐、**绝不覆盖/删除案件已存清单**

## 接口契约速览（完整见施工单，一字不改）

```python
# core/models/orm.py 新表 ChecklistLibraryCustom
#   id=custom_{uuid8} / name_zh / name_en? / category / applicable_when? / bank_specific? / source_case_id / use_count / created_at

# server/api/schemas.py ChecklistAddRequest
name_zh: str; name_en: str | None = None; category: str
is_required: bool = True; applicable_when: dict | None = None; bank_specific: str | None = None

# server/api/files.py 新端点
POST /api/cases/{case_id}/checklist  # 写 CaseChecklist + upsert 总项库（同名+同分类幂等，use_count+1）

# core/checklist/master_picker.py
_load_master(db: Session | None = None) -> list[dict]  # config + 自定义项合并

# core/chat/tools.py 新工具 checklist_query（use_ai 布尔，默认 false）
```

流程包 `config/agent_flows/checklist_ops.yaml`：key=checklist_ops，presentation=result_card，steps 两步：`checklist_query`（output=result）+ `checklist_preview`（output=preview）。
能力中心 `config/agents.yaml` 追加 `agent-checklist`（key/triggers/flow_key=checklist_ops，见施工单契约 6）。
`core/agents/flows.py` 白名单加 `"checklist_query"`、`"checklist_preview"`；`runner.py` + `pai.py` 各加两个工具分发。

## 参考代码（先读再写）
- `server/api/files.py`：`_to_checklist_item`（L46）/ `confirm_checklist_item`（L155）写法，新端点加在其后
- `core/checklist/master_picker.py`：`_load_master`（L47）/ `_matches_applicable_when`（L71）/ `pick_checklist`（L174）
- `core/models/orm.py`：`CaseChecklist`（L123）字段风格；JSON 列参考 `Action.routing_options`
- `core/agents/runner.py` L171 `elif tool_name == "gap_analysis"` 分发写法
- `core/agents/pai.py` L87 `_gap_analysis(ctx)` + L99 `_tools()` 注册写法
- 迁移参考：`core/migrations/versions/dccde7819389_add_submission_platform_ref.py`（最小单表迁移）
- 测试参考：`tests/test_api/test_context_events.py`（TestClient）+ `tests/test_alembic.py`（upgrade/downgrade）

## 实施步骤
1. 读施工单全文 + 上述参考代码
2. Step 1 orm + 迁移：autogenerate → 只新表；`python -m alembic upgrade head` + `python -m alembic current` = 新 head
3. Step 2 schemas + files.py 新端点：`python -c "import server.api.files"` 无报错
4. Step 3 master_picker 合并：`python -c "from core.checklist.master_picker import pick_checklist; print('ok')"`
5. Step 4 chat 工具：`python -c "from core.chat.tools import TOOL_SCHEMAS; assert any(t['function']['name']=='checklist_query' for t in TOOL_SCHEMAS)"`
6. Step 5 agents.yaml + checklist_ops.yaml + flows 白名单（含 checklist_preview）：`python -c "from core.agents.flows import load_flows; assert 'checklist_ops' in load_flows()"`
7. Step 6 runner + pai：`python -c "import core.agents.runner, core.agents.pai"` 无循环导入
8. Step 7 写测试（6 + 10 用例，见施工单验收清单）：两个测试文件 `-v` 全绿

## 门禁（全部通过才算完成）
- `pytest tests/test_api/test_checklist_agent.py tests/test_core/test_checklist_library.py -v` → 16 passed
- `pytest tests/ -q` → ≥ 978 passed，0 failed / 0 skipped
- `ruff check`（改动文件）→ All checks passed
- `python -m alembic downgrade -1` 后 `upgrade head` 对称可逆；`python -m alembic current` = 新 head

## 提交
- 只 stage 改动范围 16 个文件；提交信息：`feat: WO-43 清单 Agent — 清单总项库沉淀 + 新增端点 + 对话查询/AI按需重选`
- 提交前先报告专项/全量测试结果，不要静默提交

---
⚠️ 执行纪律：只改范围表文件；契约命名一字不改；每步跑验证命令；失败停下报告，不自作主张修计划外代码。
