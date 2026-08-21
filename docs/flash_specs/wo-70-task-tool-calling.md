# WO-70 任务创建双路径：规则快路径 + LLM 精准工具调用（根治口语变体）

> 状态：规划（评审后定稿）
> 关联：WO-41（create_task schema）、WO-64（意图驱动工具）、WO-65（slot_extractor）

## 背景与根因（时间线结论）

`create_task` tool schema 建于 WO-41，服务**非流式工具循环**（`run_chat_with_tools` 的 LLM 自主 tool calling）与 **PAI 编排**。前端实际走**流式**链路（`run_chat_with_tools_stream`），WO-64 将其改为“意图 fast-path 确定性执行”（规则强制调工具，保证触发率），WO-65 在 TASK_CREATE 分支引入 `slot_extractor` 解决标题清洗——**两条路并存，流式分支从未接 tool calling**。

当前痛点（实测）：`extract_task_slots` 的 confidence 判定有漏洞——只检查 title 长度与是否残留“记一下/建任务”，**不检查动作词是否命中**。如「好的把下周一的催收电话也排到这个时间」时间词命中、动作词未命中，title 残留口语却判 high，直接走快路径落脏标题。正则已陷入补丁循环（WO-65 已补 4 次）。

## 方案（评审后定稿）

TASK_CREATE 分支改为**双路径**：

```
1. extract_task_slots 规则快路径
   → 高置信（时间词命中 + 动作词命中 + title 无残留引导词）→ 直接 _create_task（零延迟）
2. 低置信/未命中 → call_llm_stream_with_tools（gateway 已有能力）
   → tools=[create_task]，tool_choice="required"
   → LLM 语义直出干净 title/deadline/priority → _create_task
   → LLM 仅回文本未调工具 → 降级用规则结果（不阻断）
```

`slot_extractor` 保留为快路径，不再承担“猜口语”职责；`llm_extract_slots` 的 JSON 兜底仅作最后降级。

## 技术约束

- 后端 Python 3.11 / FastAPI；**禁止新增依赖**（复用 `call_llm_stream_with_tools`）
- 禁止改动 `gateway.py` 工具调用实现（能力已具备）；禁止改动 `_create_task` 签名
- 脱敏/还原沿用 `desensitize/rehydrate`；失败静默降级不抛

## 改动范围（严禁超出）

| 文件 | 操作 | 内容 |
|---|---|---|
| `core/chat/slot_extractor.py` | 修改 | 修正 `extract_task_slots` confidence 判定：时间词命中 **且** 动作词命中 **且** title 无残留引导词（好的/把/也/顺便/排到等）才 high；否则 low 走 LLM |
| `core/chat/loop.py` | 修改 | TASK_CREATE 分支：高置信 → 现有直调；低置信 → 流式工具调用（收集 tool_calls → `_create_task`），文本-only 时降级规则结果 |
| `tests/test_slot_extractor.py` | 修改 | 追加 confidence 判定用例（口语变体 → low） |
| `tests/test_intent_driven_tools.py` | 修改 | 追加流式工具调用分支 mock 用例（tool_calls → 干净 title 落库） |
| `tests/test_task_tool_calling.py` | 新建（≤150 行） | 双路径专项测试 |

## 行为契约

### confidence 判定（slot_extractor）

`extract_task_slots` 返回 `confidence="high"` 需同时满足：
1. `raw_time` 非空（时间词命中）
2. `_ACTION_VERBS_PATTERN` 命中（动作词命中）
3. 清洗后 title 不含残留引导词（`好的|把|也|顺便|就|排到|安排` 等开头残留）
否则 `confidence="low"`。

### TASK_CREATE 分支（loop.py）

```python
slots = extract_task_slots(message)
if slots["confidence"] == "high":
    res = _create_task({...}, case_id, db)          # 零延迟快路径（现状）
else:
    # 流式精准工具调用：只给 create_task，tool_choice=required
    for item in gw.call_llm_stream_with_tools(
        text=DesensitizedText(f"用户说：{safe_message}\n请调用 create_task 工具创建任务。"),
        system_prompt="你是任务管理助手，从用户口语中提取真正的任务事项调用 create_task。",
        tools=[create_task_schema], tool_choice="required", max_tokens=150,
    ):
        if item.get("type") == "tool_calls":
            call = item["tool_calls"][0]
            args = call.get("arguments") or {}
            if args.get("title"):
                res = _create_task(args, case_id, db)
    # 未收到 tool_calls（LLM 只回文本）→ 降级用规则结果 + 提示
```

- 落库/卡片/事件逻辑与现状一致（`task_created` 卡片、`base_prompt` 注入结果）
- 分支为同步收集（阻塞主回复），但仅低置信时触发；高置信零额外调用
- 工具参数校验：title 为空 → 422 语义（`_create_task` 返回 ok=False，前端显示失败卡）

## 实施步骤

1. `slot_extractor.py`：修正 confidence 判定（含残留引导词检测），跑通既有用例
2. `loop.py`：TASK_CREATE 低置信分支接 `call_llm_stream_with_tools`（复用 `TOOL_SCHEMAS` 中 create_task 项），tool_calls 消费 + 降级
3. 测试：confidence 判定用例 + 分支 mock 用例 + 专项测试文件
4. 真实 LLM 复测（验收人执行，临时案件）：10 条新口语变体

## 真实 LLM 复测清单（≥10 条，验收人执行）

1. 「好的把下周一的催收电话也排到这个时间」
2. 「顺便记一下周三给律师发邮件」
3. 「嗯安排一下明天下午跟客户打电话确认材料」
4. 「行吧帮我记一下后天联系银行催批」
5. 「那就把周五的跟进会也排上」
6. 「下周一记一下，我要去电话和客户沟通一下」（回归）
7. 「帮我建个加急待办：周五前发邮件催流水」（回归）
8. 「月底前跟进银行批复」（回归，无动词）
9. 「今天内完成贷款申请」（回归）
10. 「提醒我下周三交税」（回归）

通过标准：**title 无口语残留 ≥ 90%**、deadline 非空率 ≥ 90%、无重复建任务、卡片正确。

## 验收标准

### 自动验证
- `pytest tests/test_slot_extractor.py tests/test_intent_driven_tools.py tests/test_task_tool_calling.py -q` 全绿
- 全量 pytest 0 failed；ruff（改动文件）All checks passed

### 真实复测（验收人执行）
- 上述 10 条：title 干净率 / deadline 折算率达标
- 高置信口语（含明确时间+动作）不触发额外 LLM 调用（日志验证无 create_task 工具调用）
- 低置信变体触发工具调用并落库干净 title

## 执行纪律

1. 只改“改动范围”表 5 个文件；不改 `gateway.py` 工具调用实现、不改 `_create_task` 签名
2. 工具调用失败必须静默降级（规则结果兜底），不阻断对话
3. 高置信快路径不得引入 LLM 调用（保持零延迟）
4. 完成后不 commit，等检查者核对 + 真实复测
