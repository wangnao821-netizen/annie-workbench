"""context-events / 手动建任务 端点测试。

覆盖：
- POST /api/cases/{id}/context-events（internal/external 蒸馏 + 404/422 语义）
- POST /api/tasks/ 手动建任务（case_id 必填 / source_channel 白名单 / match_status=confirmed）
"""

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Action, Case, CaseContextEvent
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


class TestContextEventsCreate:
    """POST /api/cases/{case_id}/context-events — 记一笔。"""

    def test_internal_persists_and_distills(self, client, test_db):
        test_db.add(Case(id="CE-1", client_name="张三", stage="收集资料"))
        test_db.commit()

        resp = client.post(
            "/api/cases/CE-1/context-events",
            json={
                "source_type": "manual_note",
                "content": "客户希望转贷到 NAB",
                "track": "internal",
                "source_ref": "ref-001",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] > 0
        assert body["case_id"] == "CE-1"
        assert body["source_type"] == "manual_note"
        assert body["content"] == "客户希望转贷到 NAB"
        assert body["track"] == "internal"
        assert body["created_at"] is not None

        # 落库 + source_ref 去重键写回 + 内线蒸馏触发
        evt = (
            test_db.query(CaseContextEvent)
            .filter(CaseContextEvent.case_id == "CE-1")
            .first()
        )
        assert evt is not None
        assert evt.source_ref == "ref-001"
        case = test_db.get(Case, "CE-1")
        assert case.context_summary
        assert "转贷" in case.context_summary

        # 手动验收：GET context?track=internal 能看到内容
        ctx = client.get("/api/cases/CE-1/context", params={"track": "internal"})
        assert ctx.status_code == 200
        assert "转贷" in ctx.json()["memory"]

    def test_external_goes_submission_summary(self, client, test_db):
        test_db.add(Case(id="CE-2", client_name="李四", stage="已递交"))
        test_db.commit()

        resp = client.post(
            "/api/cases/CE-2/context-events",
            json={"content": "递交 AIP，利率 6.09", "track": "external"},
        )
        assert resp.status_code == 200
        assert resp.json()["track"] == "external"

        case = test_db.get(Case, "CE-2")
        assert case.submission_summary
        assert "6.09" in case.submission_summary

        ctx = client.get("/api/cases/CE-2/context", params={"track": "external"})
        assert ctx.status_code == 200
        assert "6.09" in ctx.json()["memory"]

    def test_case_not_found_404(self, client):
        resp = client.post(
            "/api/cases/nonexistent/context-events",
            json={"content": "任意内容"},
        )
        assert resp.status_code == 404

    def test_empty_content_422(self, client, test_db):
        test_db.add(Case(id="CE-3", client_name="王五"))
        test_db.commit()

        resp = client.post(
            "/api/cases/CE-3/context-events",
            json={"content": ""},
        )
        assert resp.status_code == 422

    def test_blank_content_422(self, client, test_db):
        test_db.add(Case(id="CE-4", client_name="赵六"))
        test_db.commit()

        resp = client.post(
            "/api/cases/CE-4/context-events",
            json={"content": "   "},
        )
        assert resp.status_code == 422

    def test_invalid_track_422(self, client, test_db):
        test_db.add(Case(id="CE-5", client_name="孙七"))
        test_db.commit()

        resp = client.post(
            "/api/cases/CE-5/context-events",
            json={"content": "你好", "track": "public"},
        )
        assert resp.status_code == 422


class TestManualTasks:
    """POST /api/tasks/ — 手动建任务。"""

    def test_missing_case_id_422(self, client):
        resp = client.post(
            "/api/tasks/",
            json={"title": "跟进银行", "source_channel": "manual"},
        )
        assert resp.status_code == 422
        assert "请先关联案件或新建案件" in resp.json()["detail"]

    def test_manual_channel_confirmed(self, client, test_db):
        test_db.add(
            Case(id="TSK-1", client_name="周八", lender="CBA", loan_amount=100000)
        )
        test_db.commit()

        resp = client.post(
            "/api/tasks/",
            json={
                "case_id": "TSK-1",
                "title": "通知客户补材料",
                "source_channel": "manual",
                "task_type": "general",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["case_id"] == "TSK-1"
        assert body["match_status"] == "confirmed"

        action = test_db.query(Action).filter(Action.case_id == "TSK-1").first()
        assert action is not None
        assert action.match_status == "confirmed"

    def test_calendar_channel_ok(self, client, test_db):
        test_db.add(Case(id="TSK-2", client_name="吴九", lender="NAB", loan_amount=50000))
        test_db.commit()

        resp = client.post(
            "/api/tasks/",
            json={
                "case_id": "TSK-2",
                "title": "日历计划任务",
                "source_channel": "calendar",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["source_channel"] == "calendar"

    def test_wechat_channel_422(self, client, test_db):
        test_db.add(Case(id="TSK-3", client_name="郑十"))
        test_db.commit()

        resp = client.post(
            "/api/tasks/",
            json={
                "case_id": "TSK-3",
                "title": "微信跟进",
                "source_channel": "wechat",
            },
        )
        assert resp.status_code == 422