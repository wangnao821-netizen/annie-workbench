# 前端 API 契约快照（2026-08-13，后端 855 测试全绿）

> 用途：给 AI Studio 等**无法访问后端文件**的工具使用——把本文件整份粘贴给 AI Studio 即可，无需读后端源码。
> 契约以本快照为准，禁止猜测；若响应字段与预期不符，回报 Vera，不改后端。

## 通用
- Base URL：同源 `/api`；`Content-Type: application/json`
- 错误：FastAPI 标准 `{"detail": "..."}`；常见 404（不存在）、422（参数校验失败）、403（人闸拒绝）

## 1) 聊天与流程卡渲染
`POST /api/chat`
请求：`{"message": "...", "case_id": "..."?, "track": "internal"|"external"}`
响应：`{"reply": "...", "tool_cards": [ToolCard], "recorded_facts": [...], "suggested_actions": []}`
`ToolCard = {"type": str, "title": str, "payload": {...}, "presentation": "result_card"|"dialog"}`
- 共创卡 type：`flow_followup` / `flow_chaser` / `flow_os_reply`（payload = DraftCardPayload）
- 其它卡 type：`flow_declaration_check` / `flow_calculator` / `flow_case_intake` / `draft` / `record_confirm` / `submission_suggest`

## 2) 共创卡动作（F-15 新增，重跑通道）
`POST /api/agent/cards/action`
请求：
```json
{
  "flow_key": "followup",            // followup | chaser | os_reply
  "case_id": "case-123"?,            // 无案件 → payload.status="blocked"
  "action": "new",                   // new | version | branch | confirm
  "parent_message_id": 12?,          // version/branch/confirm 时传当前版本 message_id
  "branch_label": "B"?,              // branch 对比时传 "B"
  "recipient_hint": "CBA Assessor"?,
  "extra": {}?
}
```
响应（WO-26 契约）：
```json
{
  "reply": "...",
  "tool_cards": [{
    "type": "flow_followup",
    "title": "跟进邮件",
    "presentation": "dialog",
    "payload": {
      "schema_version": 1,
      "card_type": "draft_email",
      "action": "new",
      "status": "draft",             // 确认后 "confirmed_draft"
      "state": {"version": "V1", "branch_label": "main", "message_id": 12},
      "result": {"versions": [{"subject": "...", "body": "...", "version": "V1", "branch_label": "main", "message_id": 12}]}
    }
  }],
  "recorded_facts": [],
  "presentation": "dialog"
}
```

## 3) 技能中心（/api/skills）
| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| GET | `/api/skills?category=&status=` | - | 列表（内置 + 用户合并） |
| GET | `/api/skills/{key}?version=` | - | 详情 |
| POST | `/api/skills` | `{"manifest": SkillManifest, "reason"?: str}` | 创建草稿（201，draft） |
| POST | `/api/skills/propose` | `{"manifest": SkillManifest, "reason": str(必填), "scope"?: str}` | AI 提议（created_by=ai_propose） |
| POST | `/api/skills/{key}/activate` | `{"version": "1.0.0", "operator": "vera"}` | 激活（operator≠vera → 403） |
| POST | `/api/skills/{key}/deactivate?version=` | - | 停用 |
| POST | `/api/skills/{key}/rollback` | `{"target_version": "1.0.0"}` | 回滚（注意字段名 target_version） |
| PUT | `/api/skills/{key}` | `{"manifest": SkillManifest, "reason"?: str}` | 更新草稿（仅 draft；非 draft → 422） |
| POST | `/api/skills/{key}/reject` | `{"reason"?: str}` | 拒绝 AI 提议（无 AI 提议 → 404） |

`SkillResponse` 字段：
`key, name, description, version, category(agent|tool|flow|knowledge), triggers[], presentation(result_card|dialog|notification), permission(read_only|draft|system_config), inputs{}, outputs{}, steps[], assets[], confirm_required, status(draft|active|deprecated), author, db_id?, created_by?, reason?`
- 内置技能 = `created_by === "system"`（只读，不可编辑/停用）
- AI 提议 = `created_by === "ai_propose"` 且 `status === "draft"`
- 版本历史：列表接口会返回多版本记录，前端按 key 聚合展示；无独立版本列表接口

`SkillManifest` 字段（创建/更新时传）：
`key, name, description?, version?, category?, triggers?, presentation?, permission?, inputs?, outputs?, steps?: [{tool, params?, output?}], assets?, confirm_required?, status?, author?`
- 白名单工具（steps[].tool 只能取其一）：`declaration_check` / `calculator_assess` / `policy_check` / `context_event_write` / `draft_email`
- 非法工具 → 422

## 4) 其它在用端点（仅列路径，契约以快照内同款为准）
- `GET/POST /api/cases`、`GET /api/cases/{id}`（含 `folder_path`）、`POST /api/cases/{id}/context-events`
- `GET /api/drafts/`、`GET /api/imports/`
- `GET /api/analytics/overview|pipeline|lenders|efficiency`
- `GET /api/banks/`、`GET /api/platforms/`、`GET/PATCH /api/agents/{key}`