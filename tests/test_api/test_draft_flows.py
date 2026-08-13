"""tests/test_api/test_draft_flows.py — 共创 dialog 流程 + 版本链 + CardSchema（WO-27）"""

import pytest

import core.config
from core.agents import pai
from core.agents.draft_email import run_draft_email
from core.agents.flows import load_flows, match_flow
from core.agents.runner import run_flow
from core.models.orm import Case, CaseChatMessage, CaseContextEvent
from server.api.schemas import DraftCardPayload

FAKE_DRAFT = {"subject": "Loan Progress Update", "body": "Dear Sir/Madam, we are following up..."}


@pytest.fixture(autouse=True)
def _draft_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    core.config._cached_config = None
    monkeypatch.setattr(pai, "run_flow_with_pai", lambda *a, **k: None)
    monkeypatch.setattr("core.agents.draft_email._gen_draft",
                        lambda case_id, intent, recipient, previous, db: dict(FAKE_DRAFT))


def _case(db, cid: str) -> Case:
    c = Case(id=cid, client_name=f"Case {cid}")
    db.add(c)
    db.commit()
    return c


def test_chat_branch_columns_exist():
    cols = CaseChatMessage.__table__.columns.keys()
    assert "parent_message_id" in cols and "branch_label" in cols


def test_followup_trigger():
    assert match_flow("帮我写跟进邮件") is not None
    assert match_flow("帮我写跟进邮件")["key"] == "followup"


def test_chaser_trigger():
    assert match_flow("催一下银行") is not None
    assert match_flow("催一下银行")["key"] == "chaser"


def test_os_reply_trigger():
    assert match_flow("OS 回复一下") is not None
    assert match_flow("OS 回复一下")["key"] == "os_reply"


def test_draft_v1_creates_version_message(test_db):
    _case(test_db, "c_v1")
    res = run_flow(load_flows()["followup"], "c_v1", {}, test_db)
    payload = res["tool_cards"][0]["payload"]
    assert res["presentation"] == "dialog"
    assert payload["card_type"] == "draft_email"
    assert payload["status"] == "draft"
    assert payload["result"]["versions"][0]["version"] == "V1"
    assert payload["result"]["versions"][0]["subject"] == FAKE_DRAFT["subject"]
    rows = test_db.query(CaseChatMessage).filter(CaseChatMessage.case_id == "c_v1").all()
    assert len(rows) == 1
    assert rows[0].branch_label == "main"


def test_version_chain_v2(test_db):
    _case(test_db, "c_v2")
    flow = load_flows()["followup"]
    run_flow(flow, "c_v2", {}, test_db)
    m1 = test_db.query(CaseChatMessage).filter(CaseChatMessage.case_id == "c_v2").first()
    second = run_flow(flow, "c_v2", {"action": "version", "parent_message_id": m1.id}, test_db)
    assert second["tool_cards"][0]["payload"]["result"]["versions"][0]["version"] == "V2"
    m2 = test_db.query(CaseChatMessage).filter(CaseChatMessage.case_id == "c_v2").order_by(CaseChatMessage.id.desc()).first()
    assert m2.parent_message_id == m1.id
    assert m2.branch_label == "main"


def test_branch_label(test_db):
    _case(test_db, "c_br")
    res = run_flow(load_flows()["followup"], "c_br", {"branch_label": "B"}, test_db)
    payload = res["tool_cards"][0]["payload"]
    assert payload["state"]["branch_label"] == "B"
    row = test_db.query(CaseChatMessage).filter(CaseChatMessage.case_id == "c_br").first()
    assert row.branch_label == "B"


def test_confirm_produces_draftcard_and_distills(test_db):
    _case(test_db, "c_cf")
    flow = load_flows()["followup"]
    run_flow(flow, "c_cf", {}, test_db)
    m = test_db.query(CaseChatMessage).filter(CaseChatMessage.case_id == "c_cf").first()
    res = run_flow(flow, "c_cf", {"action": "confirm", "parent_message_id": m.id}, test_db)
    payload = res["tool_cards"][0]["payload"]
    assert payload["action"] == "confirm"
    assert payload["status"] == "confirmed_draft"
    events = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "c_cf").all()
    assert any(e.source_type == "flow:draft_email" for e in events)


def test_unconfirmed_no_distill(test_db):
    _case(test_db, "c_nod")
    run_flow(load_flows()["chaser"], "c_nod", {}, test_db)
    events = test_db.query(CaseContextEvent).filter(CaseContextEvent.case_id == "c_nod").all()
    assert len(events) == 0  # 未确认：只留对话原文，不写蒸馏事件


def test_card_payload_schema(test_db):
    _case(test_db, "c_sch")
    payload = run_flow(load_flows()["followup"], "c_sch", {}, test_db)["tool_cards"][0]["payload"]
    assert payload["schema_version"] == 1
    assert payload["card_type"] == "draft_email"
    assert payload["status"] == "draft"
    parsed = DraftCardPayload(**payload)
    assert parsed.schema_version == 1
    assert parsed.result["versions"][0]["subject"] == FAKE_DRAFT["subject"]


def test_no_case_blocked(test_db):
    res = run_draft_email(None, {"intent": "followup"}, test_db)
    assert res["status"] == "blocked"
    assert "关联案件" in res["reason"]