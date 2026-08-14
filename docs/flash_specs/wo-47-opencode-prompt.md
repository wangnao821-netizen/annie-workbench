# 任务：执行 WO-47 跟进提醒 job 施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息

- 仓库：`D:\vera-workbench`（Windows）；Python：`D:\vera-workbench\.venv\Scripts\python.exe`；
- 施工单：`docs\flash_specs\wo-47-followup-reminder.md`，**唯一契约**；
- 背景：主文档 §二 后台自主类代表「跟进提醒」缺失（现有 overdue job 只覆盖委派任务）；
  Vera 2026-08-16 拍板单独小单补齐——普通任务截止/承诺到期生成提醒待办闭环；
- 基线：`pytest tests/ -q` = **1060 passed**（若 WO-45/46/46b 已合入则用新基线）；
- 注意：工作区可能有 WO-45 实施者的 `pyproject.toml`/`uv.lock` 未提交改动——**不碰、不纳入本单**。

## 硬性纪律（违反即返工）

1. 只改施工单「改动范围」表内文件；
2. 严禁改前端 `ui/`、`config/document_types.yaml`、`config/naming_rules.yaml`；严禁新增 pip 依赖；
3. 红线：只生成提醒待办（Action），**不自动发送通知**；去重幂等；不修改原任务状态；
   `followup.enabled` 默认 false（观察后 Vera 开启）。

## 契约速览（完整见施工单，一字不改）

```python
def check_followups(db: Session, remind_before_days: int = 1) -> list[Action]
# FOLLOWUP_REMINDER Action：title=f"跟进提醒：{task.title}"，priority 按剩余天数红/黄，
# status=pending，assignee="vera"，source_msg_id=str(task.id)，去重（同源 pending 已存在跳过）
```

```yaml
# config/settings.yaml scheduler 段追加
followup:
  enabled: false
  remind_before_days: 1
  interval_minutes: 60
```

## 参考代码

- `core/scheduler/jobs.py`：`_overdue_job` 的 dup 检查 + Action 创建写法；
- `core/task_engine/delegation.py`：`check_overdue` 的查询写法；
- `core/config.py`：SchedulerConfig 模型追加写法。

## 实施步骤

1. 读施工单全文 + 参考代码；
2. `core/task_engine/followup.py` → import 无报错；
3. `core/config.py` + `config/settings.yaml`（默认关）→ `from core.config import get_config; get_config()` 无报错；
4. `core/scheduler/jobs.py` 注册 → import 无报错；
5. `pytest tests/test_core/test_followup_reminder.py -v` 全绿；
6. 全量 `pytest tests/ -q` ≥ 基线，0 failed / 0 skipped；
7. `ruff check`（本单所有 py）→ All checks passed；
8. `git add` 仅本单文件 → `git commit`：`feat: WO-47 跟进提醒 job — 任务截止/承诺到期通知闭环（N 文件）`。

## 交付报告要求

- 改动文件清单 + 行数；测试通过情况（专项 + 全量）；幂等/去重/开关验证结果；
- 确认未触碰 WO-45 的 pyproject/uv.lock 与前端。
