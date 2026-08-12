"""Action / CaseChecklist 模型安全测试 — WO-07 遗留项补齐。

验证 V5 新增字段的默认值安全性和红线：
1. Action.source_channel 默认 email，绝不为 None
2. 委派字段默认 None（不误标已委派）
3. boss_decision 默认 None（不伪造老板决策）
4. CaseChecklist.received_file_ids 默认空列表（不泄漏未确认文件）
5. 新字段不引入裸 PII（默认值不含真实客户信息）
"""

from __future__ import annotations

from datetime import datetime

from core.models.orm import Action, CaseChecklist


class TestActionSafety:
    """Action 模型新增字段安全。"""

    def test_source_channel_default_is_email(self, test_db):
        """source_channel 默认必须是 email（INSERT 落库后生效）。"""
        action = Action(case_id="CASE-SAFE-001", type="email_draft", title="测试")
        test_db.add(action)
        test_db.commit()
        test_db.refresh(action)
        assert action.source_channel == "email"

    def test_source_channel_never_none(self, test_db):
        """source_channel 不能是 None（前端按来源渲染）。"""
        action = Action(case_id="CASE-SAFE-002", type="email_draft", title="测试")
        test_db.add(action)
        test_db.commit()
        test_db.refresh(action)
        assert action.source_channel is not None

    def test_delegation_fields_default_none(self):
        """委派字段默认必须为 None（不是空字符串）。"""
        action = Action(case_id="CASE-SAFE-003", type="email_draft", title="测试")
        assert action.delegated_to is None
        assert action.delegated_at is None
        assert action.delegation_deadline is None
        assert action.delegation_feedback is None

    def test_boss_decision_default_none(self):
        """boss_decision 默认必须为 None。"""
        action = Action(case_id="CASE-SAFE-004", type="email_draft", title="测试")
        assert action.boss_decision is None

    def test_routing_options_nullable(self):
        """routing_options 默认允许 None（无建议时不强行给）。"""
        action = Action(case_id="CASE-SAFE-005", type="email_draft", title="测试")
        assert action.routing_options is None

    def test_columns_exist_on_table(self, test_db):
        """新字段必须真实存在于 ORM 元数据（迁移同步保障）。"""
        cols = {c.name for c in Action.__table__.columns}
        for name in [
            "source_channel",
            "routing_options",
            "delegated_to",
            "delegated_at",
            "delegation_deadline",
            "delegation_feedback",
            "boss_decision",
        ]:
            assert name in cols, f"Action 缺列 {name}"

    def test_defaults_contain_no_pii(self):
        """默认值不应包含任何真实客户信息。"""
        action = Action(case_id="CASE-SAFE-006", type="email_draft", title="测试")
        defaults = [
            action.source_channel,
            action.delegated_to,
            action.delegation_feedback,
            action.boss_decision,
        ]
        for val in defaults:
            assert val is None or "PERSON_" not in str(val)


class TestCaseChecklistSafety:
    """CaseChecklist 新增字段安全。"""

    def test_received_file_ids_default_empty_list(self, test_db):
        """received_file_ids 默认必须是空列表（INSERT 落库后生效）。"""
        item = CaseChecklist(
            case_id="CASE-SAFE-010", item_name="护照", category="identity"
        )
        test_db.add(item)
        test_db.commit()
        test_db.refresh(item)
        assert item.received_file_ids == []

    def test_received_file_ids_mutable_list(self):
        """多文件 id 追加后保持为列表。"""
        item = CaseChecklist(
            case_id="CASE-SAFE-011",
            item_name="护照",
            category="identity",
            received_file_ids=["file_a"],
        )
        item.received_file_ids.append("file_b")
        assert item.received_file_ids == ["file_a", "file_b"]

    def test_received_file_ids_column_exists(self, test_db):
        """received_file_ids 必须存在于 ORM 元数据。"""
        cols = {c.name for c in CaseChecklist.__table__.columns}
        assert "received_file_ids" in cols

    def test_legacy_received_file_id_still_present(self, test_db):
        """旧单文件字段必须保留（兼容）。"""
        cols = {c.name for c in CaseChecklist.__table__.columns}
        assert "received_file_id" in cols


class TestDatetimeSafety:
    """datetime 一律 UTC（naive utcnow）。"""

    def test_delegated_at_is_utc_naive(self):
        """delegated_at 用 utcnow 赋值时是 naive UTC。"""
        action = Action(
            case_id="CASE-SAFE-020",
            type="email_draft",
            title="测试",
            delegated_at=datetime.utcnow(),
        )
        assert action.delegated_at.tzinfo is None
