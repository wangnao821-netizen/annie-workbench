# OpenCode 任务提示词：WO-71 邮件时间线 5-Bug 链修复

请作为全栈资深开发工程师，严格按照 `docs/flash_specs/wo-71-timeline-bug-fix.md` 施工单执行代码修改。

## 核心任务（7 项修复，6 个文件）

1. **ORM 表结构新增 `occurred_at` 字段**：
   - 文件：`core/models/orm.py` — 在 `CaseContextEvent` 类的 `created_at` 字段下方追加 `occurred_at = Column(DateTime, nullable=True)` 一行，不动其他任何字段。

2. **Alembic Migration 新建**：
   - 文件：`core/migrations/versions/g7h8i9j0k1l2_add_event_occurred_at.py` — **新建**。
   - ⚠️ 执行前先运行 `alembic heads` 确认当前 head revision，把 `down_revision` 设为实际最新 head（施工单中写的 `c3f9e7a2b1d4` 可能不是最新的，以实际为准）。

3. **`_write_event` 保存邮件真实时间**：
   - 文件：`core/pipeline/msg_timeline.py` — 按施工单"修复 3"逐字替换 `_write_event` 函数中 `db.add(...)` 代码块，在 `db.add()` 之前解析 `ev["event_time"]` 为 `occurred` datetime，传入 `CaseContextEvent(occurred_at=occurred, ...)`。

4. **`_event_from_row` 优先使用 `occurred_at`**：
   - 文件：`core/pipeline/msg_timeline.py` — 按施工单"修复 4"替换 `_event_from_row` 返回字典中 `event_time` 的取值逻辑：`real_time = getattr(row, "occurred_at", None) or row.created_at`。

5. **`get_timeline_for_case` 修复短路判断**：
   - 文件：`core/pipeline/msg_timeline.py` — 按施工单"修复 5"替换整个 `get_timeline_for_case` 函数体：检查 `has_email_events`，无邮件事件则触发同步。

6. **AI 上下文注入邮件时间线叙事 block**：
   - 文件：`core/ai/context_builder.py` — 在 `_build_live_data` 函数的 `return` 语句之前，按施工单"修复 6"插入时间线注入代码块（查询 `email_timeline` 事件，按 `occurred_at` 正序，limit 15，格式化为 `📧 [日期] 内容` 并 append 到 `parts`）。

7. **建档入口自动触发时间线同步**：
   - 文件：`server/api/cases.py` — 在 `batch_topology_import` 函数的 `db.commit()` 之后、`return` 之前，按施工单"修复 7"追加对 `created` 列表中每个案件调用 `sync_timeline_for_case`（try/except 包裹，失败不阻断）。

8. **验收测试**：
   - 文件：`tests/test_timeline_fix.py` — **新建**，按施工单贴入完整测试代码。

## 纪律红线
- 严禁修改施工单列出的 6 个文件以外的任何文件；
- 严禁更改 CSS 变量、theme 文件或引入新 npm/pip 依赖；
- 严禁删除与本次修改无关的注释和 docstring；
- 必须严格按照 `docs/flash_specs/wo-71-timeline-bug-fix.md` 逐条对照执行，不得自由发挥。

## 验收命令
```powershell
# 1. Alembic migration（先确认 head）
cd D:\vera-workbench
$env:PYTHONPATH="D:\vera-workbench\electron\release\win-unpacked\resources\runtime\site-packages;D:\vera-workbench\electron\release\win-unpacked\resources\backend"
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m alembic -c core/alembic.ini heads
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m alembic -c core/alembic.ini upgrade head

# 2. 单元测试
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m pytest tests/test_timeline_fix.py -v

# 3. Ruff 代码风格检查
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m ruff check core/pipeline/msg_timeline.py core/ai/context_builder.py core/models/orm.py server/api/cases.py

# 4. 集成冒烟验证
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -c "
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from core.models.db import get_sa_session
from core.pipeline.msg_timeline import sync_timeline_for_case, get_timeline_for_case
db = next(get_sa_session())
sync_timeline_for_case('CASE-B140DABE', db)
events = get_timeline_for_case('CASE-B140DABE', db)
for ev in events:
    print(f'[{ev[\"event_time\"]}] ({ev[\"event_type\"]}): {ev[\"title\"][:60]}')
assert any('2026-03' in ev['event_time'] for ev in events if ev.get('source_file')), '邮件真实时间未正确写入'
print('PASS: 邮件时间线真实时间验证通过')
"
```
全部测试 pass、ruff 零报错、冒烟验证打印出带真实邮件日期的时间线后汇报。
