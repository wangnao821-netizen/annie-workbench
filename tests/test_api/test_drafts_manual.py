"""WO-46 手动建草稿测试：POST /api/drafts 落库 + GET 可见 + 空白 422 + case 404。

红线：只出草稿（status=draft，draft_type=manual 作为 source 判别），绝不自动发送。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case, EmailDraft
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


@pytest.fixture(autouse=True)
def _draft_env(monkeypatch, tmp_path):
    client_root = tmp_path / "cf"
    client_root.mkdir()
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(client_root))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-fake-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key")
    return client_root


@pytest.fixture
def case(test_db):
    c = Case(id="CASE-WO46-001", client_name="张三", broker_name="Brandon", stage="收集资料")
    test_db.add(c)
    test_db.commit()
    return c


class TestCreateManualDraft:
    def test_create_persists_and_listable(self, client, case, test_db):
        resp = client.post("/api/drafts/", json={
            "case_id": case.id,
            "subject": "补充材料请求",
            "body": "请提供最新的工资单。",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["case_id"] == case.id
        assert data["subject"] == "补充材料请求"
        assert data["status"] == "draft"

        row = test_db.query(EmailDraft).filter(EmailDraft.case_id == case.id).first()
        assert row is not None
        assert row.draft_type == "manual"       # source=manual 落库判别
        assert row.status == "draft"
        assert row.source_action_id is None
        assert row.subject == "补充材料请求" and row.body == "请提供最新的工资单。"

        listed = client.get("/api/drafts/", params={"case_id": case.id})
        assert listed.status_code == 200
        items = listed.json()
        assert any(i["id"] == data["id"] and i["status"] == "draft" for i in items)

    def test_create_no_track_defaults_ok(self, client, case, test_db):
        resp = client.post("/api/drafts/", json={
            "case_id": case.id, "subject": "跟进", "body": "催一下银行。",
        })
        assert resp.status_code == 200
        row = test_db.query(EmailDraft).filter(EmailDraft.case_id == case.id).first()
        assert row is not None and row.draft_type == "manual"

    def test_create_track_valid_ok(self, client, case):
        for track in ("internal", "external"):
            resp = client.post("/api/drafts/", json={
                "case_id": case.id, "subject": "s", "body": "b", "track": track,
            })
            assert resp.status_code == 200

    def test_create_track_invalid_422(self, client, case):
        resp = client.post("/api/drafts/", json={
            "case_id": case.id, "subject": "s", "body": "b", "track": "bogus",
        })
        assert resp.status_code == 422

    def test_blank_subject_or_body_422(self, client, case):
        for payload in (
            {"case_id": case.id, "subject": "", "body": "b"},
            {"case_id": case.id, "subject": "   ", "body": "b"},
            {"case_id": case.id, "subject": "s", "body": ""},
            {"case_id": case.id, "subject": "s", "body": " \t "},
        ):
            resp = client.post("/api/drafts/", json=payload)
            assert resp.status_code == 422

    def test_case_not_found_404(self, client):
        resp = client.post("/api/drafts/", json={
            "case_id": "CASE-NOPE", "subject": "s", "body": "b",
        })
        assert resp.status_code == 404
        assert "不存在" in resp.json()["detail"]


class TestDraftByIdEndpoints:
    def test_get_and_confirm_draft_by_id(self, client, case):
        # 1. 创建手动草稿
        create_resp = client.post("/api/drafts/", json={
            "case_id": case.id,
            "subject": "手动草稿测试",
            "body": "请查看附件材料。",
        })
        assert create_resp.status_code == 200
        draft_id = create_resp.json()["id"]

        # 2. 按 draft_id 获取详情
        get_resp = client.get(f"/api/drafts/by-id/{draft_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["id"] == draft_id
        assert data["subject"] == "手动草稿测试"
        assert data["status"] == "draft"

        # 3. 按 draft_id 确认批准
        confirm_resp = client.post(f"/api/drafts/by-id/{draft_id}/confirm")
        assert confirm_resp.status_code == 200
        confirm_data = confirm_resp.json()
        assert confirm_data["status"] == "approved"

        # 4. 获取版本历史
        ver_resp = client.get(f"/api/drafts/by-id/{draft_id}/versions")
        assert ver_resp.status_code == 200
        assert len(ver_resp.json()) >= 1
