"""WO-55 邮件时序提取测试：正则萃取、事件定性、卡点标记、落库与 API 端点。

全部使用 tmp_path 构造虚拟数据 + 结构化 Mock 邮件解析器，严禁访问真实客户目录。
"""

import re

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case, CaseContextEvent
from core.pipeline import msg_timeline
from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def fake_folder(tmp_path):
    folder = tmp_path / "case_emails"
    folder.mkdir()
    return folder


def _mock_events():
    """两条模拟邮件事件（乱序传入，用于验证正序排序）。"""
    return [
        {
            "id": None,
            "event_time": "2026-08-10T09:30:00+00:00",
            "event_type": "assessor_assigned",
            "title": "Application assigned to Rachel Fonseka for assessment",
            "summary": "The application has been assigned for assessment.",
            "sender": "lender@bank.com.au",
            "assessor": "Rachel Fonseka",
            "lender_ref": "23174 (EX 11199)",
            "source_file": "02_assigned.msg",
            "is_blocker": False,
            "blocker_reason": None,
        },
        {
            "id": None,
            "event_time": "2026-08-08T09:00:00+00:00",
            "event_type": "submission_lodged",
            "title": "Application lodged to bank",
            "summary": "Application 23174 lodged.",
            "sender": "broker@vera.com.au",
            "assessor": None,
            "lender_ref": None,
            "source_file": "01_lodged.msg",
            "is_blocker": False,
            "blocker_reason": None,
        },
    ]


def _event_types(rows):
    return [re.match(r"\[([a-z_]+)\]", r.content or "").group(1) for r in rows]


def _query_timeline(db, case_id):
    return (
        db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == case_id,
            CaseContextEvent.source_type == "email_timeline",
        )
        .order_by(CaseContextEvent.created_at.asc(), CaseContextEvent.id.asc())
        .all()
    )


def test_extract_assessor_and_ref():
    text = (
        "Your application 23174 (EX 11199) has been assigned to "
        "Rachel Fonseka for assessment."
    )
    assert msg_timeline._extract_assessor(text) == "Rachel Fonseka"
    assert msg_timeline._extract_lender_ref(text) == "23174 (EX 11199)"
    assert msg_timeline._extract_lender_ref("App ID: 23174") == "23174"


def test_event_classification_valuation_shortfall():
    subject = "Valuation Report - 12 Smith St, Sydney"
    body = "The bank valuation came back at $1.9M, which is below the expected $2.3M."
    event_type, is_blocker, blocker_reason = msg_timeline._classify_event(subject, body)
    assert event_type == "valuation_shortfall"
    assert is_blocker is True
    assert blocker_reason
    assert "$1.9M" in blocker_reason
    assert "$2.3M" in blocker_reason


def test_classification_more_event_types():
    assert msg_timeline._classify_event("MIR", "Further information is required")[0] == "mir_requested"
    assert msg_timeline._classify_event("Reassessment", "We appeal this decision")[0] == "reassessment_submitted"
    assert msg_timeline._classify_event("Approved", "Your loan has been approved. Congratulations!")[0] == "approval_issued"
    assert msg_timeline._classify_event("Received", "Your application has been received and lodged.")[0] == "submission_lodged"
    assert msg_timeline._classify_event("Assignment", "Assigned to assessor Rachel Fonseka")[0] == "assessor_assigned"
    assert msg_timeline._classify_event("Weekly update", "Nothing new this week")[0] == "note"


def test_sync_timeline_for_case_with_mock(test_db, fake_folder, monkeypatch):
    test_db.add(Case(id="TL-3", client_name="测试客户", folder_path=str(fake_folder)))
    test_db.commit()
    monkeypatch.setattr(msg_timeline, "extract_timeline_from_folder", lambda folder_path: _mock_events())

    res = msg_timeline.sync_timeline_for_case("TL-3", test_db)
    assert res["extracted_count"] == 2
    assert res["assessor_name"] == "Rachel Fonseka"
    assert res["lender_ref"] == "23174 (EX 11199)"

    rows = _query_timeline(test_db, "TL-3")
    assert len(rows) == 2
    assert all(r.source_type == "email_timeline" for r in rows)
    assert all(r.status == "confirmed" for r in rows)
    assert _event_types(rows) == ["submission_lodged", "assessor_assigned"]

    events = msg_timeline.get_timeline_for_case("TL-3", test_db)
    assert [e["event_type"] for e in events] == ["submission_lodged", "assessor_assigned"]
    assert events[1]["assessor"] == "Rachel Fonseka"
    assert events[1]["lender_ref"] == "23174 (EX 11199)"


def test_timeline_endpoints(client, test_db, fake_folder, monkeypatch):
    test_db.add(Case(id="TL-4", client_name="测试客户", folder_path=str(fake_folder)))
    test_db.commit()
    monkeypatch.setattr(msg_timeline, "extract_timeline_from_folder", lambda folder_path: _mock_events())

    resp = client.post("/api/cases/TL-4/timeline/extract-emails")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["case_id"] == "TL-4"
    assert body["extracted_count"] == 2
    assert body["assessor_name"] == "Rachel Fonseka"
    assert body["lender_ref"] == "23174 (EX 11199)"

    again = client.post("/api/cases/TL-4/timeline/extract-emails")
    assert again.status_code == 200
    assert again.json()["extracted_count"] == 0

    resp = client.get("/api/cases/TL-4/timeline")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["case_id"] == "TL-4"
    assert data["assessor_name"] == "Rachel Fonseka"
    assert data["lender_ref"] == "23174 (EX 11199)"
    assert len(data["events"]) == 2
    assert [e["event_type"] for e in data["events"]] == ["submission_lodged", "assessor_assigned"]
    assert data["events"][1]["assessor"] == "Rachel Fonseka"
    assert data["events"][1]["lender_ref"] == "23174 (EX 11199)"