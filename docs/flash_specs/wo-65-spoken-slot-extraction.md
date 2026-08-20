# WO-65 口语槽位提取（根治版：规则快路径 + LLM 兜底 + 槽位落库）— 执行规范

> 状态：修订版（评审后定稿，根治"测一个漏一个"）
> 关联：WO-64（意图驱动工具）、P3（BrainFact 槽位持久化）

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy / pathlib
- 禁止：引入新的 pip 依赖（时区用标准库 `zoneinfo`，时区名取 `settings.analytics_tz`，默认 `Australia/Sydney`）
- 禁止：创建"改动范围"表以外文件；禁止改 `core/agents/*`、`core/calculator/*`、`core/policy/*` 实现
- 允许：复用 `core.ai.gateway.ApiGateway`（LLM 兜底）、`core.facts.slots`（P3 槽位落库）、
  `core.pii.gateway.desensitize/rehydrate`、`core/chat/tools.py` 的 `_create_task/_calculator_assess`
- 测试：tmp_path + mock LLM；真实复测由验收人执行（不读真实客户文件）

## 背景与根因

实测输入 `"下周一记一下，我要去电话和客户沟通一下"`：意图正确命中 task_create，但
① 标题残留口语（"下周一记一下，我要去…"）；② deadline 未折算（None）；③ 全局对话静默退化。

旧方案（纯正则）评审结论：**正则打补丁仍会"测一个漏一个"，无法根治**。
根治 = 两段式：**规则快路径（<1ms）→ 未命中/低置信时 LLM 结构化提取（一次轻量调用）→
槽位落库（Action.deadline / BrainFact）→ 注入工具**。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/chat/time_parser.py` | **新建**（≤85 行） | 相对时间折算（Sydney 时区） |
| `core/chat/slot_extractor.py` | **新建**（≤160 行） | 规则槽位提取 + LLM 兜底 |
| `core/chat/loop.py` | 修改 | TASK_CREATE / CALCULATOR_ASSESS 分支、全局引导 |
| `core/chat/tools.py` | 修改 | `_calculator_assess` 接受显式槽位参数 |
| `tests/test_slot_extractor.py` | **新建**（≤160 行） | 规则用例 + LLM 兜底 mock 用例 |

⚠️ 严禁修改上表以外文件；严禁改 `core/facts/slots.py`（只调用其现有函数）。

## 接口契约（一字不改）

### 1. time_parser.py

```python
def resolve_relative_time(expr: str, ref_time: datetime | None = None) -> str | None:
    """把口语相对时间折算为 Sydney 时区 ISO 字符串（如 '2026-08-24T17:00:00+10:00'）。

    规则（全部纯正则 + datetime，<1ms）：
      "今天/今晚"      -> 今天 18:00（今晚 21:00）
      "明天/明早/明天下午" -> 明天 09:00 / 09:00 / 15:00
      "后天"           -> +2 天 09:00
      "下周X"          -> 下一自然周的对应工作日 17:00
      "本周X / X前"    -> 本周对应工作日 17:00（X 为 一~日；本周已过则用下周对应日）
      "N天后 / N小时后" -> timedelta 折算
      "月底"           -> 当月最后一天 17:00
    返回 None 表示未识别（交给 LLM 兜底）。
    歧义规则：今天是周日时说"下周一" = 明天（+1 天）；其他情况"下周X" = 下一自然周。"""
```

### 2. slot_extractor.py

```python
def extract_task_slots(message: str, ref_time: datetime | None = None) -> dict:
    """规则层任务槽位提取（快路径）。返回：
    {"title": str, "deadline": str|None, "priority": "high"|"normal",
     "raw_time": str|None, "confidence": "high"|"low"}
    标题清洗：剥离时间词/动词短语（记一下/记一笔/帮我记/建个任务/安排一下/提醒我/设个提醒/加急），
    剥离首尾语气词与标点；"我要去电话和客户沟通" -> "电话和客户沟通"（去'我要去'）。
    priority：含 加急/马上/今天内/尽快/立刻 -> high。
    规则未识别时间词或标题清洗置信低（如含未知口语）时 confidence="low"。"""


def llm_extract_slots(message: str, intent: str, case_id: str | None, db: Session) -> dict:
    """LLM 兜底：一次轻量调用，输出 JSON {"title", "deadline"|null, "priority"}。
    输入 desensitize -> gateway.call_llm(max_tokens=120) -> rehydrate；失败返回 {}（不阻断）。"""


def extract_financial_slots(message: str, db: Session, case_id: str | None = None) -> dict:
    """计算器槽位：提取 target_loan / spouse_income / interest_rate / employment_income。
    规则命中数字 + 单位；未命中关键槽位时 confidence="low"（交 LLM 兜底）。"""
```

### 3. loop.py 分支改造

- **TASK_CREATE**（有 case_id）：`slots = extract_task_slots(message)`
  - `slots["confidence"] == "high"` → 直接用；
  - 否则 `slots = llm_extract_slots(message, "task_create", case_id, db)` 合并（LLM 缺失字段保留规则结果）；
  - `_create_task({"title": slots["title"], "deadline": slots["deadline"], "priority": slots["priority"]}, case_id, db)`
  - 卡片展示：`📋 任务已创建：{title}（{deadline 或 '未设期限'}，{priority}）`
- **TASK_CREATE**（无 case_id / 全局）：不静默退化，产出引导卡片
  `{"type": "needs_case", "title": "📌 请选择关联案件", "payload": {"hint": "在右栏选择案件后再记任务，任务会归到该案件"}}`
- **CALCULATOR_ASSESS**：`slots = extract_financial_slots(message, db, case_id)`
  - `confidence=="low"` → `llm_extract_slots(message, "calculator_assess", case_id, db)` 合并；
  - 关键槽位（target_loan 或收入）写入 BrainFact（P3 复用 `core.facts.slots` 现有写函数，签名以该文件为准）；
  - `_calculator_assess({**slots}, case_id, db)` 执行。

### 4. tools.py `_calculator_assess` 参数扩展

```python
def _calculator_assess(arguments: dict, case_id: str, db: Session) -> dict:
    """贷款测算：arguments 可含 target_loan/spouse_income/interest_rate/employment_income
    （来自 slot_extractor）；有显式槽位时优先覆写案件画像；画像与槽位都不足 ->
    needs_form 卡片列出缺失项。"""
```

## 实施步骤

### Step 1：time_parser.py
- [ ] 实现 `resolve_relative_time`（规则齐全 + Sydney 时区 + 歧义规则）
- [ ] 验证：`python -c "from core.chat.time_parser import resolve_relative_time; print(resolve_relative_time('下周一'))"` 输出 ISO 含 +10:00

### Step 2：slot_extractor.py
- [ ] 实现 `extract_task_slots` / `llm_extract_slots` / `extract_financial_slots`
- [ ] LLM 兜底：desensitize → call_llm → 解析 JSON → rehydrate；异常返回 {} 不抛
- [ ] 验证：`python -c "from core.chat.slot_extractor import extract_task_slots; print(extract_task_slots('下周一记一下，我要去电话和客户沟通一下'))"`
  期望 title 含"电话"、deadline 非空、无"记一下"

### Step 3：loop.py
- [ ] TASK_CREATE 分支：两段式提取 → `_create_task` 透传 deadline/priority → 卡片显示期限
- [ ] TASK_CREATE 无 case_id：needs_case 引导卡片（不再静默）
- [ ] CALCULATOR_ASSESS 分支：`extract_financial_slots` → 关键槽位写 BrainFact → `_calculator_assess`
- [ ] 验证：`python -c "import core.chat.loop"` 无错；三个分支 mock 走通（参照 test_intent_driven_tools 风格）

### Step 4：tools.py
- [ ] `_calculator_assess` 支持显式槽位覆写 + 缺失项 needs_form 卡片
- [ ] 验证：`python -c "from core.chat.tools import _calculator_assess; print(_calculator_assess({}, 'C', None))"` 不抛 import 错

### Step 5：测试
- [ ] `tests/test_slot_extractor.py`（≤160 行）：
  - 规则用例 ≥15：时间（今天/明天/后天/下周X/周X前/N天/月底）+ 标题清洗（下周一记一下/帮我建个加急任务/设个提醒）+ 优先级（加急/马上/正常）
  - LLM 兜底：`resolve_relative_time` 返回 None 时 mock `llm_extract_slots` 返回 JSON，验证合并与落参
  - calculator 槽位：`"加配偶收入8万能不能借180万"` → spouse_income=80000、target_loan=1800000
- [ ] 更新 `tests/test_intent_driven_tools.py`：TASK_CREATE 分支断言卡片含 deadline/priority
- [ ] 验证：三个测试文件全绿（-s -p no:cacheprovider 绕过本机 pytest capture 问题）

## 验收标准

### 自动验证
- `pytest tests/test_slot_extractor.py tests/test_intent_driven_tools.py tests/test_intent_router.py -q -s -p no:cacheprovider` 全绿
- `ruff check`（本次 5 个 py）All checks passed
- 既有回归：`pytest tests/test_api/test_chat_protocol.py tests/test_core/test_chat_stream.py tests/test_task_engine.py -q -s -p no:cacheprovider` 全绿

### 真实 LLM 复测（验收人执行，20+ 新说法，临时案件）
1. 任务创建：`"下周一记一下，我要去电话和客户沟通"`、`"帮我建个加急待办：周五前发邮件催流水"`、
   `"设个提醒，下周五前给律师发邮件"`、`"月底前跟进银行批复"` 等 ≥10 条 →
   **title 无口语残留 ≥90%**、**deadline 非空率 ≥90%**（"下周一/周五前/月底"能折算）、priority 正确
2. 全局对话：无案件时说"记一下下周一电话客户" → 出现 needs_case 引导卡片（不静默）
3. 计算器：`"加配偶收入8万能不能借180万"`、`"利率6.2%月供多少"` → 卡片含对应槽位值，
   且配偶收入写入 BrainFact（P3 可查）
4. 全链路不回归：folder/checklist/policy/draft 仍按 WO-64 触发

---
⚠️ 执行纪律：
1. 只改"改动范围"表 6 个文件；严禁改 `core/facts/slots.py`（只调用）
2. 契约函数名/返回键一字不改；时间输出必须带 Sydney 时区
3. 每 Step 完成立即验证；失败停下报告，不自作主张
4. LLM 兜底失败必须静默降级（返回 {}，不抛异常、不阻断对话）
5. 完成后不 commit，等检查者核对 + 真实复测
