"""WO-71 时间线 Bug 链修复验收测试。"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock

from core.models.orm import CaseContextEvent
from core.pipeline.msg_timeline import _event_from_row, _write_event


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
        row.occurred_at = datetime(2024, 5, 6, 9, 21, 48, tzinfo=UTC)
        row.created_at = datetime(2026, 8, 21, 6, 56, 11, tzinfo=UTC)
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
        row.created_at = datetime(2026, 8, 21, 6, 56, 11, tzinfo=UTC)
        result = _event_from_row(row)
        assert "2026-08-21" in result["event_time"]
