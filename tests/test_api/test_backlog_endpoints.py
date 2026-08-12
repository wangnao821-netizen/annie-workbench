"""backlog 端点测试 — /api/drafts/ /api/cases/archived/ /api/imports/。"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from core.models.orm import (
    Case,
    CaseChecklist,
    CaseTimelineEvent,
    EmailDraft,
    ImportRecord,
    OsCondition,
)
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


class TestDraftsList:
    """GET /api/drafts/。"""

    def test_empty_db(self, client):
        resp = client.get("/api/drafts/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_lists_with_client_name(self, client, test_db):
        test_db.add(Case(id="CASE-1", client_name="张伟", lender="CBA"))
        test_db.add(
            EmailDraft(
                case_id="CASE-1",
                draft_type="reply",
                subject="回复：贷款进展",
                body="正文",
                status="draft",
                updated_at=datetime(2026, 8, 1, 10, 0, 0, tzinfo=UTC),
            )
        )
        test_db.commit()

        resp = client.get("/api/drafts/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        item = body[0]
        assert item["case_id"] == "CASE-1"
        assert item["client_name"] == "张伟"
        assert item["subject"] == "回复：贷款进展"
        assert item["status"] == "draft"
        assert item["version"] == 1

    def test_filters_status(self, client, test_db):
        test_db.add(EmailDraft(case_id="C1", draft_type="reply", subject="A", body="b", status="draft"))
        test_db.add(EmailDraft(case_id="C1", draft_type="reply", subject="B", body="b", status="sent"))
        test_db.commit()

        resp = client.get("/api/drafts/", params={"status": "sent"})
        body = resp.json()
        assert len(body) == 1
        assert body[0]["subject"] == "B"


class TestArchivedCases:
    """GET /api/cases/archived/。"""

    def test_empty_db(self, client):
        resp = client.get("/api/cases/archived/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_includes_terminal_only(self, client, test_db):
        test_db.add(
            Case(
                id="ARC-1",
                client_name="客户A",
                lender="CBA",
                loan_amount=100000,
                stage="已结算",
                closed_at=datetime(2026, 8, 1, tzinfo=UTC),
                close_reason="settled",
            )
        )
        test_db.add(Case(id="ACT-1", client_name="客户B", lender="NAB", loan_amount=200000, stage="收集资料"))
        test_db.commit()

        resp = client.get("/api/cases/archived/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["case_id"] == "ARC-1"
        assert body[0]["stage"] == "已结算"
        assert body[0]["closed_at"] is not None
        assert body[0]["close_reason"] == "settled"

    def test_not_captured_by_case_detail(self, client):
        resp = client.get("/api/cases/archived/")
        assert resp.status_code == 200
        assert resp.json() == []


class TestCaseListEnrichment:
    """GET /api/cases/ 补充 finance_deadline / os_pending_count。"""

    def test_list_includes_finance_deadline(self, client, test_db):
        test_db.add(
            Case(
                id="ENR-1",
                client_name="客户甲",
                lender="CBA",
                stage="收集资料",
                finance_deadline=datetime(2026, 8, 30, tzinfo=UTC),
            )
        )
        test_db.commit()

        resp = client.get("/api/cases/")
        assert resp.status_code == 200
        item = next(i for i in resp.json() if i["case_id"] == "ENR-1")
        assert item["finance_deadline"] == "2026-08-30T00:00:00"
        assert item["os_pending_count"] == 0

    def test_os_pending_count_reflects_pending(self, client, test_db):
        test_db.add(Case(id="ENR-2", client_name="客户乙", lender="NAB", stage="已递交"))
        test_db.add(
            OsCondition(
                id="os_pending_1",
                case_id="ENR-2",
                raw_text="need bank statement",
                category="document",
                status="pending",
            )
        )
        test_db.add(
            OsCondition(
                id="os_satisfied_1",
                case_id="ENR-2",
                raw_text="ok",
                category="document",
                status="satisfied",
            )
        )
        test_db.commit()

        resp = client.get("/api/cases/")
        assert resp.status_code == 200
        item = next(i for i in resp.json() if i["case_id"] == "ENR-2")
        assert item["os_pending_count"] == 1

    def test_detail_includes_finance_deadline(self, client, test_db):
        test_db.add(
            Case(
                id="ENR-3",
                client_name="客户丙",
                lender="CBA",
                stage="收集资料",
                finance_deadline=datetime(2026, 9, 15, tzinfo=UTC),
            )
        )
        test_db.commit()

        resp = client.get("/api/cases/ENR-3")
        assert resp.status_code == 200
        body = resp.json()
        assert body["finance_deadline"] == "2026-09-15T00:00:00"


class TestImportsList:
    """GET /api/imports/。"""

    def test_empty_db(self, client):
        resp = client.get("/api/imports/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_lists_record(self, client, test_db):
        test_db.add(
            ImportRecord(
                source="vba",
                status="done",
                file_count=5,
                message_count=12,
                started_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC),
                note="导入完成",
            )
        )
        test_db.commit()

        resp = client.get("/api/imports/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["source"] == "vba"
        assert body[0]["status"] == "done"
        assert body[0]["file_count"] == 5
        assert body[0]["message_count"] == 12
        assert body[0]["note"] == "导入完成"

    def test_source_filter(self, client, test_db):
        test_db.add(ImportRecord(source="vba", status="done", started_at=datetime(2026, 8, 1, tzinfo=UTC)))
        test_db.add(ImportRecord(source="manual", status="running", started_at=datetime(2026, 8, 2, tzinfo=UTC)))
        test_db.commit()

        resp = client.get("/api/imports/", params={"source": "manual"})
        body = resp.json()
        assert len(body) == 1
        assert body[0]["source"] == "manual"


class TestCaseContext:
    """GET /api/cases/{case_id}/context — 统一案件上下文。"""

    def test_full_context(self, client, test_db):
        test_db.add(
            Case(
                id="CTX-1",
                client_name="客户戊",
                lender="CBA",
                loan_amount=800000,
                property_value=900000,
                lvr=88,
                purpose="自住",
                interest_rate="6.09",
                stage="收集资料",
                client_goal="换大房",
                special_circumstances="首次购房补贴",
            )
        )
        test_db.add(
            CaseChecklist(case_id="CTX-1", item_name="护照", category="id", status="received")
        )
        test_db.add(
            CaseChecklist(case_id="CTX-1", item_name="工资单", category="income", status="pending")
        )
        test_db.add(
            OsCondition(
                id="os_ctx_1",
                case_id="CTX-1",
                raw_text="provide bank statement",
                category="document",
                status="pending",
            )
        )
        test_db.add(
            CaseTimelineEvent(
                case_id="CTX-1",
                event_type="stage_advanced",
                title="进入收集资料",
                description="阶段推进",
            )
        )
        test_db.commit()

        resp = client.get("/api/cases/CTX-1/context")
        assert resp.status_code == 200
        body = resp.json()
        assert body["case_id"] == "CTX-1"
        assert body["facts"]["client_name"] == "客户戊"
        assert body["facts"]["lender"] == "CBA"
        assert body["checklist"]["done"] == 1
        assert body["checklist"]["total"] == 2
        assert "工资单" in body["checklist"]["missing"]
        assert body["os"]["pending_count"] == 1
        assert len(body["timeline"]) >= 1
        assert body["timeline"][0]["event_type"] == "stage_advanced"
        assert any("OS" in r for r in body["risk"])
        assert any("清单" in r for r in body["risk"])
        assert "贷款方案" in body["memory"]

    def test_empty_case_defaults(self, client, test_db):
        test_db.add(Case(id="CTX-2", client_name="客户己", stage="收集资料"))
        test_db.commit()

        resp = client.get("/api/cases/CTX-2/context")
        assert resp.status_code == 200
        body = resp.json()
        assert body["checklist"]["done"] == 0
        assert body["checklist"]["total"] == 0
        assert body["os"]["pending_count"] == 0
        assert body["risk"] == []
        assert body["memory"]

    def test_not_found(self, client):
        resp = client.get("/api/cases/nonexistent/context")
        assert resp.status_code == 404
