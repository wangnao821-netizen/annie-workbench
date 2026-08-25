# WO-76 建案欢迎流（模块 A+B）+ 自动待办（模块 D）— 施工单

> **状态**：待执行（前置：WO-75 邮件端点落地后联调"生成邮件"按钮）
> **关联**：[新建客户AI协同体验规划.md](../新建客户AI协同体验规划.md) §三 模块 A/B/D 与 §四 V1；WO-75（`email-draft/preliminary`）；WO-74（清单两 tab，查看完整/调整清单切换目标）

---

## 一、目标

新建案件成功后，Vera 进入 Brain 视图即收到 Annie 的结构化欢迎卡（案件摘要确认 + 清单预览 + 查看完整/调整清单/生成邮件）；后端同步自动创建 3 条首批待办，形成"4 分钟窗口"式首次体验（对齐规划 §二 最佳实践共识）。

---

## 二、后端改动

### 1. 自动待办（新建 `core/case_engine/onboarding_tasks.py`）

```python
def create_initial_tasks(case_id: str, db: Session) -> list[Action]:
    """建案后创建 3 条首批待办；幂等：同 case + 同 type 已存在则跳过。"""
```

3 条（`source_channel="onboarding"`、`assignee="vera"`、`status="pending"`）：

| 任务标题 | priority | scheduled_at |
|---|---|---|
| 发送材料清单邮件给客户 | high | 当天（Australia/Sydney 工作日） |
| 跑 Equifax 信用报告 | medium | +3 天 |
| 确认客户律师/过户师信息 | low | +7 天 |

- **调用时机**：`POST /api/cases` 创建成功后 + `topology-import` 批量导入后（与 WO-74 Step 5 模板种子同一位置）。
- **开关**：`config/settings.yaml` 增 `onboarding.tasks_enabled`（默认 `true`，Q1=方案C 拍板）。
- **红线**：只写 Action，不发送任何通知/邮件。

### 2. 欢迎卡数据（无新端点，前端组合既有）

- 案件摘要：`GET /api/cases/{id}`（CaseDetailResponse）
- 清单摘要：`GET /api/cases/{id}/checklist`（initial 项数 + 板块分布）
- 政策提示：`GET /api/cases/{id}/policy-check`（已有）
- 生成邮件：`POST /api/cases/{id}/email-draft/preliminary`（WO-75）

---

## 三、前端改动

### 新建 `frontend/src/components/brain/WelcomeCard.tsx`

- 模块 A：🎯 案件已建立 — 客户名 / 贷款类型 / 银行 / 金额 / LVR / 就业 / 身份 / 文件夹路径 / 已预选 N 项 / 政策提示。
- 模块 B：📋 清单预览（按板块显示条数）+ 三按钮：
  - 查看完整 → `setRightDeckTab("checklist")`
  - 调整清单 → `setRightDeckTab("checklist")` + 提示进入新增
  - 📧 生成邮件 → 调 WO-75 端点 → 成功 toast + 草稿箱入口（不自动发送）
- 模块 C 预留：信息项提示（✍️ 雇主历史等 → 跳全景 Fact Find，WO-77 后启用）。
- 卡片可关闭/稍后，状态存 `uiStore`，session 内不重复弹出。

### `BrainChat.tsx`

- 监听建案完成（`createCase` / `scaffold` 成功 → `setView("brain")`）时触发一次性欢迎卡，仅新案件首次进入显示。

---

## 四、自动化测试与验收标准

### 后端
- `tests/test_core/test_onboarding_tasks.py`：建案 → 3 条 Action；幂等（重复触发不重复）；开关 false 不创建；只写不发送。

### 门禁
1. 专项测试 0 failed；全量 `pytest tests/ -q` 0 failed。
2. `ruff check` 本单 py = 0 errors / 0 warnings。
3. 前端 `npx tsc --noEmit` 0 error。
4. 真机验收：建案 → 欢迎卡出现 → 查看完整切右栏 checklist → 生成邮件 → 草稿箱可见。

---

## 五、红线确认

- 欢迎卡文案本地渲染，无 PII 外发；待办只写 Action；邮件只出草稿（`status=draft`）。

---

*v1.0 · 2026-08-25 · WO-76 建案欢迎流 + 自动待办（Q1=方案C：模块 A+B+D）*
