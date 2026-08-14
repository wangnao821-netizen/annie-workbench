# WO-43 清单 Agent（清单总项库 + 新增沉淀 + 对话查询）— 执行规范

> 依据：docs/CASE大脑_客户上下文维护与任务视图_定稿.md §10.2 / §13。
> 执行者：opencode / Gemini，逐 Step 执行，每步跑验证命令。

## 范围说明（对齐定稿 checklist_ops 四步）

- 本单实现：`checklist_query`（查缺口/进度 + 按需 AI 重选）+ `checklist_preview`（按画像预选推荐，纯规则，复用 master_picker）+ 新增项端点与沉淀表 + 合并加载；
- `checklist_update`（标记已收/撤销）：已有 confirm/revoke 端点，F-29 抽屉直接调，本单不做 chat 工具；
- `checklist_audit`（递交前全绿/申报一致性）：复用 WO-20 declaration_check 流程包与 WO-33 gap_analysis，本单不重复实现；
- **建档联动提示由 F-29 前端承担**（建档成功回调显示"已预选 N 项"），本单不涉及前端。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；alembic 用 `python -m alembic`
- 禁止：引入任何新 pip 依赖；新建计划外文件/目录；修改改动范围表以外的文件
- 红线：不触碰前端 ui/；不修改 config/checklist_master.yaml（只读真源）；不发送 PII 出网
- 已拍板：新增项"名称+分类"必填、"指定银行/适用条件"可选不强制；建档预选保持纯规则，AI 选仅在 VERA 对话询问时执行；经验埋点 use_count V1 只埋点不统计

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/models/orm.py` | 修改 | 文件末尾追加 `ChecklistLibraryCustom` 模型 |
| `core/migrations/versions/` 新迁移 | 新建 | down_revision = d7a8b9c0e1f2（当前 head） |
| `server/api/schemas.py` | 修改 | L320 附近追加 `ChecklistAddRequest` |
| `server/api/files.py` | 修改 | `confirm_checklist_item` 后追加新增端点；`_to_checklist_item` 不动 |
| `core/checklist/master_picker.py` | 修改 | `_load_master()` 支持合并 DB 自定义项；`pick_checklist()` 传 db |
| `core/chat/tools.py` | 修改 | TOOL_SCHEMAS 追加 `checklist_query`；execute_tool 分支；新增 `_checklist_query()` |
| `config/agents.yaml` | 修改 | items 末尾追加 agent-checklist |
| `config/agent_flows/checklist_ops.yaml` | 新建 | 流程包（见契约） |
| `core/agents/flows.py` | 修改 | `_TOOL_WHITELIST` 加 `checklist_query`、`checklist_preview` |
| `core/agents/runner.py` | 修改 | `run_flow()` 加 `elif tool_name == "checklist_query"` 与 `checklist_preview` |
| `core/agents/pai.py` | 修改 | `_tools()` 加 `_checklist_query`、`_checklist_preview`；新增实现 |
| `tests/test_api/test_checklist_agent.py` | 新建 | 测试（见验收） |
| `tests/test_core/test_checklist_library.py` | 新建 | 测试（见验收） |
| `tests/test_api/test_agents.py` | 修改 | L36 断言 12→13（+ docstring），本单新增 agent-checklist 的必要收尾 |
| `tests/test_core/test_agents_registry.py` | 修改 | L33 / L49 / L53 / L60 断言 12→13（仅数字与注释） |
| `tests/test_core/test_pai_orchestration.py` | 修改 | L93 `len(pai._TOOL_NAMES) == 8` → `10`（+ 注释补 WO-43） |

⚠️ 严禁修改上表以外任何文件；`config/checklist_master.yaml` 零改动。

## 接口契约（一个字符都不能改）

### 1. ChecklistLibraryCustom 模型（core/models/orm.py 末尾追加）

```python
class ChecklistLibraryCustom(Base):  # type: ignore[misc]
    """自定义清单总项库（WO-43）：Vera 新增项沉淀，参与后续预选。

    经验埋点：use_count 随案件采用递增（V1 只埋点不统计）。
    """

    __tablename__ = "checklist_library_custom"

    id = Column(String, primary_key=True)          # 格式 custom_{uuid8}
    name_zh = Column(String, nullable=False)
    name_en = Column(String, nullable=True)
    category = Column(String, nullable=False)      # 枚举同 checklist_master
    applicable_when = Column(JSON, nullable=True)  # 可选不强制；null = 全适用
    bank_specific = Column(String, nullable=True)  # 可选不强制；null = 所有银行
    source_case_id = Column(String, nullable=True)
    use_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 2. ChecklistAddRequest（server/api/schemas.py 追加）

```python
class ChecklistAddRequest(BaseModel):
    name_zh: str
    name_en: str | None = None
    category: str                      # 枚举同 checklist_master
    is_required: bool = True
    applicable_when: dict | None = None
    bank_specific: str | None = None
```

### 3. 新增端点（server/api/files.py，confirm 端点之后）

```python
@router.post("/cases/{case_id}/checklist", response_model=ChecklistItemResponse)
def add_checklist_item(
    case_id: str,
    req: ChecklistAddRequest,
    db: Session = Depends(get_db),  # noqa: B008
):
    """新增清单项：写案件清单 + 沉淀到自定义总项库（同名+同分类幂等，use_count+1）。"""
```

行为：
- `_get_case_or_404(case_id, db)`
- `name_zh.strip()` 为空 → 422；category 不在枚举 `{"identity","income_payg","income_self_employed","bank_specific","special","property","settlement"}` → 422
- 归一化查重（去空白+小写）同名同 category → 复用已有 custom id，`use_count += 1`；否则新建 `custom_{uuid8}`（`source_case_id=case_id`，`use_count=1`）
- 写 `CaseChecklist(case_id, item_name=req.name_zh, category=req.category, is_required=req.is_required, status="pending", master_id=custom_id)`
- 返回 `_to_checklist_item(new_item)`
- 事务失败 rollback + 500

### 4. master_picker 合并加载

```python
def _load_master(db: Session | None = None) -> list[dict]:
    """config/checklist_master.yaml items + （db 存在时）checklist_library_custom 合并。"""
```

- 无 db → 仅 config（保持离线/测试兼容）
- 有 db → config items + 自定义项，自定义项映射：
  `{"id": row.id, "name_zh": row.name_zh, "name_en": row.name_en or "", "category": row.category, "applicable_when": row.applicable_when or {}, "bank_specific": row.bank_specific}`
- `pick_checklist()` 内 `_load_master()` 调用处改为 `_load_master(db)`

### 5. chat 工具 checklist_query（core/chat/tools.py）

```python
{
    "type": "function",
    "function": {
        "name": "checklist_query",
        "description": (
            "Vera 询问案件材料清单/缺口/进度时调用；"
            "use_ai=true 时按案件画像执行一次 AI 重选推荐（不覆盖已存清单）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "use_ai": {"type": "boolean", "description": "默认 false；Vera 要求优化/智能推荐时 true"}
            },
            "required": [],
        },
    },
},
```

`_checklist_query(arguments: dict, case_id: str, db: Session) -> dict`：
- case_id 空 → `{"ok": False, "error": "清单查询必须在案件对话中进行"}`
- 查询 `CaseChecklist` 按 case_id：done=status=="received" 数、total、missing 列表（最多 10 条）
- `use_ai` 为真 → `pick_checklist(case_info, db, use_ai=True)` 得到推荐 → summary 附"AI 推荐补充：..."（只推荐不落库）
- 返回 `{"ok": True, "done": n, "total": m, "missing": [...], "summary": "..."}`；异常捕获返回 `{"ok": False, "error": str(exc)}`

### 6. agents.yaml 追加（items 末尾）

```yaml
  - key: agent-checklist
    name: "清单 Agent (Checklist Ops)"
    description: "查材料缺口/标记已收/撤销匹配/按银行产品预选/递交前全绿检查"
    category: agent
    status: available
    triggers: ["这个案件还缺什么", "材料收齐了吗", "清单全绿了吗", "把 XX 标记已收", "预选清单"]
    flow_key: checklist_ops
    capability: "清单查询/更新/预选/递交检查"
    permission: "仅本系统清单；文件匹配不写客户文件夹"
    enabled_default: true
```

### 7. checklist_ops.yaml（新建）

```yaml
key: checklist_ops
name: "清单操作"
description: "查询案件清单缺口/进度，按画像预选推荐，按需 AI 重选"
triggers: ["这个案件还缺什么", "材料收齐了吗", "清单全绿了吗", "优化一下清单", "智能推荐清单", "预选清单"]
presentation: result_card
steps:
  - tool: checklist_query
    params:
      use_ai: "$arg.use_ai"
    output: result
  - tool: checklist_preview
    params:
      lender: "$arg.lender"
    output: preview
confirm_required: false
acceptance: []
```

### 8. runner.py 分发（仿 gap_analysis 分支）

```python
elif tool_name == "checklist_query":
    from core.models.orm import CaseChecklist
    if not case_id:
        res = {"status": "error", "message": "清单查询必须在案件对话中进行", "summary": "清单查询必须在案件对话中进行", "missing": []}
    else:
        items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).order_by(CaseChecklist.id).all()
        done = sum(1 for it in items if it.status == "received")
        missing = [it.item_name for it in items if it.status != "received"][:10]
        use_ai = bool(params.get("use_ai") or args.get("use_ai"))
        suggestion = ""
        if use_ai:
            from core.checklist.master_picker import pick_checklist
            from core.models.orm import Case
            case_obj = db.query(Case).filter(Case.id == case_id).first()
            if case_obj:
                recs = pick_checklist(
                    {"case_id": case_id, "lender": case_obj.lender or "CBA",
                     "employment_type": case_obj.employment_type or "PAYG",
                     "residency": case_obj.residency or "PR", "purpose": case_obj.purpose or "Purchase"},
                    db, use_ai=True,
                )
                if recs:
                    suggestion = "AI 推荐补充：" + "、".join(f"{p['name_zh']}" for p in recs[:5])
        res = {"status": "success", "done": done, "total": len(items), "missing": missing,
               "summary": f"清单进度 {done}/{len(items)}；缺失：{'、'.join(missing) if missing else '无'}" + (f"；{suggestion}" if suggestion else "")}
elif tool_name == "checklist_preview":
    from core.checklist.master_picker import pick_checklist
    from core.models.orm import Case
    if not case_id:
        res = {"status": "error", "message": "清单预选必须在案件对话中进行", "summary": "清单预选必须在案件对话中进行", "items": []}
    else:
        case_obj = db.query(Case).filter(Case.id == case_id).first()
        if not case_obj:
            res = {"status": "error", "message": "案件不存在", "summary": "案件不存在", "items": []}
        else:
            preview = pick_checklist(
                {"case_id": case_id, "lender": params.get("lender") or case_obj.lender or "CBA",
                 "employment_type": case_obj.employment_type or "PAYG",
                 "residency": case_obj.residency or "PR", "purpose": case_obj.purpose or "Purchase"},
                db, use_ai=False,
            )
            items_summary = "、".join(f"{p['name_zh']}" for p in preview[:10])
            res = {"status": "success", "count": len(preview), "items": preview[:10],
                   "summary": f"按画像预选 {len(preview)} 项：{items_summary}"}
```

### 9. pai.py 工具（仿 _gap_analysis）

```python
def _checklist_query(ctx) -> dict:
    """查询清单缺口/进度，可选 AI 重选推荐（WO-43）。"""
    ...（同 runner 逻辑，case_id 取 ctx.get("case_id")，db 取 ctx.get("db")）

def _checklist_preview(ctx) -> dict:
    """按案件画像纯规则预选推荐（WO-43，不覆盖已存清单）。"""
    ...（同 runner 的 checklist_preview 逻辑）
```

`_tools()` 返回列表追加 `_checklist_query`、`_checklist_preview`。

## 实施步骤

### Step 1：ORM 模型 + 迁移
- [ ] `core/models/orm.py` 末尾追加 `ChecklistLibraryCustom`（契约 1）
- [ ] 生成迁移：`python -m alembic revision --autogenerate -m "add checklist library custom"`（确认仅新表）
- [ ] 验证：`python -m alembic upgrade head` → `python -m alembic current` = 新 revision (head)

### Step 2：schemas + 端点
- [ ] `server/api/schemas.py` 追加 `ChecklistAddRequest`（契约 2）
- [ ] `server/api/files.py` 追加 `add_checklist_item`（契约 3，含 uuid 生成 `custom_{uuid8}`）
- [ ] 验证：`python -c "import server.api.files"` 无报错

### Step 3：master_picker 合并
- [ ] `core/checklist/master_picker.py` `_load_master(db=None)` + `pick_checklist` 传 db（契约 4）
- [ ] 验证：`python -c "from core.checklist.master_picker import pick_checklist; print('ok')"`

### Step 4：chat 工具
- [ ] `core/chat/tools.py` 追加 `checklist_query` 工具 + `_checklist_query`（契约 5）
- [ ] 验证：`python -c "from core.chat.tools import TOOL_SCHEMAS; assert any(t['function']['name']=='checklist_query' for t in TOOL_SCHEMAS)"`

### Step 5：能力中心 + 流程包
- [ ] `config/agents.yaml` 追加 agent-checklist（契约 6）
- [ ] 新建 `config/agent_flows/checklist_ops.yaml`（契约 7）
- [ ] `core/agents/flows.py` `_TOOL_WHITELIST` 加 `"checklist_query"`
- [ ] 验证：`python -c "from core.agents.flows import load_flows; f=load_flows(); assert 'checklist_ops' in f"`

### Step 6：runner + pai 分发
- [ ] `core/agents/runner.py` 加 `elif tool_name == "checklist_query"` 与 `checklist_preview`（契约 8）
- [ ] `core/agents/pai.py` 加 `_checklist_query`、`_checklist_preview` + 注册（契约 9）
- [ ] 验证：`python -c "import core.agents.runner, core.agents.pai"` 无循环导入

### Step 7：测试
- [ ] 新建 `tests/test_api/test_checklist_agent.py` + `tests/test_core/test_checklist_library.py`（用例见验收）
- [ ] 验证：两文件 `-v` 全绿

## 验收标准

### 自动验证
- `pytest tests/test_api/test_checklist_agent.py tests/test_core/test_checklist_library.py -v` → 全绿（用例 16）
- `pytest tests/ -q` → 全量 ≥ 基线 978，0 failed / 0 skipped
- `ruff check`（本次改动文件）→ All checks passed
- `python -m alembic current` → 新 head；`python -m alembic downgrade -1` 后 `upgrade head` 对称可逆

### 测试用例

tests/test_core/test_checklist_library.py：
1. `test_upsert_new_custom`：add → checklist_library_custom 一行，id 前缀 custom_，use_count=1
2. `test_upsert_same_name_same_category`：同名同分类再 add → 复用 id、use_count=2、不新增行
3. `test_category_validation`：非法 category → 422
4. `test_master_merge_loads_custom`：库中有自定义项 → `_load_master(db)` 包含它；`_load_master(None)` 不含
5. `test_pick_includes_custom`：自定义项 applicable_when=all → pick_checklist 候选含 custom id（use_ai=False）
6. `test_blank_name_422`：name_zh 空白 → 422

tests/test_api/test_checklist_agent.py：
7. `test_add_checklist_endpoint`：POST /api/cases/{id}/checklist → 201，案件清单含新项、master_id 为 custom id
8. `test_add_persists_case`：再次 GET checklist → 含新项
9. `test_chat_tool_query`：execute_tool("checklist_query", {}, case_id, "internal", db) → ok=True、done/total 正确
10. `test_chat_tool_query_no_case`：case_id="" → ok=False
11. `test_flow_checklist_ops`：run_flow(checklist_ops, case_id, {}, db) → summary 含"清单进度"
12. `test_agent_registry`：GET /api/agents/ 含 agent-checklist
13. `test_ai_pick_only_on_demand`：建档后无 AI 调用记录（use_ai 默认 false 不触发 LLM——用 monkeypatch 断言 pick_checklist use_ai=False）
14. `test_migration_reversible`：upgrade/downgrade 对称（复用 test_alembic 模式）
15. `test_preview_endpoint_flow`：run_flow(checklist_ops, case_id, {"lender":"CBA"}, db) → summary 含"预选"、count>0、不写案件清单
16. `test_preview_no_case`：case_id="" → status=error

### 手动验证
1. 中栏案件对话输入"这个案件还缺什么" → 结果卡显示清单进度与缺失项
2. 输入"优化一下清单" → 结果卡附"AI 推荐补充"（不覆盖已存清单）
3. 新增自定义项后，新案件建档预选（纯规则）候选包含该自定义项

### 交付偏离记录（2026-08-14，已提交 6bd2538）

1. **迁移手动编写**：dev 库含 sqlite-vec 虚拟表 `fact_embeddings`，autogenerate 反射失败（venv 无 vec0 模块）→ 手动编写单表迁移（内容 = 契约 1），由 test_alembic + 对称 downgrade/upgrade 验证等价；
2. **验收测试 11 语义修正**：契约 7 流程包两步（query→result + preview→preview）+ 契约 8 runner 最终 summary 取最后一步 → run_flow 后 summary 为"按画像预选"，与本施工单验收 11"summary 含'清单进度'"冲突；按契约 7/8 实际语义实现（断言"预选"），进度语义由 test_chat_tool_query 覆盖——本施工单验收 11 为笔误，以实际契约为准；
3. **范围外计数断言收尾**：test_agents.py L36（12→13）、test_agents_registry.py L33/49/53/60（12→13）、test_pai_orchestration.py L93（8→10），经 Vera 授权按 WO-41 惯例仅改数字与注释；
4. **沙箱 pytest 怪癖**：pytest 9 basetemp 0o700 目录不可访问 → 运行时包装器强制 0o777（不改仓库）；残留临时目录已由 Codex 清理。

---
⚠️ 执行纪律：
1. 只修改"改动范围"表内文件，绝不碰其他文件（尤其 config/checklist_master.yaml）
2. 契约中所有命名一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 验证命令
4. 验证失败 → 停下报告错误，不自作主张修计划外代码
5. 不引入技术约束外依赖；不创建范围外新文件
6. 完成后 git stage 范围表内文件，提交信息：`feat: WO-43 清单 Agent — 清单总项库沉淀 + 新增端点 + 对话查询/AI按需重选`
