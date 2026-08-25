# WO-75b 追加清单项自动沉淀（OS 共创确认钩子）— 施工单

> **状态**：待执行（WO-74 验收后开工）
> **关联**：WO-46b `run_co_create` 确认步骤；WO-74 追加项（phase=condition）；规划文档 §五b 入口②

---

## 一、目标

OS 回复 / 补件邮件共创（CoCreateDialog）确认收尾时，Vera 可把该轮沟通中银行/OS 提出的补件要求沉淀为"追加清单项"（`phase=condition`），带来源与可选截止日，避免补件要求散落在对话里丢失。

---

## 二、改动范围（严禁超出）

| 序号 | 文件 | 操作 | 说明 |
|---|---|---|---|
| 1 | `core/agents/draft_email.py` | 修改 | `run_co_create` confirm 分支：支持可选 `add_checklist_items=[{name_zh, deadline?, source_ref?}]` |
| 2 | `server/api/cases.py` | 修改 | 新增 `POST /api/cases/{case_id}/checklist/from-condition`：批量写 `phase="condition"` 项，幂等（同名+source_ref 去重），不覆盖已收项 |
| 3 | `server/api/schemas.py` | 修改 | `CoCreateRequest` 可选字段 + `FromConditionRequest` |
| 4 | `frontend/src/components/ai/CoCreateDialog.tsx` | 修改 | 确认面板加「沉淀为追加清单项」勾选（默认关）；勾选后展示将要沉淀的项目名 |
| 5 | `tests/test_api/test_checklist_from_condition.py` | **新建** | 确认→落库、去重、不覆盖已收、红线（只写清单不发送） |

---

## 三、接口契约

```text
POST /api/cases/{case_id}/checklist/from-condition
  body: { "items": [ { "name_zh": "最近 3 个月工资单", "deadline": "2026-09-01T00:00:00+10:00", "source_ref": "CBA OS 条件 #12" } ] }
  → 201；每项写 CaseChecklist(phase="condition", item_kind="document", status="pending")
  → 幂等：同 case + 同 name_zh + 同 source_ref 已存在则跳过并计数
```

- 入参非法（空名/坏 deadline）→ 422；案件不存在 → 404。
- `run_co_create` confirm：`add_checklist_items` 非空时先调 `from-condition` 再写事件/待办。

---

## 四、测试与验收

1. `tests/test_api/test_checklist_from_condition.py` 全部通过（确认→落库 / 重复提交去重 / 不覆盖 received 项 / 422 / 404）。
2. 全量 `pytest tests/ -q` 0 failed；`ruff check` 0 errors / 0 warnings；`tsc --noEmit` 0 error。
3. 红线确认：无任何发送动作；只写清单与事件。

---

*v1.0 · 2026-08-25 · OS 共创确认 → 追加清单项自动沉淀（规划文档 §五b 入口②）*
