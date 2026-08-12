"""context-events / 手动建任务 端点测试。

覆盖：
- POST /api/cases/{id}/context-events（internal/external 蒸馏 + 404/422 语义）
- POST /api/tasks/ 手动建任务（case_id 必填 / source_channel 白名单 / match_status=confirmed）
"""

import pytest
from fastapi.testclient import TestClient

from core.context.accumulator import append_context_event
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


class TestConfirmationGate:
    """确认闸门状态机：pending → confirmed → superseded（WO-14）。"""

    def test_manual_note_defaults_confirmed(self, client, test_db):
        test_db.add(Case(id="CG-1", client_name="客户一"))
        test_db.commit()

        resp = client.post(
            "/api/cases/CG-1/context-events",
            json={"content": "默认记录"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"

        ok = client.get("/api/cases/CG-1/context-events", params={"status": "confirmed"})
        assert ok.status_code == 200
        assert [e["content"] for e in ok.json()] == ["默认记录"]
        assert ok.json()[0]["status"] == "confirmed"

        pend = client.get("/api/cases/CG-1/context-events", params={"status": "pending"})
        assert pend.status_code == 200
        assert pend.json() == []

    def test_pending_not_in_distill(self, client, test_db):
        test_db.add(Case(id="CG-2", client_name="客户二"))
        test_db.commit()

        append_context_event("CG-2", "manual_note", "低置信猜测内容", test_db, status="pending")

        case = test_db.get(Case, "CG-2")
        assert not case.context_summary or "低置信猜测内容" not in case.context_summary

        append_context_event("CG-2", "manual_note", "低置信猜测内容", test_db, status="confirmed")
        case = test_db.get(Case, "CG-2")
        assert "低置信猜测内容" in case.context_summary

    def test_confirm_pending(self, client, test_db):
        test_db.add(Case(id="CG-3", client_name="客户三"))
        test_db.commit()
        evt = append_context_event("CG-3", "manual_note", "待确认信息", test_db, status="pending")

        resp = client.post(f"/api/cases/CG-3/context-events/{evt.id}/confirm")
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"

        stored = test_db.get(CaseContextEvent, evt.id)
        assert stored.status == "confirmed"

    def test_confirm_idempotent(self, client, test_db):
        test_db.add(Case(id="CG-4", client_name="客户四"))
        test_db.commit()
        evt = append_context_event("CG-4", "manual_note", "已确认记录", test_db)

        first = client.post(f"/api/cases/CG-4/context-events/{evt.id}/confirm")
        assert first.status_code == 200
        assert first.json()["status"] == "confirmed"

        second = client.post(f"/api/cases/CG-4/context-events/{evt.id}/confirm")
        assert second.status_code == 200
        assert second.json()["status"] == "confirmed"

    def test_confirm_superseded_conflict(self, client, test_db):
        test_db.add(Case(id="CG-5", client_name="客户五"))
        test_db.commit()
        evt = append_context_event("CG-5", "manual_note", "已被撤销", test_db)
        evt.status = "superseded"
        test_db.commit()

        resp = client.post(f"/api/cases/CG-5/context-events/{evt.id}/confirm")
        assert resp.status_code == 409
        assert resp.json()["detail"] == "已撤销事件不可确认"

    def test_supersede_with_reason_and_replacement(self, client, test_db):
        test_db.add(Case(id="CG-6", client_name="客户六"))
        test_db.commit()
        evt1 = append_context_event("CG-6", "manual_note", "旧事实", test_db)
        evt2 = append_context_event("CG-6", "manual_note", "新事实", test_db)

        resp = client.post(
            f"/api/cases/CG-6/context-events/{evt1.id}/supersede",
            json={"reason": "金额更正", "replacement_event_id": evt2.id},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "superseded"
        assert body["supersede_reason"] == "金额更正"
        assert body["superseded_by"] == evt2.id

        stored = test_db.get(CaseContextEvent, evt1.id)
        assert stored.status == "superseded"
        assert stored.supersede_reason == "金额更正"
        assert stored.superseded_by == evt2.id

        again = client.post(
            f"/api/cases/CG-6/context-events/{evt1.id}/supersede",
            json={"reason": "再撤一次"},
        )
        assert again.status_code == 409
        assert again.json()["detail"] == "事件已撤销"

    def test_supersede_reason_required(self, client, test_db):
        test_db.add(Case(id="CG-9", client_name="客户九"))
        test_db.commit()
        evt = append_context_event("CG-9", "manual_note", "待撤记录", test_db)

        resp = client.post(
            f"/api/cases/CG-9/context-events/{evt.id}/supersede",
            json={},
        )
        assert resp.status_code == 422

    def test_unknown_event_or_wrong_case(self, client, test_db):
        test_db.add(Case(id="CG-7", client_name="客户七"))
        test_db.add(Case(id="CG-8", client_name="客户八"))
        test_db.commit()
        evt = append_context_event("CG-7", "manual_note", "仅属于 CG-7", test_db)

        missing = client.post("/api/cases/CG-7/context-events/999999/confirm")
        assert missing.status_code == 404

        wrong_case = client.post(f"/api/cases/CG-8/context-events/{evt.id}/confirm")
        assert wrong_case.status_code == 404