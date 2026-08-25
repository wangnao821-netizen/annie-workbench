# WO-77 Fact Find 双轨（全景表单 B + AI 对话引导 C）— 施工单

> **状态**：待执行（前置：WO-74 的 `item_kind`/信息项落地）
> **关联**：[新建客户AI协同体验规划.md](../新建客户AI协同体验规划.md) §三 模块 C、§五b 信息项；WO-74（`kind=info` 清单项联动）；WO-76（欢迎卡模块 C 跳转）

---

## 一、目标

采集结构化客户信息（雇主历史 / 居住历史 / 律师信息 / 车辆 / Super），双轨并行：全景面板 Fact Find 表单录入（方案 B）+ 对话引导 Vera 口述、Annie 结构化提取并确认（方案 C）；清单 `kind=info` 项与 Fact Find 完成状态联动。

---

## 二、数据模型（Step 1）

新建表 `case_fact_find`（alembic 迁移 1 个，接当前 head）：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | String PK | `ff_{uuid8}` |
| `case_id` | String, index | 所属案件 |
| `section` | String | `employment_history` / `living_history` / `solicitor_info` / `vehicle_asset` / `super_balance` |
| `data` | JSON | 结构化内容（见契约） |
| `status` | String | `pending` / `confirmed` |
| `updated_at` | DateTime | 更新即刷新 |

**data 结构契约**：

```json
{
  "employment_history": [ { "company": "", "position": "", "address": "", "phone": "", "start_date": "", "end_date": "" } ],
  "living_history": [ { "address": "", "start_date": "", "end_date": "" } ],
  "solicitor_info": { "company": "", "contact_name": "", "email": "", "phone": "" },
  "vehicle_asset": { "make": "", "model": "", "value": 0 },
  "super_balance": { "provider": "", "balance": 0 }
}
```

- 账本原则：`confirmed` 前不算数；confirm 后写一条 `CaseContextEvent(source_type="fact_find")`。

---

## 三、后端契约（Step 2-3）

### 1. 端点（新建 `server/api/fact_find.py` + `main.py` 注册）

```text
GET  /api/cases/{case_id}/fact-find                    → 全部 section
PUT  /api/cases/{case_id}/fact-find/{section}          → upsert（body=data；section 枚举非法 → 422）
POST /api/cases/{case_id}/fact-find/{section}/confirm  → status=confirmed + 写事件
```

- **清单联动**：confirm 时按 `master_id`（`employment_history`/`living_history`/`solicitor_info`）把对应 `CaseChecklist(phase="initial", item_kind="info")` 置 `status="received"`。
- 案件不存在 / 跨案件 → 404。

### 2. 对话引导录入（方案 C）

- `core/chat/tools.py` 新增工具 `record_fact_find`（parameters：`section`、`data`、`confirm_required=true`）。
- 流程：Annie 按 section 引导问题模板提问 → Vera 口述 → LLM 结构化提取 → 预填草稿卡（前端确认/修改/放弃）→ 确认后 `PUT` + `confirm`。
- 红线：出站 `desensitize()` / 入站 `rehydrate()`；AiUsageLog 记录；未确认不写账本。
- 接线：`config/agents.yaml` 追加 `agent-fact-find`；`config/agent_flows/fact_find.yaml`（presentation=dialog）；`flows.py` 白名单 + `runner.py`/`pai.py` 分发。

---

## 四、前端契约（Step 4）

### `CasePanorama.tsx`

- 新增 Fact Find 区/tab：5 个 section 结构化表单（多行增删、日期选择、金额字段），保存 → `PUT`，确认 → `confirm`，完成状态徽标；信息项入口（✍️）直达。

### `BrainChat.tsx`

- 口述引导卡：Annie 提问 → 提取结果预览（字段列表）→ [确认 / 修改 / 放弃] → 确认后清单对应 `info` 项打勾。
- WO-76 欢迎卡模块 C 的信息项提示跳转此区。

---

## 五、自动化测试与验收标准

- `tests/test_api/test_fact_find.py`：CRUD / section 枚举 422 / confirm 写事件 / 清单联动 / 跨案件 404。
- `tests/test_core/test_fact_find_chat.py`：口述 → 结构化 → 确认 → 落库；脱敏往返；未确认不写账本。

### 门禁
1. 专项 0 failed；全量 `pytest tests/ -q` 0 failed。
2. `ruff check` 0 errors / 0 warnings；`npx tsc --noEmit` 0 error。
3. 失败标准：`confirm` 后 `GET /checklist` 对应 `info` 项 `status=received`；未确认时 `case_fact_find.status="pending"` 且无事件。

---

*v1.0 · 2026-08-25 · WO-77 Fact Find 双轨（Q3=B+C 同时做）*
