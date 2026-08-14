# 任务：执行 WO-46b 共创弹窗深谈后端施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息

- 仓库：`D:\vera-workbench`（Windows）；Python：`D:\vera-workbench\.venv\Scripts\python.exe`；
- 施工单：`docs\flash_specs\wo-46b-co-create-dialog.md`，**唯一契约**；
- 背景：主文档 §二 定稿共创类 = 弹窗深谈（独立子会话）。Vera 拍板方案 A——邮件/催件/OS 回复
  统一对齐独立弹窗深谈；F-40 前端 CoCreateDialog 依赖本单 co-create 端点；
- 基线：`pytest tests/ -q` = **1060 passed**（若 WO-45/WO-46 已合入则用新基线）；
- 注意：工作区可能有 WO-45 实施者的 `pyproject.toml`/`uv.lock` 未提交改动——**不碰、不纳入本单**。

## 硬性纪律（违反即返工）

1. 只改施工单「改动范围」表内文件；
2. 严禁改前端 `ui/`、`config/document_types.yaml`、`config/naming_rules.yaml`；严禁新增 pip 依赖；
3. 红线：脱敏→LLM→还原；**只出草稿绝不发送**；confirm 建待办必须 `create_todo=true` 显式传入；
   draft session（`draft:` 前缀）不显示于主对话流。

## 接口契约速览（完整见施工单，一字不改）

```text
POST /api/agent/co-create/chat
  body {case_id, flow_key(followup|chaser|os_reply), action(clarify|generate|version|branch|confirm),
        message, session_id, parent_message_id, branch_label, create_todo}
  → {reply, draft|null, versions[], status(clarifying|draft|confirmed|blocked), event_id|null, task_id|null}
```

## 参考代码

- `core/agents/draft_email.py`：`_intent_prompt` / `_gen_draft` / `_next_version` / `_append_message` /
  `run_draft_email`（confirm 已写事件，本单补全景 + clarify + create_todo）；
- `core/ai/context_builder.py`：案件全景构建（五层注入摘要，找最合适的摘要函数复用）；
- `core/task_engine/dispatcher.py`：Action 创建写法（status/pending/assignee/type）。

## 实施步骤

1. 读施工单全文 + 参考代码；
2. `draft_email.py` 补全景/clarify/create_todo → `python -c "import core.agents.draft_email"` 无报错；
3. co-create 端点 + schemas → `python -c "import server.main"` 无报错；
4. `pytest tests/test_api/test_co_create.py -v` 全绿；
5. 全量 `pytest tests/ -q` ≥ 基线，0 failed / 0 skipped；
6. `ruff check`（本单所有 py）→ All checks passed；
7. `git add` 仅本单文件 → `git commit`：`feat: WO-46b 共创弹窗深谈后端 — co-create 端点（N 文件）`。

## 交付报告要求

- 改动文件清单 + 行数；五动作 TestClient 实测（状态码/返回结构/落库）；
- 案件全景注入样例（脱敏后）；confirm 事件 + 待办落库证据；全量 pytest / ruff 结果；
- 确认未触碰 WO-45 的 pyproject/uv.lock 与前端。
