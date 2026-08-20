"""WO-66 阶段手动调整端点测试 — PATCH /api/cases/{case_id}/stage。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.models.orm import Case, CaseContextEvent, CaseMilestone
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
def _api_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")


def _add_case(db, case_id: str, stage: str = "收集资料") -> None:
    db.add(Case(id=case_id, client_name="阶段测试客户", lender="CBA", stage=stage))
    db.commit()


def test_stage_update_persists_event_and_milestones(client, test_db):
    _add_case(test_db, "CASE-STAGE-1", "收集资料")
    resp = client.patch("/api/cases/CASE-STAGE-1/stage", json={"stage": "已递交(等银行)"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["stage_key"] == "submitted"
    assert body["stage"] == "已递交(等银行)"

    case = test_db.query(Case).filter(Case.id == "CASE-STAGE-1").first()
    assert case.stage == "已递交(等银行)"

    evt = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "CASE-STAGE-1",
            CaseContextEvent.source_type == "flow:stage_manual",
        )
        .first()
    )
    assert evt is not None
    assert "已递交(等银行)" in evt.content

    # 里程碑联动：目标及之前 completed，之后 pending
    milestones = test_db.query(CaseMilestone).filter(CaseMilestone.case_id == "CASE-STAGE-1").all()
    assert len(milestones) == 9
    completed = {m.milestone_name for m in milestones if m.status == "completed"}
    assert "submitted" in completed
    assert "os_requested" not in completed


def test_stage_update_accepts_english_key(client, test_db):
    _add_case(test_db, "CASE-STAGE-2", "收集资料")
    resp = client.patch("/api/cases/CASE-STAGE-2/stage", json={"stage": "approved"})
    assert resp.status_code == 200
    assert resp.json()["stage_key"] == "approved"
    assert resp.json()["stage"] == "已批准"


def test_invalid_stage_422(client, test_db):
    _add_case(test_db, "CASE-STAGE-3")
    resp = client.patch("/api/cases/CASE-STAGE-3/stage", json={"stage": "不存在的阶段"})
    assert resp.status_code == 422


def test_terminal_stage_blocked_409(client, test_db):
    _add_case(test_db, "CASE-STAGE-4", "已结算")
    resp = client.patch("/api/cases/CASE-STAGE-4/stage", json={"stage": "已递交(等银行)"})
    assert resp.status_code == 409
    # 终态案件 stage 未被改动
    case = test_db.query(Case).filter(Case.id == "CASE-STAGE-4").first()
    assert case.stage == "已结算"


def test_case_not_found_404(client):
    resp = client.patch("/api/cases/CASE-NOPE/stage", json={"stage": "submitted"})
    assert resp.status_code == 404


def test_idempotent_same_stage_no_duplicate_event(client, test_db):
    _add_case(test_db, "CASE-STAGE-5", "已递交(等银行)")
    resp = client.patch("/api/cases/CASE-STAGE-5/stage", json={"stage": "已递交(等银行)"})
    assert resp.status_code == 200
    n_events = (
        test_db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == "CASE-STAGE-5",
            CaseContextEvent.source_type == "flow:stage_manual",
        )
        .count()
    )
    assert n_events == 0
