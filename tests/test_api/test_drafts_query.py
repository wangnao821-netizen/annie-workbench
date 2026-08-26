"""tests/test_api/test_drafts_query.py — 草稿按 draft_id 直接查询接口测试 (WO-79)。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case, EmailDraft
from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_db):
    def _override():
        yield test_db

    app.dependency_overrides[get_db] = _override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_draft_by_id_success(test_db, client):
    """验证按 draft_id 可成功获取独立草稿内容（无需依赖 action_id）。"""
    case = Case(
        id="case_wo79_draft_test",
        client_name="Emma Watson",
        lender="CBA",
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    draft = EmailDraft(
        case_id=case.id,
        draft_type="preliminary",
        subject="EVERSTONES Preliminary Assessment - Emma Watson",
        body="Dear Emma, please provide ID and Payslips.",
        to_email="emma@example.com",
        status="draft",
    )
    test_db.add(draft)
    test_db.commit()
    test_db.refresh(draft)

    resp = client.get(f"/api/drafts/by-id/{draft.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["subject"] == "EVERSTONES Preliminary Assessment - Emma Watson"
    assert data["body"] == "Dear Emma, please provide ID and Payslips."
    assert data["status"] == "draft"


def test_get_draft_by_id_not_found_404(client):
    """验证不存在的 draft_id 返回 404。"""
    resp = client.get("/api/drafts/by-id/999999")
    assert resp.status_code == 404
