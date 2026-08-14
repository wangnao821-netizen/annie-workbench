# 任务：执行 WO-37 决策先例检索施工单（Gemini 实施）

你是 Vera Workbench 的实施工程师（Gemini 3.5）。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-37-precedent-search.md（**唯一契约**，接口签名/字段名一字不改）
- 背景：借鉴 Semantica find_precedents——把已确认执行的 Action 结构化为可检索先例，case_chat 时把同客户/同类场景先例带进上下文，解决"同客户、同类案件建议别飘"
- 当前基线：`pytest tests/ -q` = 930 passed, 0 failed, 0 skipped

## 硬性纪律（违反即返工）
1. 只改施工单「改动范围」表内文件，共 3 个：
   - `core/knowledge/precedent.py`（新建，≤200 行）
   - `core/ai/context_builder.py`（修改，仅 `_build_team_experience` 内 case_chat 分支追加先例块）
   - `tests/test_core/test_precedent.py`（新建，10 用例）
2. 严禁修改：`core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、`server/*`、前端 `ui/`；严禁新增数据库迁移；严禁引入任何新 pip 依赖；严禁创建表外文件/目录
3. **PII 红线**：先例文本只取本地结构化字段（Action.title / ai_suggestion / vera_note / boss_decision），本单不做 LLM、不出外网
4. 注入仅限 `task_type == "case_chat"`；不改 `LAYER_ORDER` / 其他 budget；检索失败仅 `logger.warning` 不阻断
5. context_builder.py 内用**函数内局部导入**（`from core.knowledge.precedent import ...`），避免循环依赖
6. **签名修订（2026-08-14 已确认）**：`_build_team_experience` 追加可选关键字参数 `case_id: str | None = None`；唯一调用点 `assemble_context` L226 传 `case_id=case.id`；默认 None 不注入，其他调用零影响

## 接口契约速览（完整签名见施工单「二、接口契约」，一字不改）

```python
# core/knowledge/precedent.py
_LVR_TOLERANCE = 5.0  # |lvr 差| ≤ 5 视为同类场景

def find_precedents(case_id: str, db: Session, limit: int = 5) -> list[dict]:
    """同客户（同 case 已完成 Action）+ 同类场景（lender 相同 / purpose 相同 /
    |lvr 差| ≤ _LVR_TOLERANCE 的其他 case 已完成 Action），按 created_at 倒序，
    去重后最多 limit 条。返回 [{"case_id","action_id","title","type","decision",
    "outcome","lender","purpose","lvr","created_at"}]；无先例返回 []。"""

def build_precedent_block(precedents: list[dict], max_chars: int = 800) -> str:
    """格式化为注入文本块；无先例返回 ""。每行：
    [同类先例] {title}（{lender} · {purpose}）→ 决策：{decision}；结果：{outcome}
    超 max_chars 截断。"""
```

数据口径：决策 = `Action.status == "completed"`；`decision` = title +（ai_suggestion 非空时追加）；`outcome` = vera_note 或 boss_decision（非空取前者优先），均空 → "已确认执行"；lender/purpose/lvr 取自所属 Case（lvr None 不参与相似判定）；同客户优先，同 action_id 去重。

## 参考代码（先读再写）
- `core/knowledge/precedent.py` 前先读 `core/models/orm.py` 的 Action / Case 字段（L24 Case / L189 Action）
- `core/ai/context_builder.py` 的 `_build_team_experience`（先例块追加位置，约 L37-90）
- `core/chat/context.py` 的 `build_chat_layers`（case_chat 五层注入，测试用它验证注入）
- 测试风格参考 `tests/test_core/test_intent_router.py`（fixture + monkeypatch）

## 实施步骤
1. 读施工单全文 + 上述参考代码
2. Step 1：新建 core/knowledge/precedent.py（find_precedents + build_precedent_block）；验证 `ruff check core/knowledge/precedent.py`
3. Step 2：core/ai/context_builder.py 注入（case_chat 分支，函数内局部导入）；验证 `pytest tests/test_core/test_precedent.py -q`
4. Step 3：写 10 个测试用例（施工单列名：同客户 / 同 lender / lvr 接近±5 / pending 排除 / 无先例空 / limit / 去重 / block 空与内容 / case_chat 注入 / 其他任务类型不注入）
5. Step 4：全量门禁 + 提交

## 门禁（全绿才算完成）
- 专项：`pytest tests/test_core/test_precedent.py -q` → 10 项全绿
- 回归：`pytest tests/test_core/test_injection.py -q` → 全绿（五层注入不回归）
- 全量：`pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- `ruff check core/knowledge/precedent.py core/ai/context_builder.py tests/test_core/test_precedent.py` → All checks passed
- `python -c "import core.knowledge.precedent, core.ai.context_builder"` → 无循环导入
- `git diff` 核对：除「改动范围」表内 3 文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单 3 个文件；提交信息：`feat: WO-37 决策先例检索 — 同客户/同类场景先例进 case_chat 上下文`
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。
