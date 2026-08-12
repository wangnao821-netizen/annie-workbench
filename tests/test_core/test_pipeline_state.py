"""流水线状态机测试 — 钉住 core.pipeline.state 的合法/非法转换契约。"""

import pytest

from core.pipeline.state import (
    FileState,
    InvalidTransitionError,
    VALID_TRANSITIONS,
    can_retry,
    is_terminal,
    transition,
)


class TestFileStateEnum:
    """FileState 枚举值契约。"""

    def test_discovered_value(self):
        assert FileState.DISCOVERED.value == "DISCOVERED"

    def test_reported_terminal_value(self):
        assert FileState.REPORTED.value == "REPORTED"

    def test_needs_manual_review_value(self):
        assert FileState.NEEDS_MANUAL_REVIEW.value == "NEEDS_MANUAL_REVIEW"


class TestTransition:
    """transition 合法转换链。"""

    def test_forward_chain(self):
        """DISCOVERED → PARSED → EXTRACTED → ANALYZED → REPORTED。"""
        state = FileState.DISCOVERED
        for target in (
            FileState.PARSED,
            FileState.EXTRACTED,
            FileState.ANALYZED,
            FileState.REPORTED,
        ):
            state = transition(state, target)
        assert state == FileState.REPORTED

    def test_skip_path(self):
        """DISCOVERED → SKIPPED 是合法分支。"""
        assert transition(FileState.DISCOVERED, FileState.SKIPPED) == FileState.SKIPPED

    def test_manual_review_path(self):
        """PARSED → NEEDS_MANUAL_REVIEW 是合法分支。"""
        assert (
            transition(FileState.PARSED, FileState.NEEDS_MANUAL_REVIEW)
            == FileState.NEEDS_MANUAL_REVIEW
        )

    def test_failed_retry(self):
        """FAILED → DISCOVERED 允许重试。"""
        assert transition(FileState.FAILED, FileState.DISCOVERED) == FileState.DISCOVERED


class TestInvalidTransition:
    """非法转换必须抛 InvalidTransitionError。"""

    def test_jump_over_state_raises(self):
        """不能跳过 PARSED 直接到 REPORTED。"""
        with pytest.raises(InvalidTransitionError):
            transition(FileState.DISCOVERED, FileState.REPORTED)

    def test_backward_raises(self):
        """不能倒退：REPORTED → ANALYZED。"""
        with pytest.raises(InvalidTransitionError):
            transition(FileState.REPORTED, FileState.ANALYZED)

    def test_terminal_no_exit_raises(self):
        """终态 SKIPPED 不能再转换。"""
        for terminal in (
            FileState.REPORTED,
            FileState.SKIPPED,
            FileState.NEEDS_MANUAL_REVIEW,
        ):
            with pytest.raises(InvalidTransitionError):
                transition(terminal, FileState.DISCOVERED)

    def test_error_message_includes_states(self):
        """错误信息包含源/目标状态名。"""
        with pytest.raises(InvalidTransitionError) as excinfo:
            transition(FileState.DISCOVERED, FileState.REPORTED)
        assert "DISCOVERED" in str(excinfo.value)
        assert "REPORTED" in str(excinfo.value)


class TestStateHelpers:
    """is_terminal / can_retry 判定。"""

    def test_terminal_states(self):
        for state in (
            FileState.REPORTED,
            FileState.SKIPPED,
            FileState.NEEDS_MANUAL_REVIEW,
        ):
            assert is_terminal(state), state

    def test_non_terminal_states(self):
        assert not is_terminal(FileState.PARSED)
        assert not is_terminal(FileState.FAILED)

    def test_can_retry_only_failed(self):
        assert can_retry(FileState.FAILED)
        assert not can_retry(FileState.PARSED)
        assert not can_retry(FileState.REPORTED)

    def test_all_states_have_transition_map(self):
        """每个状态都在 VALID_TRANSITIONS 中有定义。"""
        for state in FileState:
            assert state in VALID_TRANSITIONS
