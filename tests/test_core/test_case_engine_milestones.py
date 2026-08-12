"""Unit tests for core.case_engine.milestones (migrated from milestone_processor)."""

from __future__ import annotations

from datetime import timedelta

import pytest

from core.case_engine.milestones import (
    MILESTONE_SEQUENCE,
    get_stage_key,
    init_case_milestones,
    update_case_stage_and_milestones,
)
from core.models.orm import CaseMilestone


class TestGetStageKey:
    def test_empty_returns_gathering(self):
        assert get_stage_key(None) == "gathering"
        assert get_stage_key("") == "gathering"

    def test_chinese_labels_map_to_keys(self):
        assert get_stage_key("收集资料") == "gathering"
        assert get_stage_key("已递交(等银行)") == "submitted"
        assert get_stage_key("银行补件") == "os_requested"
        assert get_stage_key("已批准") == "approved"
        assert get_stage_key("已结算") == "settled"

    def test_english_keys_pass_through(self):
        assert get_stage_key("submitted") == "submitted"
        assert get_stage_key("valuing") == "valuing"
        assert get_stage_key("SUBMITTED") == "submitted"

    def test_special_stage_keys(self):
        assert get_stage_key("已递交") == "submitted"
        assert get_stage_key("已暂停") == "on_hold"
        assert get_stage_key("on hold") == "on_hold"
        assert get_stage_key("已终止") == "terminated"
        assert get_stage_key("已撤回") == "withdrawn"
        assert get_stage_key("已拒绝") == "declined"

    def test_unrecognized_returns_none(self):
        assert get_stage_key("unknown_stage") is None


class TestInitCaseMilestones:
    def test_creates_nine_rows_in_sequence(self, test_db, sample_case):
        milestones = init_case_milestones(sample_case.id, test_db)
        assert [m.milestone_name for m in milestones] == MILESTONE_SEQUENCE
        assert len(milestones) == 9

    def test_gathering_starts_completed(self, test_db, sample_case):
        milestones = init_case_milestones(sample_case.id, test_db)
        gathering = next(m for m in milestones if m.milestone_name == "gathering")
        assert gathering.status == "completed"
        assert gathering.actual_date is not None
        pending = [m for m in milestones if m.milestone_name != "gathering"]
        assert all(m.status == "pending" and m.actual_date is None for m in pending)

    def test_estimated_dates_offsets(self, test_db, sample_case):
        milestones = init_case_milestones(sample_case.id, test_db)
        by_name = {m.milestone_name: m for m in milestones}
        base = by_name["gathering"].actual_date
        assert by_name["reviewing"].estimated_date == base + timedelta(days=1)
        assert by_name["submitted"].estimated_date == base + timedelta(days=3)
        assert by_name["approved"].estimated_date == base + timedelta(days=10)
        assert by_name["settled"].estimated_date == base + timedelta(days=30)
        assert by_name["os_requested"].estimated_date is None
        assert by_name["settling"].estimated_date is None

    def test_idempotent(self, test_db, sample_case):
        init_case_milestones(sample_case.id, test_db)
        again = init_case_milestones(sample_case.id, test_db)
        assert len(again) == 9
        count = (
            test_db.query(CaseMilestone)
            .filter(CaseMilestone.case_id == sample_case.id)
            .count()
        )
        assert count == 9


class TestUpdateCaseStageAndMilestones:
    def test_advances_stage_and_completes_target(self, test_db, sample_case):
        update_case_stage_and_milestones(sample_case.id, "to_submit", test_db)
        assert sample_case.stage == "待递交"

        milestones = (
            test_db.query(CaseMilestone)
            .filter(CaseMilestone.case_id == sample_case.id)
            .all()
        )
        by_name = {m.milestone_name: m for m in milestones}
        for name in ("gathering", "reviewing", "to_submit"):
            assert by_name[name].status == "completed"
            assert by_name[name].actual_date is not None
        for name in ("submitted", "os_requested", "valuing", "approved", "settling", "settled"):
            assert by_name[name].status == "pending"
            assert by_name[name].actual_date is None

    def test_invalid_stage_raises(self, test_db, sample_case):
        with pytest.raises(ValueError, match="Invalid milestone stage"):
            update_case_stage_and_milestones(sample_case.id, "on_hold", test_db)

    def test_case_not_found_raises(self, test_db):
        with pytest.raises(ValueError, match="Case not found"):
            update_case_stage_and_milestones("ghost_case", "settled", test_db)
