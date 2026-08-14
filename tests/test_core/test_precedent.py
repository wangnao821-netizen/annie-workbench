"""tests/test_core/test_precedent.py — 决策先例检索 + case_chat 注入（WO-37）"""

from __future__ import annotations

from datetime import datetime

import pytest

from core.ai.context_builder import assemble_context
from core.chat.context import build_chat_layers
from core.knowledge.precedent import build_precedent_block, find_precedents
from core.models.orm import Action, Case


@pytest.fixture(autouse=True)
def _precedent_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")


def _mk_case(db, cid: str, lender=None, purpose=None, lvr=None) -> Case:
    case = Case(id=cid, client_name="PERSON_1", lender=lender, purpose=purpose, lvr=lvr)
    db.add(case)
    db.commit()
    return case


def _mk_action(
    db,
    cid: str,
    title: str = "决策",
    status: str = "completed",
    created_at: str = "2026-01-01T00:00:00",
    ai_suggestion: str | None = None,
    vera_note: str | None = None,
    boss_decision: str | None = None,
) -> Action:
    action = Action(
        case_id=cid,
        type="classify",
        title=title,
        status=status,
        ai_suggestion=ai_suggestion,
        vera_note=vera_note,
        boss_decision=boss_decision,
        created_at=datetime.fromisoformat(created_at),
    )
    db.add(action)
    db.commit()
    return action


def test_same_case_precedent_found(test_db):
    """同 case 完成 Action → 返回且含 action_id。"""
    _mk_case(test_db, "C1")
    a1 = _mk_action(test_db, "C1", title="催件")
    res = find_precedents("C1", test_db)
    assert len(res) == 1
    assert res[0]["action_id"] == a1.id
    assert res[0]["case_id"] == "C1"


def test_same_lender_precedent_found(test_db):
    """其他 case 同 lender 完成 Action → 返回；不同 lender 不返回。"""
    _mk_case(test_db, "C1", lender="CBA", purpose="PP")
    _mk_case(test_db, "C2", lender="CBA", purpose="RR")
    a2 = _mk_action(test_db, "C2", title="补件")
    _mk_case(test_db, "C3", lender="NAB", purpose="ZZ")
    _mk_action(test_db, "C3", title="拒签")
    res = find_precedents("C1", test_db)
    ids = [r["action_id"] for r in res]
    assert a2.id in ids
    assert all(r["case_id"] != "C3" for r in res)


def test_lvr_close_precedent_found(test_db):
    """lvr 差 4 → 返回；差 8 → 不返回。"""
    _mk_case(test_db, "C1", lender="A1", purpose="P1", lvr=70.0)
    _mk_case(test_db, "C2", lender="A2", purpose="P2", lvr=66.0)
    a_close = _mk_action(test_db, "C2", title="接近")
    _mk_case(test_db, "C3", lender="A3", purpose="P3", lvr=62.0)
    _mk_action(test_db, "C3", title="远离")
    res = find_precedents("C1", test_db)
    ids = [r["action_id"] for r in res]
    assert a_close.id in ids
    assert all(r["case_id"] != "C3" for r in res)


def test_pending_action_not_included(test_db):
    """status=pending 的 Action 不返回。"""
    _mk_case(test_db, "C1")
    _mk_action(test_db, "C1", title="待办", status="pending")
    res = find_precedents("C1", test_db)
    assert res == []


def test_no_precedent_returns_empty(test_db):
    """无任何完成 Action → []。"""
    _mk_case(test_db, "C1")
    _mk_action(test_db, "C1", title="待办", status="pending")
    _mk_case(test_db, "C2", lender="CBA", purpose="PP")
    _mk_action(test_db, "C2", title="完成", status="completed")
    res = find_precedents("C1", test_db)
    assert res == []


def test_limit_respected(test_db):
    """6 条先例 → 只返回 5 条且倒序。"""
    _mk_case(test_db, "C1")
    for i in range(6):
        _mk_action(
            test_db,
            "C1",
            title=f"决策{i}",
            created_at=f"2026-01-{i + 1:02d}T00:00:00",
        )
    res = find_precedents("C1", test_db)
    assert len(res) == 5
    titles = [r["title"] for r in res]
    assert titles == ["决策5", "决策4", "决策3", "决策2", "决策1"]


def test_dedup_same_action(test_db):
    """同客户与同类场景命中同一 Action → 只出现一次。"""
    _mk_case(test_db, "C1", lender="CBA", purpose="PP")
    a1 = _mk_action(test_db, "C1", title="同案")
    _mk_case(test_db, "C2", lender="CBA", purpose="RR")
    a2 = _mk_action(test_db, "C2", title="同lender")
    res = find_precedents("C1", test_db)
    ids = [r["action_id"] for r in res]
    assert len(ids) == len(set(ids))  # action_id 去重，无重复
    assert ids.count(a1.id) == 1
    assert ids.count(a2.id) == 1


def test_build_block_empty_and_content(test_db):
    """空列表 → ""；有先例 → 含[同类先例]文本结构。"""
    assert build_precedent_block([]) == ""
    _mk_case(test_db, "C1", lender="CBA", purpose="买房")
    _mk_action(test_db, "C1", title="催件", ai_suggestion="加急", vera_note="已解决")
    res = find_precedents("C1", test_db)
    block = build_precedent_block(res)
    assert "[同类先例]" in block
    assert "决策：" in block
    assert "结果：" in block


def test_injected_into_case_chat_context(test_db):
    """build_chat_layers 的 team 层在 case_chat 时含先例文本。"""
    _mk_case(test_db, "C1", lender="CBA", purpose="买房")
    _mk_action(test_db, "C1", title="催件")
    layers = build_chat_layers("C1", "你好", "internal", test_db)
    team = next(l["text"] for l in layers if l["layer"] == "team")
    assert "【决策先例】" in team
    assert "[同类先例]" in team


def test_not_injected_other_task_types(test_db):
    """email_draft 任务类型 team 层不含决策先例。"""
    _mk_case(test_db, "C1", lender="CBA", purpose="买房")
    _mk_action(test_db, "C1", title="催件")
    ctx = assemble_context("C1", "email_draft", test_db)
    assert "决策先例" not in ctx.team_experience
    assert "[同类先例]" not in ctx.team_experience