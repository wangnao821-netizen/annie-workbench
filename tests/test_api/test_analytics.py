"""Analytics 4 端点测试 — 天/周/月聚合、跨期、空库、非法参数。"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from core.analytics.bucketing import buckets_since, period_key
from core.models.orm import (
    Action, Case, CaseChecklist, CaseMilestone, CaseTimelineEvent,
    EmailDraft, EmailDraftReply, OsCondition,
)
from server.deps import get_db
from server.main import app

ENDPOINTS = (
    "/api/analytics/overview",
    "/api/analytics/pipeline",
    "/api/analytics/lenders",
    "/api/analytics/efficiency",
)


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _n(dt):
    return dt.replace(tzinfo=None)


class TestBucketing:
    def test_period_key_rules(self):
        dt = datetime(2026, 8, 12, 15, 0, 0)
        assert period_key(dt, "day") == "2026-08-12"
        assert period_key(dt, "week") == "2026-W33"
        assert period_key(dt, "month") == "2026-08"

    def test_buckets_old_to_new_contiguous(self):
        buckets = buckets_since("month", 3)
        assert [k for _, _, k in buckets] == sorted(k for _, _, k in buckets)
        assert all(buckets[i][1] == buckets[i + 1][0] for i in range(2))
        assert buckets_since("week", 2)[0][0].weekday() == 0


class TestParamsAndEmpty:
    def test_params(self, client):
        for path in ENDPOINTS:
            for g in ("day", "week", "month"):
                assert client.get(path, params={"granularity": g}).status_code == 200
            assert client.get(path, params={"granularity": "year"}).status_code == 422
        assert client.get("/api/analytics/pipeline", params={"granularity": "month", "buckets": 0}).status_code == 422

    def test_empty_db(self, client):
        ov = client.get("/api/analytics/overview").json()
        assert all(all(ov[s][k] == 0 for k in ("active_cases", "new_cases", "submitted", "approved", "settled", "tasks_done"))
                   and ov[s]["commission_estimate"] == 0.0 for s in ("current", "previous"))
        series = client.get("/api/analytics/pipeline").json()["series"]
        assert len(series) == 6 and all(p["new_cases"] == p["submitted"] == p["approved"] == p["settled"] == 0
                                        and p["amount"] == 0.0 and p["commission"] == 0.0 for p in series)
        assert client.get("/api/analytics/lenders").json()["lenders"] == []
        eff = client.get("/api/analytics/efficiency").json()
        assert all(eff[s]["tasks_done"] == 0 and eff[s]["on_time_rate"] == 0.0
                   and eff[s]["checklist_confirm_rate"] == 0.0 and eff[s]["ai_adoption_count"] == 0
                   and eff[s]["avg_client_reply_days"] is None for s in ("current", "previous"))


class TestCrossPeriod:
    def test_month_pipeline_and_overview(self, client, test_db):
        a, b, c = buckets_since("month", 3)
        test_db.add_all([
            Case(id="MC2", client_name="李四", lender="CBA", loan_amount=500000, stage="收集资料", created_at=_n(b[0])),
            Case(id="MC3", client_name="王五", lender="ANZ", loan_amount=None, stage="已结算", created_at=_n(a[0]), closed_at=_n(a[0])),
            Case(id="MC1", client_name="张三", lender="CBA", loan_amount=800000, stage="已批准", created_at=_n(c[0])),
        ])
        test_db.add_all([CaseMilestone(case_id=cc, milestone_name=mm, status="completed", actual_date=_n(aa))
                         for cc, mm, aa in (("MC2", "submitted", b[0]), ("MC3", "settled", a[0]),
                                            ("MC1", "submitted", c[0]), ("MC1", "approved", c[0]))])
        test_db.commit()

        series = client.get("/api/analytics/pipeline", params={"granularity": "month", "buckets": 3}).json()["series"]
        assert [p["period"] for p in series] == [a[2], b[2], c[2]]
        assert series[0]["new_cases"] == 1 and series[0]["settled"] == 1
        assert series[1]["new_cases"] == 1 and series[1]["submitted"] == 1 and series[1]["amount"] == 500000
        assert series[1]["commission"] == 3250.0
        assert series[2]["new_cases"] == 1 and series[2]["submitted"] == 1 and series[2]["approved"] == 1
        assert series[2]["amount"] == 800000 and series[2]["commission"] == 5200.0

        ov = client.get("/api/analytics/overview", params={"granularity": "month"}).json()
        cur, prev = ov["current"], ov["previous"]
        assert cur["active_cases"] == 2 and cur["new_cases"] == 1  # MC1+MC2（MC3 已关）
        assert cur["submitted"] == 1 and cur["approved"] == 1 and cur["settled"] == 0
        assert cur["commission_estimate"] == 5200.0
        assert prev["active_cases"] == 1 and prev["new_cases"] == 1 and prev["submitted"] == 1
        assert prev["commission_estimate"] == 3250.0

    def test_day_week_grouping(self, client, test_db):
        days = buckets_since("day", 3)
        test_db.add_all([Case(id=f"DAY-{i}", client_name=f"C{i}", lender="ANZ", created_at=_n(s))
                         for i, (s, _, _) in enumerate(days)])
        test_db.commit()
        ds = client.get("/api/analytics/pipeline", params={"granularity": "day", "buckets": 3}).json()["series"]
        assert [p["period"] for p in ds] == [k for _, _, k in days] and all(p["new_cases"] == 1 for p in ds)

        test_db.query(Case).delete()
        prev, cur = buckets_since("week", 2)
        test_db.add_all([
            Case(id="WK-CUR", client_name="本周", created_at=_n(cur[0])),
            Case(id="WK-PRV", client_name="上周", created_at=_n(prev[0]) + timedelta(days=1)),
        ])
        test_db.commit()
        ws = client.get("/api/analytics/pipeline", params={"granularity": "week", "buckets": 2}).json()["series"]
        assert [p["period"] for p in ws] == [prev[2], cur[2]] and [p["new_cases"] for p in ws] == [1, 1]
        assert "-W" in ws[0]["period"]


class TestLenders:
    def test_stats_and_null(self, client, test_db):
        s = _n(buckets_since("month", 1)[0][0])
        test_db.add_all([
            Case(id="LD1", client_name="甲", lender="CBA", stage="已批准", created_at=s),
            Case(id="LD2", client_name="乙", lender="CBA", stage="收集资料", created_at=s),
            Case(id="LD3", client_name="丙", lender="CBA", stage="已批准", created_at=s),
            Case(id="LD4", client_name="丁", lender="ANZ", stage="已批准", created_at=s),
            Case(id="NL1", client_name="无数据", lender="NAB", stage="收集资料", created_at=s),
        ])
        for case, appr in (("LD1", 3), ("LD3", 9), ("LD4", 6)):
            test_db.add_all([
                CaseMilestone(case_id=case, milestone_name="submitted", status="completed", actual_date=s),
                CaseMilestone(case_id=case, milestone_name="approved", status="completed", actual_date=s + timedelta(days=appr)),
            ])
        test_db.add_all([OsCondition(id="os-1", case_id="LD1", category="document", raw_text="a"),
                         OsCondition(id="os-3", case_id="LD3", category="document", raw_text="b")])
        test_db.commit()

        lenders = {r["lender"]: r for r in client.get("/api/analytics/lenders", params={"granularity": "month"}).json()["lenders"]}
        cba = lenders["CBA"]
        assert cba["cases"] == 3 and cba["os_rate"] == 0.67 and cba["approval_rate"] == 0.67
        assert cba["avg_approval_days"] == 6.0
        assert lenders["ANZ"]["avg_approval_days"] == 6.0 and lenders["ANZ"]["approval_rate"] == 1.0
        assert lenders["NAB"]["avg_approval_days"] is None


class TestEfficiency:
    def test_metrics_current_and_previous(self, client, test_db):
        prev, cur = buckets_since("day", 2)
        cur_s, prev_s = _n(cur[0]), _n(prev[0])
        a1 = Action(case_id="EF1", type="follow_up", title="t1", status="completed", delegation_deadline=cur_s + timedelta(hours=6))
        a2 = Action(case_id="EF1", type="follow_up", title="t2", status="completed", delegation_deadline=cur_s - timedelta(hours=2))
        a3 = Action(case_id="EF1", type="os_review", title="t3", status="completed")
        a4 = Action(case_id="EF1", type="classify", title="t4", status="completed", delegation_deadline=cur_s + timedelta(hours=10), routing_options=[{"action": "approve", "label": "批准"}])
        p1 = Action(case_id="EF1", type="follow_up", title="p1", status="completed", delegation_deadline=prev_s + timedelta(hours=1))
        test_db.add_all([a1, a2, a3, a4, p1])
        test_db.flush()
        test_db.add_all([CaseTimelineEvent(case_id="EF1", event_type="action_completed", title="x", source_ref=str(act.id), created_at=at)
                         for act, at in ((a1, cur_s), (a2, cur_s), (a3, cur_s), (a4, cur_s), (p1, prev_s))])
        for nm, st, at in (("payslip", "received", cur_s), ("noa", "received", cur_s), ("letter", "pending", cur_s),
                           ("id", "received", prev_s), ("bank", "pending", prev_s)):
            test_db.add(CaseChecklist(updated_at=at, item_name=nm, category="doc", case_id="EF1", status=st))
        d1 = EmailDraft(case_id="EF1", draft_type="follow_up", body="x", status="approved", updated_at=cur_s, approved_at=cur_s)
        d2 = EmailDraft(case_id="EF1", draft_type="reply", body="y", status="approved", updated_at=cur_s)
        test_db.add_all([d1, d2])
        test_db.flush()
        test_db.add(EmailDraftReply(draft_id=d1.id, received_at=cur_s + timedelta(days=1)))
        test_db.commit()

        body = client.get("/api/analytics/efficiency", params={"granularity": "day"}).json()
        cur_m, prev_m = body["current"], body["previous"]
        assert cur_m["tasks_done"] == 4 and cur_m["on_time_rate"] == 0.67
        assert cur_m["checklist_confirm_rate"] == 0.67 and cur_m["ai_adoption_count"] == 3
        assert cur_m["avg_client_reply_days"] == 1.0
        assert prev_m["tasks_done"] == 1 and prev_m["on_time_rate"] == 1.0
        assert prev_m["checklist_confirm_rate"] == 0.5 and prev_m["avg_client_reply_days"] is None