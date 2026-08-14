# WO-46b 共创弹窗深谈后端 — co-create 对话端点（案件全景 / 澄清 / 版本链 / 收尾）

> 依据：主文档 §二 定稿（2026-08-13）共创类 = **弹窗深谈（独立子会话，不污染主对话）**；
> 2026-08-16 Vera 拍板方案 A——邮件/催件/OS 回复统一对齐独立弹窗深谈。F-40 前端 CoCreateDialog 依赖本单端点。
> 执行者：opencode / Gemini，按 Step 执行，每步跑验证命令。

## 现状（已核实）

- `core/agents/draft_email.py` 已有：V1-V3 版本链（`_next_version`）、A/B 分支（branch_label）、
  confirm 写事件（`flow:draft_email`）、脱敏→LLM 英文草稿→还原、parent_message_id 可重跑；
- **缺口**：① 不注入案件全景（`_intent_prompt` 只有 intent/recipient/previous，LLM 不知道客户/银行/阶段/补件要求）；
  ② 无澄清意图环节（流程包一步直接出 V1）；③ confirm 只写事件、不建待办；
  ④ draft 消息写进 `CaseChatMessage`（session_id=`draft:{case_id}`）——前端 F-40 将不显示该 session 于主对话流。

## 技术约束

- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；
  基线：`pytest tests/ -q` = **1060 passed**（WO-44 后；若 WO-45/WO-46 已合入则用其新基线）；
- 禁止：修改前端 `ui/`；修改 `config/document_types.yaml` / `config/naming_rules.yaml`（只读真源）；
  新增任何 pip 依赖；把 WO-45 的 pyproject/uv.lock 改动纳入本单提交。

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|---|---|---|
| `core/agents/draft_email.py` | 修改 | 注入案件全景；新增 clarify 动作；confirm 可选建待办；prompt 带用户 message 指令 |
| `server/api/agent.py`（或新建 `server/api/co_create.py`） | 修改/新建 | `POST /api/agent/co-create/chat` 端点 |
| `server/api/schemas.py` | 修改 | `CoCreateRequest` / `CoCreateResponse` |
| `core/agents/flows.py` / `runner.py` / `pai.py` | 修改（最小） | 触发 followup/chaser/os_reply 时返回 co-create 打开指令（而非旧卡片），或保持兼容由前端判断 |
| `tests/test_api/test_co_create.py` | 新建 | 端点专项测试 |

## 接口契约（一字不改）

### `POST /api/agent/co-create/chat`

```json
body {
  "case_id": "str",
  "flow_key": "followup | chaser | os_reply",
  "action": "clarify | generate | version | branch | confirm",
  "message": "",                 // 用户本轮输入（clarify/generate/version 用；confirm 可空）
  "session_id": "",              // 恢复会话（默认 draft:{case_id}）
  "parent_message_id": null,     // version/branch/confirm 指定父版本
  "branch_label": "main",
  "create_todo": false           // confirm 时可选建待办
}
```

```json
返回 {
  "reply": "str",                 // VERA 对话回复（clarify=全景摘要+澄清问题；generate/version=更新说明）
  "draft": {"subject": "str", "body": "str", "version": "str", "branch_label": "str", "message_id": "int"} | null,
  "versions": [{"subject": "str", "body": "str", "version": "str", "branch_label": "str", "message_id": "int"}],
  "status": "clarifying | draft | confirmed | blocked",
  "event_id": "int | null",       // confirm 后事件
  "task_id": "int | null"         // confirm + create_todo=true 后任务
}
```

### 动作语义

- **clarify**：构建案件全景（复用 `core.ai.context_builder` / `case_context` 的摘要注入；字段至少含
  客户名/银行/阶段/补件要求/相关待办 Top3）→ reply = 全景摘要 + 澄清问题（规则模板 + LLM 补强，
  1-3 轮上限由前端控制）；不生成草稿；
- **generate**：prompt = 案件全景 + 用户 message 意图 + flow_key 意图模板 → 出 V1；
- **version**：prompt = 全景 + 用户 message 修改指令 + 上一版正文（≤800 字）→ V2+；
- **branch**：同 version，但 branch_label='B'；
- **confirm**：写 `flow:draft_email` 事件（已有）+ `create_todo=true` 时建 Action
  （type=`FOLLOWUP_TODO`、title=草稿 subject、status=pending、assignee=vera）；返回 confirmed + event_id/task_id。

## 红线

- 脱敏 → LLM → 还原（沿用现有 `desensitize/rehydrate`）；**只出草稿，绝不发送**；
- confirm 建待办必须 `create_todo=true` 显式传入（Vera 在前端勾选）；
- 主对话消息流不展示 draft session（前端过滤 `session_id` 以 `draft:` 开头，后端不改查询语义）；
- 不新增 pip 依赖；不碰 WO-45 的 pyproject/uv.lock。

## 实施步骤（每步跑验证命令）

1. 读施工单全文 + `core/agents/draft_email.py` + `core/ai/context_builder.py`；
2. `draft_email.py`：注入全景 + clarify + create_todo → `python -c "import core.agents.draft_email"` 无报错；
3. `server/api/agent.py` 加 co-create 端点 + `schemas.py` 模型 →
   `python -c "import server.main"` 无报错；
4. `tests/test_api/test_co_create.py` → `pytest tests/test_api/test_co_create.py -v` 全绿；
5. 全量 `pytest tests/ -q` ≥ 基线，0 failed / 0 skipped；
6. `ruff check`（本单所有 py）→ All checks passed；
7. `git commit`：`feat: WO-46b 共创弹窗深谈后端 — co-create 端点（全景/澄清/版本链/收尾）（N 文件）`。

## 测试要点（tests/test_api/test_co_create.py）

- clarify：返回 reply 含案件全景（客户名/银行/阶段）且不落草稿；无案件 404；
- generate：出 V1，versions 长度 1，脱敏/还原正常（断言无 PERSON_1 泄漏到回复？——回复含还原值）；
- version：V2 且 reference 上一版；branch：B 分支独立版本链；
- confirm：写事件（可查 listContextEvents）+ create_todo=true 建 Action；false 不建；
- blocked：无 case 或 confirm 无父版本 → status=blocked + reason；
- 白名单：flow_key 非法 → 422。

## 交付报告要求

- 改动文件清单 + 行数；五动作 TestClient 实测（状态码/返回结构/落库）；
- 案件全景注入样例（脱敏后）；confirm 事件 + 待办落库证据；全量 pytest / ruff 结果。
