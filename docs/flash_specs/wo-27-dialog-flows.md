# WO-27：共创 Dialog 流程 + 版本链 + CardSchema（跟进邮件 / 催件 / OS 回复）

> 来源（Vera 定稿 2026-08-13）：确认三件事进本单——① 三个共创类 dialog 流程（跟进邮件 / 催件 / OS 回复）；② 会话版本链 `parent_message_id` + `branch_label`（V1-V3 + 方案 A/B 对比，一层分叉）；③ CardSchema 状态卡片契约（表单 → 重跑 → 替换）。对应 Agent架构演进_参考Pi与PrimeAgent.md §五 #4/#8；主文档 §二 Agent 呈现方式分类（共创类 → 弹窗深谈）。
> 前置：WO-26b + WO-26c 验收通过后实施。

## 技术约束

- 红线：**只出草稿（DraftCard）**，任何路径无 send 工具；PII 出站脱敏；扫描/读文件类默认拒绝
- 版本链只做一层分叉（方案 A/B 对比），**不做树导航**
- 卡片 payload 带 `payload_version`，老卡片降级渲染
- 未确认分支不蒸馏进 context summary（不污染摘要）
- 新代码文件 ≤200 行；迁移用 batch 模式，新增列可空

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
| --- | --- | --- |
| `core/migrations/versions/xxxx_add_chat_branch.py` | **新建** | case_chat_messages + `parent_message_id`（nullable, index）+ `branch_label`（nullable） |
| `core/models/orm.py` | 修改 | CaseChatMessage + 2 列 |
| `core/agents/draft_email.py` | **新建** | 通用"邮件草稿共创"工具：多轮 V1-V3、branch_label、DraftCard 出口 |
| `core/agents/flows.py` | 修改 | 白名单 + `draft_email`；新流程包校验通过 |
| `core/agents/runner.py` | 修改 | `draft_email` 分支（复用 26c StepContext） |
| `config/agent_flows/followup.yaml` | **新建** | 跟进邮件（dialog） |
| `config/agent_flows/chaser.yaml` | **新建** | 催件（dialog） |
| `config/agent_flows/os_reply.yaml` | **新建** | OS 回复（dialog） |
| `server/api/schemas.py` | 修改 | CardSchema + DraftCard payload（payload_version） |
| `tests/test_api/test_draft_flows.py` | **新建** | ≥10 用例 |

⚠️ 严禁修改：core/chat/loop.py 路由逻辑、chat 协议（#12 非流式保持）、core/context/accumulator 蒸馏逻辑（只在确认点触发）、前端（提示词另出）。

## 设计

### 版本链
- `CaseChatMessage.parent_message_id`（可空，指向本会话分支源）+ `branch_label`（可空，如 "A" / "B"）
- 呈现：V1/V2/V3 版本链；方案 A/B 为 branch_label 分叉；确认指令 → 指定版本 → DraftCard 出口
- 记忆：仅确认版本触发蒸馏（append_context_event + trigger_distill）；未确认分支只留对话原文

### CardSchema
- 响应 payload：`{ schema_version, card_type, state, result, action }`；state 为表单字段（schema 化），result 为最新结论
- 重跑：前端提交表单值 → 作为下一轮 flow 参数（`$arg.*`，走 26c StepContext）→ 返回新 payload 替换卡片
- `payload_version` 变更 → 前端按版本降级渲染

### draft_email 工具（共用，3 流程包各自传 intent / prompt）
- 输入：case_id、intent（followup / chaser / os_reply）、recipient_hint、关键上下文
- 输出：subject + body 多版本（V1-V3）与 branch_label；confirm 后 DraftCard（status=draft，只出草稿）

## 测试（tests/test_api/test_draft_flows.py，≥10）

1. 迁移：两列存在、历史行可空
2. 版本链：同会话多轮 V1/V2/V3 挂链正确
3. 分叉：branch_label A/B 一层分叉
4. 确认版本 → DraftCard（status=draft，不发送）
5. 未确认分支不触发蒸馏（context summary 不变）
6. 确认后才蒸馏（append_context_event 被调用）
7. CardSchema：payload 含 schema_version；老版本降级字段可解析
8. 三触发语路由：跟进 / 催件 / OS 回复各自命中
9. PII 红线：draft 生成出站前脱敏（monkeypatch 断言）
10. 全量回归（chat 协议 #12 不变）

## 验收标准（全量门禁）

- 专项全绿；`pytest tests/ -q` → 最新基线 + 新增，0 failed / 0 skipped
- alembic upgrade head 成功；dev 库两列确认
- ruff（本单文件）→ All checks passed
- TestClient：三条新触发语返回 dialog 卡（含 DraftCard 出口）；原 3 流程包回归
- 前端零改动（git diff 核对）

## 提交建议（一次或按迁移拆分）

```
git add core/migrations/versions/... core/models/orm.py core/agents/draft_email.py core/agents/flows.py core/agents/runner.py config/agent_flows/followup.yaml config/agent_flows/chaser.yaml config/agent_flows/os_reply.yaml server/api/schemas.py tests/test_api/test_draft_flows.py
git commit -m "feat: WO-27 共创 Dialog 流程 — 跟进/催件/OS 回复 + 版本链 parent_message_id + CardSchema（只出草稿）"
```

⚠️ 执行纪律：只改表内文件；chat 路由/协议零改动；只出草稿红线；每步验证。