# WO-71 邮件时间线 5-Bug 链修复 — 执行规范

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / `pathlib.Path`
- 禁止：引入任何新 pip 依赖
- 禁止：修改本表改动范围以外的任何文件
- 禁止：重构、重命名、移动既有文件/函数（除非本表明确要求）
- 禁止：访问/读取真实客户文件夹（测试一律用 Mock 或 `tmp_path`）
- 所有路径操作必须 `pathlib.Path`

## 背景（为什么要做）

WO-55 实现的邮件时间线引擎能够从 `.msg` 邮件中正确提取出发送时间、审批官、案号等关键信息，
但存在一条完整的 **5-Bug 链**，导致提取出的数据无法正确落库、无法带着真实时间展示、也无法喂给 AI 用于智能问答。

具体问题链：
1. **导入时不触发邮件扫描** — `batch_topology_import` 和 `onboard_case` 都没有调用 `sync_timeline_for_case`
2. **短路判断** — `get_timeline_for_case` 只要发现任意 `CaseContextEvent` 就跳过邮件扫描，但导入时写的 `manual_note` 会占位
3. **写入时丢弃邮件真实时间** — `_write_event` 没有保存 `ev["event_time"]`，`CaseContextEvent` 表也没有 `occurred_at` 字段
4. **读取时用入库时间冒充事件时间** — `_event_from_row` 返回 `row.created_at` 而非邮件本身的时间
5. **AI 上下文不注入时间线叙事** — `context_builder._build_live_data` 只注入最近 8 条 `CaseContextEvent`（平铺 `content`），无时间线叙事结构

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/models/orm.py` | 修改 | `CaseContextEvent` 类新增 `occurred_at` 字段 |
| `core/migrations/versions/g7h8i9j0k1l2_add_event_occurred_at.py` | **新建** | Alembic migration 加列 |
| `core/pipeline/msg_timeline.py` | 修改 | 修复 `_write_event`、`_event_from_row`、`get_timeline_for_case` |
| `core/ai/context_builder.py` | 修改 | `_build_live_data` 新增时间线叙事 block |
| `server/api/cases.py` | 修改 | `batch_topology_import` 末尾追加时间线同步 |
| `tests/test_timeline_fix.py` | **新建** | 验收测试 |

⚠️ 严禁修改上表以外的任何文件。

---

## 逐项修复契约

### 修复 1：ORM 新增 `occurred_at` 字段

**文件**: `core/models/orm.py`

在 `CaseContextEvent` 类的 `created_at` 字段**之后**，新增一行：

```python
    occurred_at = Column(DateTime, nullable=True)  # 事件真实发生时间（邮件发送时间等外部时间源）
```

位置精确锚定：在 `created_at = Column(DateTime, default=datetime.utcnow)` 的**下一行**插入。
不得修改该类的任何其他字段。

---

### 修复 2：Alembic Migration

**文件**: `core/migrations/versions/g7h8i9j0k1l2_add_event_occurred_at.py`（**新建**）

```python
"""add occurred_at to case_context_events

Revision ID: g7h8i9j0k1l2
Revises: c3f9e7a2b1d4
Create Date: 2026-08-21 15:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'c3f9e7a2b1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('occurred_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.drop_column('occurred_at')
```

⚠️ `down_revision` 必须指向当前 head。执行前先运行 `alembic heads` 确认最新 revision ID，
如果最新 head 不是 `c3f9e7a2b1d4`，则将 `down_revision` 替换为实际的 head ID。

---

### 修复 3：`_write_event` 保存真实时间

**文件**: `core/pipeline/msg_timeline.py`，函数 `_write_event`（约第 185-209 行）

**当前代码**（第 198-206 行）：
```python
    db.add(
        CaseContextEvent(
            case_id=case_id,
            source_type="email_timeline",
            content=_build_content(ev),
            track="internal",
            source_ref=source_ref,
            status="confirmed",
        )
    )
```

**替换为**：
```python
    # 解析邮件原始发送时间
    occurred = None
    raw_time = ev.get("event_time")
    if raw_time:
        try:
            from datetime import datetime as _dt, timezone as _tz
            if isinstance(raw_time, str):
                # 兼容 ISO 格式（含/不含时区）
                cleaned = raw_time.replace("Z", "+00:00")
                occurred = _dt.fromisoformat(cleaned)
            elif isinstance(raw_time, _dt):
                occurred = raw_time
        except (ValueError, TypeError):
            pass
    db.add(
        CaseContextEvent(
            case_id=case_id,
            source_type="email_timeline",
            content=_build_content(ev),
            track="internal",
            source_ref=source_ref,
            status="confirmed",
            occurred_at=occurred,
        )
    )
```

---

### 修复 4：`_event_from_row` 优先使用 `occurred_at`

**文件**: `core/pipeline/msg_timeline.py`，函数 `_event_from_row`（约第 260-313 行）

**当前代码**（第 301-303 行）：
```python
    return {
        "id": str(row.id),
        "event_time": row.created_at.isoformat() if row.created_at else "",
```

**替换为**：
```python
    # 优先使用事件真实发生时间（occurred_at），若无则回退到入库时间（created_at）
    real_time = getattr(row, "occurred_at", None) or row.created_at
    return {
        "id": str(row.id),
        "event_time": real_time.isoformat() if real_time else "",
```

---

### 修复 5：`get_timeline_for_case` 修复短路判断

**文件**: `core/pipeline/msg_timeline.py`，函数 `get_timeline_for_case`（约第 316-322 行）

**当前代码**：
```python
def get_timeline_for_case(case_id: str, db: Session) -> list[dict[str, Any]]:
    """查询指定案件的时序事件（优先读取已落库事件，无则尝试即时扫描）。"""
    rows = _query_timeline_rows(case_id, db)
    if not rows:
        sync_timeline_for_case(case_id, db)
        rows = _query_timeline_rows(case_id, db)
    return [_event_from_row(r) for r in rows]
```

**替换为**：
```python
def get_timeline_for_case(case_id: str, db: Session) -> list[dict[str, Any]]:
    """查询指定案件的时序事件（优先读取已落库事件，无邮件事件则自动触发扫描）。"""
    rows = _query_timeline_rows(case_id, db)
    # 修复短路判断：检查是否存在 email_timeline 类型事件，
    # 若不存在则触发邮件扫描（避免被 manual_note 等事件阻断）
    has_email_events = any(r.source_type == "email_timeline" for r in rows)
    if not has_email_events:
        sync_timeline_for_case(case_id, db)
        rows = _query_timeline_rows(case_id, db)
    return [_event_from_row(r) for r in rows]
```

---

### 修复 6：AI 上下文注入时间线叙事

**文件**: `core/ai/context_builder.py`，函数 `_build_live_data`（约第 214-254 行）

在函数末尾 `return` 语句**之前**（约第 254 行前），插入以下时间线注入代码块：

```python
    # ── 邮件时间线叙事注入（WO-71）──
    if task_type in ("case_chat", "case_advisor", "brief_generate", "strategy_report"):
        email_events = (
            db.query(CaseContextEvent)
            .filter(
                CaseContextEvent.case_id == case_id,
                CaseContextEvent.source_type == "email_timeline",
                CaseContextEvent.status == "confirmed",
            )
            .order_by(
                CaseContextEvent.occurred_at.asc().nullslast(),
                CaseContextEvent.created_at.asc(),
            )
            .limit(15)
            .all()
        )
        if email_events:
            tl_lines = ["【案件邮件时间线（按真实发生时间正序）】:"]
            for ev in email_events:
                real_time = getattr(ev, "occurred_at", None) or ev.created_at
                time_str = real_time.strftime("%Y-%m-%d %H:%M") if real_time else "未知时间"
                tl_lines.append(f"  📧 [{time_str}] {ev.content[:150]}")
            parts.append("\n".join(tl_lines))
```

同时需要在该函数顶部的 import 区确保 `CaseContextEvent` 已经被导入。
检查文件第 21-26 行的 import 块：

```python
from core.models.orm import (
    Case,
    CaseChecklist,
    KnowledgeEntry,
    OsCondition,
)
```

该 import 块内已经**不**包含 `CaseContextEvent`。但在第 232 行已有局部 import：
```python
        from core.models.orm import CaseContextEvent
```

因此**不需要额外 import**——时间线注入代码块位于此局部 import 之后，可以直接使用 `CaseContextEvent`。

---

### 修复 7：建档入口自动触发时间线同步

**文件**: `server/api/cases.py`，函数 `batch_topology_import`（约第 1111-1193 行）

在第 1192 行 `db.commit()` **之后**、`return` 语句**之前**，插入：

```python
    # ── WO-71: 建档完成后自动触发邮件时间线扫描 ──
    for info in created:
        try:
            sync_timeline_for_case(info["case_id"], db)
        except Exception as exc:  # noqa: BLE001 — 时间线同步失败不阻断建档
            logger.warning(
                "auto sync timeline on topology import failed for %s: %s",
                info["case_id"], exc,
            )
```

确认 `sync_timeline_for_case` 已经在文件顶部被 import（第 60 行已有）。

---

### 验收测试

**文件**: `tests/test_timeline_fix.py`（**新建**）

```python
"""WO-71 时间线 Bug 链修复验收测试。"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from core.models.orm import CaseContextEvent
from core.pipeline.msg_timeline import _write_event, _event_from_row


class TestWriteEventPreservesTime:
    """Bug 3 修复验收：_write_event 必须把 event_time 写入 occurred_at。"""

    def test_occurred_at_saved(self):
        """给定一个带 event_time 的事件字典，写入后 occurred_at 不为 None。"""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None  # 无重复
        ev = {
            "event_time": "2024-05-06T09:21:48+08:00",
            "event_type": "note",
            "title": "Test email",
            "summary": "test summary",
            "source_file": "test.msg",
        }
        _write_event("CASE-TEST", ev, db)
        added_obj = db.add.call_args[0][0]
        assert isinstance(added_obj, CaseContextEvent)
        assert added_obj.occurred_at is not None
        assert added_obj.occurred_at.year == 2024
        assert added_obj.occurred_at.month == 5
        assert added_obj.occurred_at.day == 6

    def test_occurred_at_none_when_no_time(self):
        """event_time 为空字符串时，occurred_at 应为 None。"""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        ev = {
            "event_time": "",
            "event_type": "note",
            "title": "No time",
            "summary": "",
            "source_file": "notime.msg",
        }
        _write_event("CASE-TEST", ev, db)
        added_obj = db.add.call_args[0][0]
        assert added_obj.occurred_at is None


class TestEventFromRowUsesOccurredAt:
    """Bug 4 修复验收：_event_from_row 优先使用 occurred_at。"""

    def test_prefers_occurred_at(self):
        """当 occurred_at 有值时，返回的 event_time 应为 occurred_at。"""
        row = MagicMock(spec=CaseContextEvent)
        row.id = 1
        row.content = "[note] Test email subject\nSome summary"
        row.source_type = "email_timeline"
        row.source_ref = "email_timeline:test.msg:note"
        row.occurred_at = datetime(2024, 5, 6, 9, 21, 48)
        row.created_at = datetime(2026, 8, 21, 6, 56, 11)
        result = _event_from_row(row)
        assert "2024-05-06" in result["event_time"]
        assert "2026-08-21" not in result["event_time"]

    def test_falls_back_to_created_at(self):
        """当 occurred_at 为 None 时，回退到 created_at。"""
        row = MagicMock(spec=CaseContextEvent)
        row.id = 2
        row.content = "[note] Manual note"
        row.source_type = "manual_note"
        row.source_ref = None
        row.occurred_at = None
        row.created_at = datetime(2026, 8, 21, 6, 56, 11)
        result = _event_from_row(row)
        assert "2026-08-21" in result["event_time"]
```

---

## 验收命令

```powershell
# 1. Alembic migration
cd D:\vera-workbench
$env:PYTHONPATH="D:\vera-workbench\electron\release\win-unpacked\resources\runtime\site-packages;D:\vera-workbench\electron\release\win-unpacked\resources\backend"
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m alembic -c core/alembic.ini upgrade head

# 2. 单元测试
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m pytest tests/test_timeline_fix.py -v

# 3. Ruff 代码风格检查
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m ruff check core/pipeline/msg_timeline.py core/ai/context_builder.py core/models/orm.py server/api/cases.py

# 4. 集成冒烟验证（在存量 Latrobe 案卷上验证时间线同步）
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
