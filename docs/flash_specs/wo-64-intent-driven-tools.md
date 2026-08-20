# WO-64 意图驱动工具执行（P2b）— 执行规范

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / pathlib
- 禁止：引入任何新的 pip 依赖；禁止创建"改动范围"表以外文件
- 禁止：修改客户文件夹/文件；测试一律 tmp_path + mock 工具，不读真实客户文件
- 允许：复用下列既有 core 函数（不要重写实现）：
  - `core.agents.declaration_check.run_declaration_check`
  - `core.policy.engine.run_policy_check(case_id, args, db)`
  - `core.case_folder.gap_analysis.analyze_gaps(case, db)`
  - `core.agents.draft_email.run_co_create(case_id, args, db, track)`
  - `core.calculator.assess.assess(request, profile)`

## 背景

实测发现：意图分类器（P2）准确率 90%，但只有 `folder_lookup` 接入了"意图→强制调工具"，
其余意图（计算器/建任务/清单/声明检查/政策/邮件）分类后靠 LLM 自觉调工具，实测触发率 0%。
本单把意图路由补完整：**每个业务意图强制驱动对应工具执行**，并修复 Fast-Path 正则漏判、
`.msg` 误命中与"对账单"短词漏检。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/chat/intent_router.py` | 修改 | ChatIntent 枚举 + Fast-Path 正则表 |
| `core/chat/tools.py` | 修改 | `execute_tool` 分支（约 L145-157）追加 5 个工具 |
| `core/chat/loop.py` | 修改 | 意图驱动分支（约 L180-200，紧邻 FOLDER_LOOKUP 分支） |
| `core/case_folder/lookup.py` | 修改 | 匹配结果过滤 `.msg`（约 L83-110 匹配循环） |
| `core/checklist/spoken_aliases.py` | 修改 | "对账单"等纯词短别名补全 |
| `tests/test_intent_router.py` | 修改 | 追加用例 |
| `tests/test_intent_driven_tools.py` | **新建** | ≤150 行 |
| `tests/test_spoken_lookup.py` | 修改 | 追加 `.msg` 过滤 / 短词用例 |

⚠️ 严禁修改上表以外文件；严禁改 `core/agents/*`、`core/calculator/*` 等既有实现。

## 接口契约（一字不改）

### 1. ChatIntent 枚举（intent_router.py）

```python
class ChatIntent(str, Enum):
    META_HELP = "meta_help"
    STATUS_ACK = "status_ack"
    FOLDER_LOOKUP = "folder_lookup"
    CALCULATOR_ASSESS = "calculator_assess"
    CHECKLIST_GAP = "checklist_gap"
    TASK_CREATE = "task_create"            # 新增：建任务/记待办/提醒
    DECLARATION_CHECK = "declaration_check" # 新增：申报一致性检查
    DRAFT_EMAIL = "draft_email"            # 新增：写邮件/催件/草稿
    POLICY_QUERY = "policy_query"          # 新增：查银行政策
    CASE_STRATEGY = "case_strategy"
```

### 2. Fast-Path 正则补漏（intent_router.py 的 `_*_PATTERNS`）

- `_FOLDER_LOOKUP_PATTERNS` 追加：`r"流水"`（含"流水"即查文件）、`r"找.{0,8}?(流水|对账单|账单)"`
- `_CALCULATOR_PATTERNS` 追加：`r"能贷多少|贷款额度|还款能力|月供多少"`（独立问句）、
  `r"评估.{0,8}?还款"`、`r"算.{0,8}?(额度|月供|利息)"`
- 新增 `_TASK_CREATE_PATTERNS`：`r"(记一下|记一笔|帮我记|建(一个)?任务|创建任务|安排一下|提醒我|设一个提醒)"`
- 新增 `_DECLARATION_PATTERNS`：`r"(检查|核对|比对).{0,8}?(申报|材料一致性|一致性)"`
- 新增 `_DRAFT_EMAIL_PATTERNS`：`r"(写|起草|拟).{0,8}?(邮件|信|催件|催)"`
- 新增 `_POLICY_PATTERNS`：`r"(查|看).{0,8}?(政策|policy|银行.{0,4}要求)"`

Fast-Path 命中顺序：META_HELP → STATUS_ACK → TASK_CREATE → FOLDER_LOOKUP →
DRAFT_EMAIL → POLICY_QUERY → DECLARATION_CHECK → CALCULATOR_ASSESS → LLM 语义 → fallback。

### 3. tools.py 追加 5 个工具分支（execute_tool 内）

```python
def _calculator_assess(arguments: dict, case_id: str, db: Session) -> dict:
    """贷款能力测算：案件画像齐全时调 calculator.assess；不足返回 needs_form 卡片。
    返回统一为 {"status": "result"|"needs_form", "card": {...}, "summary": str}。"""

def _declaration_check(arguments: dict, case_id: str, db: Session) -> dict:
    """申报一致性检查：调 run_declaration_check（文件为空时按清单缺口给提示）。"""

def _gap_analysis(arguments: dict, case_id: str, db: Session) -> dict:
    """材料缺口分析：analyze_gaps(case, db)。"""

def _policy_check(arguments: dict, case_id: str, db: Session) -> dict:
    """政策查询：run_policy_check(case_id, {"query": arguments.get("query","")}, db)。"""

def _draft_email(arguments: dict, case_id: str, db: Session) -> dict:
    """邮件起草：run_co_create(case_id, {"action": "generate", "message": arguments.get("message","")}, db, track)。"""
```

`execute_tool` 分支追加：`calculator_assess / declaration_check / gap_analysis / policy_check / draft_email`
（对应 `_TOOL_NAMES` 与 PAI 白名单一致）。

### 4. loop.py 意图驱动分支（紧邻现有 FOLDER_LOOKUP 分支，参照其模式）

```python
elif intent == ChatIntent.CALCULATOR_ASSESS:
    from core.chat.tools import _calculator_assess
    res = _calculator_assess({"request": message}, case_id, db)
    # 有卡片则 yield tool_cards；summary 注入 base_prompt
elif intent == ChatIntent.TASK_CREATE:
    from core.chat.tools import _create_task
    title = _extract_task_title(message)   # 新增辅助：去掉"帮我记一下/建一个任务"等前缀，取 ≤40 字
    res = _create_task({"title": title, "context": {"source": "chat"}}, case_id, db)
    # ok=True → 卡片"任务已创建"; ok=False → 卡片/文本说明失败原因（如"需在案件对话中创建"）
elif intent == ChatIntent.CHECKLIST_GAP:
    from core.chat.tools import _checklist_query, _gap_analysis
    q = _checklist_query({"query": "missing"}, case_id, db)
    g = _gap_analysis({}, case_id, db)
    # 合并两结果卡片
elif intent == ChatIntent.DECLARATION_CHECK:
    from core.chat.tools import _declaration_check
    res = _declaration_check({}, case_id, db)
elif intent == ChatIntent.DRAFT_EMAIL:
    from core.chat.tools import _draft_email
    res = _draft_email({"message": message}, case_id, db)
elif intent == ChatIntent.POLICY_QUERY:
    from core.chat.tools import _policy_check
    res = _policy_check({"query": message}, case_id, db)
```

每个分支执行后：有卡片 → `yield {"event": "tool_cards", "data": {...}}`；
`res["summary"]`（若有）追加到 `base_prompt` 供 LLM 综合；工具失败不阻断文本生成
（失败信息以文本提示注入，不抛异常）。

辅助函数（loop.py 内新增，≤15 行）：
```python
def _extract_task_title(message: str) -> str:
    """从口语中提取任务标题：去前缀（帮我记一下/建一个任务/创建任务/提醒我/记一笔等），
    去尾标点，长度 ≤ 40 字；剩余为空时用整句。"""
```

### 5. lookup.py `.msg` 过滤 + spoken_aliases 短词

- lookup.py 匹配循环（约 L83-110）：当 query 意图为"对账单/流水/账单类材料"时，
  跳过 `.msg`/`.eml` 文件（用 `spoken_aliases.resolve_spoken_query` 的返回值
  `target_master` 是否为材料类判断；或直接：命中列表过滤掉 `.msg` 后缀）。
- spoken_aliases.py：确认 `"对账单"` / `"负债单"` / `"账单"` 均映射
  `existing_loan_statement` 且 target_keywords 非空（若 `resolve_spoken_query("对账单")`
  返回空 keywords 则补全，例如 keywords=["liability","loan statement","homeloan"]）。

## 实施步骤

### Step 1：intent_router.py
- [ ] 枚举追加 4 个新意图；正则表补漏 + 新增 4 个 `_*_PATTERNS`
- [ ] `classify_chat_intent` 的 Fast-Path 顺序按契约调整；LLM 语义路由的候选列表同步补新意图
- [ ] 验证：`python -c "from core.chat.intent_router import classify_chat_intent, ChatIntent; print(len(list(ChatIntent)))"` 输出 10

### Step 2：tools.py
- [ ] 追加 `_calculator_assess/_declaration_check/_gap_analysis/_policy_check/_draft_email` 五个函数（契约签名）
- [ ] `execute_tool` 追加 5 个分支（与 `_TOOL_NAMES` 一致）
- [ ] 验证：`python -c "from core.chat.tools import execute_tool; r=execute_tool('gap_analysis', {}, 'CASE-T', 'internal', None); print(r)"` 不抛 import 错误
  （None db 仅测调用链不崩；真实执行由测试 mock）

### Step 3：loop.py
- [ ] 新增 `_extract_task_title`；按契约追加 6 个意图驱动分支（CALCULATOR/TASK/CHECKLIST_GAP/DECLARATION/DRAFT/POLICY）
- [ ] 每个分支按契约处理 tool_cards 事件 + summary 注入；失败不阻断
- [ ] 验证：`python -c "import core.chat.loop"` 无语法/导入错误

### Step 4：lookup.py + spoken_aliases.py
- [ ] lookup 匹配结果过滤 `.msg`/`.eml`（材料类查询）
- [ ] spoken_aliases 确认/补全"对账单/负债单/账单"短词映射
- [ ] 验证：`python -c "from core.checklist.spoken_aliases import resolve_spoken_query; print(resolve_spoken_query('对账单'))"` 输出含 target_keywords 非空

### Step 5：测试
- [ ] `tests/test_intent_router.py` 追加：新意图 6 条（记一下/建任务/检查申报/写催件/查政策/能贷多少/把流水找出来/评估还款能力）断言分类
- [ ] 新建 `tests/test_intent_driven_tools.py`：monkeypatch `core.chat.loop.execute_tool`（或各 `_xxx` 函数），
  逐意图驱动流式生成器，断言对应工具被调用 + tool_cards 事件；mock 工具返回 ok=True
  与 ok=False（失败不抛异常仍出 done）
- [ ] `tests/test_spoken_lookup.py` 追加：临时文件夹含 `Liability.pdf` 与 `xxx.msg` →
  query"对账单"只命中 `.pdf` 不命中 `.msg`；query"对账单"短词命中 liability
- [ ] 验证：`pytest tests/test_intent_router.py tests/test_intent_driven_tools.py tests/test_spoken_lookup.py -q` 全绿

## 验收标准

### 自动验证
- 三个测试文件全绿；`ruff check`（本次改动 7 个 py）All checks passed
- `pytest tests/test_core/test_chat_stream.py -q` 无回归（流式工具循环仍正常）

### 复测（真实 LLM，验收人执行）
对下列语句走 `/api/chat/stream`（临时案件 + 临时文件夹）：
1. 意图分类准确率 ≥ 95%：
   - 计算器："帮我算一下能不能借 100 万"、"能贷多少？"、"算算月供"
   - 任务："帮我记一下下周一电话客户要资料"、"建一个任务：周五前发邮件"
   - 文件夹："文件夹里查一下现有贷款对账单"、"把银行流水的文件找出来"
   - 清单/声明/政策/邮件：各 2 条
2. 工具触发成功率 ≥ 85%：上述语句对应工具（calculator_assess/create_task/folder_lookup/
   checklist_query/declaration_check/policy_check/draft_email）均被强制调用并产生 tool_cards 或明确提示
3. 任务用例：对话创建后 `actions` 表出现新任务（title 非空）

---
⚠️ 执行纪律：
1. 只修改"改动范围"表 8 个文件；严禁改 `core/agents/*`、`core/calculator/*`、`core/policy/*`
2. 契约中函数名/意图名/事件结构一字不改
3. 每 Step 完成立即验证；失败停下报告，不自作主张
4. 测试只用 tmp_path + mock；绝不读真实客户文件夹
5. 完成后不 commit，等检查者核对
