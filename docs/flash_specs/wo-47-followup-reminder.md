# WO-47 跟进提醒 job — 任务截止/承诺到期通知闭环（后台自主类）

> 依据：主文档 §二 后台自主类代表「跟进提醒」——jobs.py 现有 backup/overdue/summary/discover/gap，
> **缺独立跟进提醒**（现有 `_overdue_job` 只覆盖委派任务；普通任务截止/客户承诺到期无提醒闭环）。
> 2026-08-16 Vera 拍板：单独小单补齐。
> 执行者：opencode / Gemini，按 Step 执行，每步跑验证命令。

## 现状（已核实）

- `core/scheduler/jobs.py`：`_overdue_job` 调 `core.task_engine.delegation.check_overdue` 只处理委派任务，
  生成 `OVERDUE_REMINDER`；
- 普通任务（Action.status=pending、deadline 非空）到期无通知；客户承诺类（事件/补件承诺日期）无跟进提醒；
- 前端已有 CaseReminderBanner（按任务 overdue/dueToday 展示），本单补**后台生成提醒待办 + 去重**闭环，
  前端 Banner 读待办即可联动。

## 技术约束

- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；基线：`pytest tests/ -q` = **1060 passed**
  （若 WO-45/46/46b 已合入则用新基线）；
- 禁止：修改前端 `ui/`；修改 `config/document_types.yaml` / `config/naming_rules.yaml`；新增 pip 依赖。

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|---|---|---|
| `core/scheduler/jobs.py` | 修改 | 新增 `_followup_job`（或扩展 `_overdue_job` 为通用到期提醒） |
| `core/task_engine/`（新建 `followup.py` 或扩展 delegation.py） | 修改/新建 | `check_followups(db) -> list[Action]`：扫描普通任务 deadline，提前 `remind_before_days` 天/到期生成 `FOLLOWUP_REMINDER`（按 source_msg_id + type 去重） |
| `config/settings.yaml` | 修改 | scheduler 段新增 `followup` 配置：`enabled: false`（默认关，Vera 观察后开）/ `remind_before_days: 1` / `interval_minutes: 60` |
| `core/config.py` | 修改 | 新增 `FollowupConfig` 模型并挂到 SchedulerConfig |
| `tests/test_core/test_followup_reminder.py` | 新建 | 专项测试 |

> 客户承诺/补件承诺日期（事件文本中的日期）V1 不解析，仅按任务 deadline；V2 再考虑事件承诺提取。

## 契约

```python
# core/task_engine/followup.py
def check_followups(db: Session, remind_before_days: int = 1) -> list[Action]:
    """扫描 pending 且 deadline 非空的任务：
    - deadline <= now + remind_before_days → 生成/复用 FOLLOWUP_REMINDER Action
      （title=f"跟进提醒：{task.title}"，type="FOLLOWUP_REMINDER"，priority 按剩余天数红/黄，
       status=pending，assignee="vera"，source_channel="manual"，source_msg_id=str(task.id)）；
    - 去重：同 task + type + status=pending 已存在则跳过（复用 _overdue_job 的 dup 写法）；
    - 仅扫描未完成（status=pending）且未关闭案件（Case.closed_at IS NULL）。"""
```

`config/settings.yaml` scheduler 段追加：

```yaml
followup:
  enabled: false          # 默认关，观察后 Vera 开启
  remind_before_days: 1
  interval_minutes: 60
```

## 红线

- 只生成提醒待办（Action），**不自动发送任何通知**（邮件/微信 V2）；
- 去重幂等：重复跑不产生重复提醒；不修改原任务状态；
- 不新增依赖；不碰 WO-45 的 pyproject/uv.lock。

## 实施步骤（每步跑验证命令）

1. 读施工单全文 + `core/scheduler/jobs.py`（_overdue_job 去重写法）+ `core/task_engine/delegation.py`；
2. `core/task_engine/followup.py` → `python -c "import core.task_engine.followup"` 无报错；
3. `core/config.py` + `config/settings.yaml`（默认关闭）→ `python -c "from core.config import get_config; get_config()"` 无报错；
4. `core/scheduler/jobs.py` 注册 job（enabled 时启动）→ `python -c "import core.scheduler.jobs"` 无报错；
5. `tests/test_core/test_followup_reminder.py` → `pytest tests/test_core/test_followup_reminder.py -v` 全绿；
6. 全量 `pytest tests/ -q` ≥ 基线，0 failed / 0 skipped；
7. `ruff check`（本单所有 py）→ All checks passed；
8. `git commit`：`feat: WO-47 跟进提醒 job — 任务截止/承诺到期通知闭环（N 文件）`。

## 测试要点

- 到期任务（deadline < now）→ 生成 FOLLOWUP_REMINDER；提前 remind_before_days 天内 → 生成；
- 未到期（超过窗口）→ 不生成；已生成 pending 同源 → 幂等不重复；
- 已完成任务/已关闭案件 → 不生成；enabled=false → job 不注册/不执行；
- 前端联动：CaseReminderBanner 读 pending 待办即可显示（本单不改前端，回归即可）。
