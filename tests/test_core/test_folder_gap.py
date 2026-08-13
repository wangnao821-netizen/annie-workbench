"""tests/test_core/test_folder_gap.py — WO-33 主动预判缺口分析测试用例（≥8 用例）。"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

import core.config
from core.agents.flows import load_flows, match_flow
from core.agents.runner import run_flow
from core.case_folder.gap_analysis import analyze_gaps, scan_and_analyze_gaps
from core.models.orm import Case, CaseChecklist


@pytest.fixture(autouse=True)
def _gap_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    core.config._cached_config = None


@pytest.fixture
def test_case(test_db: Session) -> Case:
    c = Case(
        id="case_gap_test_01",
        client_name="张三",
        folder_path="Client_ZhangSan",
        lender="CBA",
        employment_type="PAYG",
        residency="PR",
        purpose="Purchase",
    )
    test_db.add(c)
    test_db.commit()
    return c


def test_gap_missing_materials(test_db: Session, test_case: Case):
    """1. 缺材料检测：期望项未收 → missing 列表。"""
    res = analyze_gaps(test_case, test_db)
    assert res["status"] == "success"
    assert isinstance(res["missing"], list)
    assert len(res["missing"]) > 0


def test_gap_received_materials_not_missing(test_db: Session, test_case: Case):
    """2. 已收材料不报缺口。"""
    item = CaseChecklist(
        case_id=test_case.id,
        item_name="工资单",
        category="Income",
        master_id="payslip",
        status="received",
    )
    test_db.add(item)
    test_db.commit()

    res = analyze_gaps(test_case, test_db)
    assert res["status"] == "success"
    missing_mids = {m["master_id"] for m in res["missing"]}
    matched_mids = {m["master_id"] for m in res["matched"]}
    assert "payslip" not in missing_mids
    assert "payslip" in matched_mids


def test_gap_no_side_effects(test_db: Session, test_case: Case):
    """3. 建议为草稿/只读：调用后清单状态不变（无副作用断言）。"""
    item1 = CaseChecklist(case_id=test_case.id, item_name="项A", category="Identity", master_id="id_doc", status="pending")
    item2 = CaseChecklist(case_id=test_case.id, item_name="项B", category="Income", master_id="payslip", status="received")
    test_db.add_all([item1, item2])
    test_db.commit()

    before_states = {(c.id, c.status) for c in test_db.query(CaseChecklist).filter(CaseChecklist.case_id == test_case.id).all()}

    res = analyze_gaps(test_case, test_db)
    assert res["status"] == "success"

    flow = load_flows().get("gap_analysis")
    assert flow is not None
    flow_res = run_flow(flow, test_case.id, {}, test_db)
    assert flow_res is not None

    after_states = {(c.id, c.status) for c in test_db.query(CaseChecklist).filter(CaseChecklist.case_id == test_case.id).all()}
    assert before_states == after_states


def test_gap_no_folder_path_skipped(test_db: Session):
    """4. 无 folder_path 案件跳过。"""
    case_no_folder = Case(id="case_no_folder", client_name="李四", folder_path=None)
    test_db.add(case_no_folder)
    test_db.commit()

    res = analyze_gaps(case_no_folder, test_db)
    assert res["status"] == "skipped"
    assert res["missing"] == []
    assert "未关联" in res["summary"]


def test_gap_auto_gap_switch_disabled(test_db: Session):
    """5. 开关关闭 → 不触发。"""
    results = scan_and_analyze_gaps(test_db)
    assert results == []


def test_gap_declaration_check_integration(test_db: Session, test_case: Case, monkeypatch: pytest.MonkeyPatch):
    """6. 申报一致性提示复用（monkeypatch declaration_check 返回 findings → suggestions 含提示）。"""
    mock_findings = [
        {"item": "income", "evidence": "月收入差异>20%", "level": "warning", "suggestion": "确认申报口径"}
    ]
    monkeypatch.setattr(
        "core.agents.declaration_check.run_declaration_check",
        lambda case_id, files, folder, db: {"status": "warning", "findings": mock_findings, "summary": "预警"},
    )

    res = analyze_gaps(test_case, test_db)
    assert res["status"] == "success"
    mismatch_suggs = [s for s in res["suggestions"] if s.get("type") == "declaration_mismatch"]
    assert len(mismatch_suggs) == 1
    assert "income" in mismatch_suggs[0]["title"]


def test_gap_flow_triggers():
    """7. 三触发语"看看还缺什么材料"等 → gap_analysis 命中。"""
    triggers = ["看看还缺什么材料", "材料缺口有哪些", "进行主动预判", "gap analysis scan"]
    for trig in triggers:
        flow = match_flow(trig)
        assert flow is not None, f"Trigger failed for text: {trig}"
        assert flow.get("key") == "gap_analysis"


def test_gap_wo26_contract(test_db: Session, test_case: Case):
    """8. 返回 WO-26 契约（result_card + suggestions）。"""
    flow = load_flows().get("gap_analysis")
    assert flow is not None

    res = run_flow(flow, test_case.id, {}, test_db)
    assert res["presentation"] == "result_card"
    assert len(res["tool_cards"]) == 1
    card = res["tool_cards"][0]
    assert card["type"] == "flow_gap_analysis"
    assert card["presentation"] == "result_card"
    payload = card["payload"]
    assert "missing" in payload
    assert "matched" in payload
    assert "suggestions" in payload
    assert "summary" in payload
