# WO-37 决策先例检索 — 执行规范

> 状态：待执行（2026-08-14 起草）
> 背景：借鉴 Semantica `find_precedents`（决策先例检索）。Vera 最关心"同客户、同类案件建议别飘"——把已确认执行的 `Action`（决策）结构化为可检索先例，AI 建议时把同类先例带进上下文。

## 一、技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Pydantic v2
- 禁止：引入任何新的 pip 依赖
- 禁止：创建计划外的新文件/新目录
- 禁止：新增数据库迁移（复用现有 `actions` / `case_timeline_events` / `cases` 表，无新列）
- 禁止：修改 `core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、`server/*`、前端 `ui/`
- 只允许修改/新建：
  - `core/knowledge/precedent.py`（新建，≤200 行）
  - `core/ai/context_builder.py`（修改，最小改动：case_chat 任务类型 team 层尾部拼先例块）
  - `tests/test_core/test_precedent.py`（新建）
- PII 红线：先例文本只取本地结构化字段（Action.title / ai_suggestion / vera_note / boss_decision），不出外网；如需 LLM 摘要另行脱敏（本单不做 LLM）

## 二、接口契约（变量名/函数名/字段名写死，一字不改）

### 核心模块（core/knowledge/precedent.py，新建）

```python
"""决策先例检索 — 同客户 + 同类场景（WO-37，借鉴 Semantica find_precedents）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Action, Case

logger = get_logger(__name__)

_LVR_TOLERANCE = 5.0  # |lvr 差| ≤ 5 视为同类场景


def find_precedents(case_id: str, db: Session, limit: int = 5) -> list[dict]:
    """检索决策先例：同客户（同 case 已完成 Action）+ 同类场景（lender 相同 /
    purpose 相同 / |lvr 差| ≤ _LVR_TOLERANCE 的其他 case 已完成 Action），
    按 created_at 倒序，去重后最多 limit 条。

    Args:
        case_id: 当前案件 ID
        db: SQLAlchemy session
        limit: 返回条数上限（默认 5）

    Returns:
        [{"case_id", "action_id", "title", "type", "decision", "outcome",
          "lender", "purpose", "lvr", "created_at"}]；无先例返回 []。
    """


def build_precedent_block(precedents: list[dict], max_chars: int = 800) -> str:
    """把先例列表格式化为注入文本块；无先例返回空串。每行：
    [同类先例] {title}（{lender} · {purpose}）→ 决策：{decision}；结果：{outcome}
    超 max_chars 截断（保留头部）。
    """
```

### 数据口径

- 决策 = 已确认执行的 `Action`：`status == "completed"`
- `decision` = `title` +（`ai_suggestion` 非空时追加）
- `outcome` = `vera_note` 或 `boss_decision`（非空取前者优先）；均空 → `"已确认执行"`
- `lender/purpose/lvr` 取自 Action 所属 `Case`（lvr 为 None 时不参与 lvr 相似判定）
- 同客户先例优先保留；同类场景去重（同 action_id 只保留一次）

### 上下文注入（core/ai/context_builder.py，最小改动）

- 仅 `task_type == "case_chat"` 时注入；其他任务类型零影响
- 在 `_build_team_experience` 返回文本末尾追加先例块：`\n【决策先例】\n{block}`
- 先例检索失败仅 `logger.warning` 并返回原团队经验文本（不阻断）
- 总长度仍受 `BUDGET_TEAM_EXP`（1500 字符）截断约束；**不改 `LAYER_ORDER` / 其他 budget**

## 三、实施步骤（每步完成即运行验证命令）

### Step 1：先例模块
- [ ] 新建 `core/knowledge/precedent.py`，按契约实现 `find_precedents` / `build_precedent_block`
- [ ] 同客户：`Action.case_id == case_id and Action.status == "completed"`，按 created_at 倒序
- [ ] 同类场景：其他 case（`Case.id != case_id`）且 `status == "completed"`，条件 `lender 相同 OR purpose 相同 OR (lvr 均非 None 且 |lvr1-lvr2| ≤ 5)`
- [ ] 合并去重（同 action_id 取首次出现），截取 limit 条
- [ ] 验证：`ruff check core/knowledge/precedent.py` → All checks passed

### Step 2：上下文注入
- [ ] `core/ai/context_builder.py`：`_build_team_experience` 内 `from core.knowledge.precedent import build_precedent_block, find_precedents`（函数内局部导入，避免循环依赖）
- [ ] `case_chat` 分支：`precs = find_precedents(case_id, db)` → `block = build_precedent_block(precs)` → 非空时追加到 experiences 末尾
- [ ] 不改变函数签名；其他调用点零影响
- [ ] 验证：`pytest tests/test_core/test_precedent.py -q` → 全绿

### Step 3：测试
- [ ] 新建 `tests/test_core/test_precedent.py`，用例（每个用例一行注释说明断言）：
  1. `test_same_case_precedent_found` — 同 case 完成 Action → 返回且含 action_id
  2. `test_same_lender_precedent_found` — 其他 case 同 lender 完成 Action → 返回
  3. `test_lvr_close_precedent_found` — lvr 差 4 → 返回；差 8 → 不返回
  4. `test_pending_action_not_included` — status=pending 的 Action 不返回
  5. `test_no_precedent_returns_empty` — 无任何完成 Action → `[]`
  6. `test_limit_respected` — 6 条先例 → 只返回 5 条且倒序
  7. `test_dedup_same_action` — 同客户与同类场景命中同一 Action → 只出现一次
  8. `test_build_block_empty_and_content` — 空列表 → `""`；有先例 → 含"【决策先例]"文本结构
  9. `test_injected_into_case_chat_context` — `build_chat_layers(case_id, "你好", "internal", db)` 的 team 层含先例文本
  10. `test_not_injected_other_task_types` — `assemble_context(case_id, "email_draft", ...)` team 层不含"决策先例"
- [ ] 验证：`pytest tests/test_core/test_precedent.py -q` → 全绿

### Step 4：全量门禁
- [ ] `pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- [ ] `ruff check core/knowledge/precedent.py core/ai/context_builder.py tests/test_core/test_precedent.py` → All checks passed
- [ ] `python -c "import core.knowledge.precedent, core.ai.context_builder"` → 无循环导入

## 四、本次改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/knowledge/precedent.py` | 新建 | — |
| `core/ai/context_builder.py` | 修改 | `_build_team_experience` 内 case_chat 分支（约 L37-90） |
| `tests/test_core/test_precedent.py` | 新建 | — |

⚠️ 严禁修改上表以外的任何文件。
⚠️ 严禁重命名、移动或删除任何现有文件。
⚠️ 严禁修改 import 以外的现有代码逻辑（context_builder.py 仅允许追加先例块）。

## 五、验收标准

### 自动验证（必须全部通过）
- `pytest tests/test_core/test_precedent.py -q` → 10 项全绿
- `pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- `ruff check`（上表 py 文件）→ All checks passed

### 手动验证
1. 单测已覆盖：同客户/同 lender/lvr 接近/未完成排除/去重/limit/注入
2. `build_chat_layers` 的 team 层在 case_chat 时含"【决策先例】"
3. 非 case_chat 任务类型上下文不含先例（零回归）

---
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名严格按照"接口契约"章节的定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"章节中未列出的依赖库
6. 不要创建任何"改动范围"表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
