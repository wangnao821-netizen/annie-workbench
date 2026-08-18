"""Safety tests for case_lock_guard — Red Line enforcement.

Tests that:
1. Terminal cases block modification of locked fields (403).
2. Terminal cases allow modification of non-locked fields (200 equivalent).
3. Non-terminal cases have no locking.
4. After reopen, fields are unlocked.
5. is_terminal() handles edge cases (None, empty, mixed case).
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from core.security.case_lock import (
    LOCKED_FIELDS,
    TERMINAL_STAGES,
    assert_not_locked,
    get_allowed_fields_for_terminal,
    is_terminal,
)


# ── Fixtures ──────────────────────────────────────────────────────────


def _make_case(stage: str) -> MagicMock:
    """Create a mock Case with the given stage."""
    case = MagicMock()
    case.id = "CASE-TEST001"
    case.stage = stage
    return case


# ── is_terminal tests ─────────────────────────────────────────────────


class TestIsTerminal:
    """Test is_terminal() function."""

    @pytest.mark.parametrize("stage", [
        "已结算", "settled", "withdrawn", "declined", "resubmitted",
        "Settled", "WITHDRAWN", "Declined",  # mixed case
    ])
    def test_terminal_stages_return_true(self, stage: str) -> None:
        assert is_terminal(stage) is True

    @pytest.mark.parametrize("stage", [
        "收集资料", "审核中", "待递交", "已递交(等银行)",
        "银行补件", "估值中", "已批准", "结算中",
        "gathering", "submitted", "on_hold",
    ])
    def test_non_terminal_stages_return_false(self, stage: str) -> None:
        assert is_terminal(stage) is False

    def test_none_returns_false(self) -> None:
        assert is_terminal(None) is False

    def test_empty_string_returns_false(self) -> None:
        assert is_terminal("") is False


# ── assert_not_locked tests ───────────────────────────────────────────


class TestAssertNotLocked:
    """Test assert_not_locked() — the core security enforcement."""

    @pytest.mark.parametrize("stage", ["已结算", "withdrawn", "declined"])
    def test_locked_field_on_terminal_case_raises_403(self, stage: str) -> None:
        """终态案件修改锁定字段 → 403 拒绝。"""
        case = _make_case(stage)
        updates = {"loan_amount": 999999}

        with pytest.raises(HTTPException) as exc_info:
            assert_not_locked(case, updates)

        assert exc_info.value.status_code == 403
        assert "锁定" in exc_info.value.detail

    @pytest.mark.parametrize("field", sorted(LOCKED_FIELDS))
    def test_each_locked_field_is_enforced(self, field: str) -> None:
        """逐一验证每个锁定字段都被正确拦截。"""
        case = _make_case("settled")
        updates = {field: "new_value"}

        with pytest.raises(HTTPException) as exc_info:
            assert_not_locked(case, updates)

        assert exc_info.value.status_code == 403

    def test_multiple_locked_fields_all_reported(self) -> None:
        """同时修改多个锁定字段，全部在错误信息中列出。"""
        case = _make_case("declined")
        updates = {"loan_amount": 1, "lender": "ANZ", "lvr": 80}

        with pytest.raises(HTTPException) as exc_info:
            assert_not_locked(case, updates)

        detail = exc_info.value.detail
        assert "loan_amount" in detail
        assert "lender" in detail
        assert "lvr" in detail

    @pytest.mark.parametrize("stage", ["已结算", "withdrawn", "declined"])
    def test_allowed_field_on_terminal_case_passes(self, stage: str) -> None:
        """终态案件修改允许字段 → 不抛异常。"""
        case = _make_case(stage)
        updates = {"close_note": "补充一些信息"}

        # Should not raise
        assert_not_locked(case, updates)

    def test_empty_updates_passes(self) -> None:
        """空更新不触发锁定。"""
        case = _make_case("settled")
        assert_not_locked(case, {})

    @pytest.mark.parametrize("stage", [
        "收集资料", "审核中", "待递交", "已递交(等银行)",
        "银行补件", "估值中", "已批准", "结算中", "gathering",
    ])
    def test_non_terminal_case_no_locking(self, stage: str) -> None:
        """非终态案件不受任何锁定限制。"""
        case = _make_case(stage)
        updates = {"loan_amount": 999999, "lender": "ANZ", "stage": "settled"}

        # Should not raise
        assert_not_locked(case, updates)

    def test_reopen_unlocks_fields(self) -> None:
        """案件重新打开（stage 回到非终态）后，锁定解除。"""
        case = _make_case("结算中")  # 恢复到结算中（非终态）
        updates = {"loan_amount": 800000}

        # Should not raise — 结算中 is not terminal
        assert_not_locked(case, updates)

    def test_mixed_locked_and_allowed_fields_raises(self) -> None:
        """混合锁定和允许字段，只要有锁定字段就 403。"""
        case = _make_case("settled")
        updates = {"close_note": "ok", "loan_amount": 500000}

        with pytest.raises(HTTPException) as exc_info:
            assert_not_locked(case, updates)

        assert exc_info.value.status_code == 403
        assert "loan_amount" in exc_info.value.detail


# ── get_allowed_fields_for_terminal tests ─────────────────────────────


class TestGetAllowedFields:
    """Test the allowed-fields helper."""

    def test_returns_non_empty_set(self) -> None:
        allowed = get_allowed_fields_for_terminal()
        assert isinstance(allowed, set)
        assert len(allowed) > 0

    def test_no_overlap_with_locked(self) -> None:
        """允许字段和锁定字段不能有交集。"""
        allowed = get_allowed_fields_for_terminal()
        overlap = allowed & LOCKED_FIELDS
        assert overlap == set(), f"Overlap detected: {overlap}"
