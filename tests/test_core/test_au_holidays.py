"""WO-39 澳洲时区 / 公共假期 / 银行工作日测试。

配置基准来自 config/holidays_au.yaml（已按官方源核对）；
接口契约见 docs/flash_specs/wo-39-au-holidays.md。
"""

from __future__ import annotations

import datetime as dt
from datetime import datetime

from fastapi.testclient import TestClient

from core.ai.case_context import build_case_context
from core.holidays import (
    dls_status,
    is_working_day,
    load_holidays,
    next_holiday,
    upcoming_holidays,
)
from core.models.orm import Case
from server.main import app


class TestLoadHolidays:
    def test_load_holidays_valid(self):
        data = load_holidays()
        assert data["version"] == 1
        assert data["default_state"] == "nsw"
        assert set(data["states"]) == {"act", "nsw", "qld"}
        for cfg in data["states"].values():
            assert cfg["display"]
            assert cfg["holidays"]
            for date_str, name in cfg["holidays"].items():
                assert name
                assert len(date_str) == 10  # YYYY-MM-DD


class TestIsWorkingDay:
    def test_is_working_day_weekday(self):
        # 2026-03-10（周二）NSW
        assert is_working_day(dt.date(2026, 3, 10), "nsw") == (True, None)

    def test_is_working_day_weekend(self):
        # 2026-03-14（周六）
        assert is_working_day(dt.date(2026, 3, 14), "nsw") == (False, None)

    def test_is_working_day_holiday(self):
        # 2026-04-03 Good Friday NSW
        assert is_working_day(dt.date(2026, 4, 3), "nsw") == (False, "Good Friday")

    def test_state_holiday_difference(self):
        # 2026-03-09 Canberra Day ACT 休息、NSW 工作日
        assert is_working_day(dt.date(2026, 3, 9), "act") == (False, "Canberra Day")
        assert is_working_day(dt.date(2026, 3, 9), "nsw") == (True, None)


class TestDlsStatus:
    def test_qld_no_dls_brisbane(self):
        status = dls_status()
        assert status["brisbane"]["dls_active"] is False
        assert status["brisbane"]["utc_offset_hours"] == 10
        assert status["beijing"]["utc_offset_hours"] == 8
        assert status["sydney"]["utc_offset_hours"] in (10, 11)


class TestHolidayQueries:
    def test_upcoming_holidays_sorted(self):
        rows = upcoming_holidays(state=None, limit=60)
        dates = [r["date"] for r in rows]
        assert dates == sorted(dates)
        assert all({"date", "name", "state", "display"} <= set(r) for r in rows)
        assert all(r["state"] in ("act", "nsw", "qld") for r in rows)

    def test_next_holiday(self):
        nxt = next_holiday(state="nsw", from_date=dt.date(2026, 3, 1))
        assert nxt is not None
        assert nxt["date"] == "2026-04-03"  # NSW 无 Canberra Day → 下一个是 Good Friday
        assert nxt["name"] == "Good Friday"


class TestHolidaysApi:
    def test_api_holidays_200(self):
        client = TestClient(app)
        resp = client.get("/api/holidays")
        assert resp.status_code == 200
        body = resp.json()
        assert set(body["today"]) == {"act", "nsw", "qld"}
        for key, item in body["today"].items():
            assert item["state"] == key
            assert set(item) == {"date", "state", "is_working_day", "holiday_name", "weekday"}
        assert set(body["dls"]) == {"sydney", "brisbane", "beijing"}
        assert isinstance(body["upcoming"], list)
        if body["next"] is not None:
            assert set(body["next"]) == {"date", "name", "state", "display"}

    def test_api_holidays_bad_state(self):
        client = TestClient(app)
        resp = client.get("/api/holidays", params={"state": "vic"})
        assert resp.status_code == 422


class TestCaseRiskFinance:
    def test_case_risk_finance_on_holiday(self, test_db):
        # finance_deadline=2026-04-03（Good Friday）
        test_db.add(Case(id="HOL-1", client_name="PERSON_1", finance_deadline=datetime(2026, 4, 3, 0, 0, 0, tzinfo=dt.UTC)))
        test_db.commit()
        ctx = build_case_context("HOL-1", test_db, track="external")
        matched = [r for r in ctx["risk"] if "银行休息日" in r]
        assert matched, ctx["risk"]
        assert "2026-04-03" in matched[0]
        assert "Good Friday" in matched[0]

    def test_case_risk_finance_workday_no_extra(self, test_db):
        # finance_deadline=2026-04-07（周二，工作日）→ 无"银行休息日"新增风险
        test_db.add(Case(id="HOL-2", client_name="PERSON_1", finance_deadline=datetime(2026, 4, 7, 0, 0, 0, tzinfo=dt.UTC)))
        test_db.commit()
        ctx = build_case_context("HOL-2", test_db, track="external")
        assert not any("银行休息日" in r for r in ctx["risk"]), ctx["risk"]
