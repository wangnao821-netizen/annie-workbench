"""tests/test_api/test_checklist_eight_sections.py — 首次材料 8 大板块归类与完整性测试 (WO-78)。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.checklist.initial_generator import generate_initial_checklist
from core.models.orm import Case, CaseChecklist
from server.deps import get_db
from server.main import app

VALID_SECTIONS = {
    "id",
    "income",
    "employment_history",
    "living_expense",
    "liability",
    "living_history",
    "asset",
    "solicitor",
    "other",
}


@pytest.fixture
def client(test_db):
    def _override():
        yield test_db

    app.dependency_overrides[get_db] = _override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_initial_checklist_all_items_have_valid_sections(test_db, client):
    """验证生成首次材料后，GET /checklist 每一项都拥有合法的 8 大板块或 other section。"""
    case = Case(
        id="case_wo78_sections_test",
        client_name="Jessica Taylor",
        lender="CBA",
        employment_type="PAYG",
        residency="PR",
        purpose="Purchase",
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    rows = generate_initial_checklist(case.id, test_db)
    assert len(rows) > 0

    resp = client.get(f"/api/cases/{case.id}/checklist")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == len(rows)

    sections_found = set()
    for item in data:
        sec = item.get("section")
        assert sec in VALID_SECTIONS, f"item {item['item_name']} has invalid section {sec}"
        sections_found.add(sec)

    # Standard sections like id, income, living_expense, liability, asset, solicitor should be present
    assert {"id", "income", "living_expense", "liability", "asset"} <= sections_found


def test_legacy_or_custom_items_fallback_to_valid_section(test_db, client):
    """验证未绑定 template 的历史/自定义项不会丢失 section，能智能归入 8 大类或 other。"""
    case = Case(
        id="case_wo78_legacy_test",
        client_name="Michael Brown",
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    # Add custom items with no master_id
    items = [
        CaseChecklist(
            case_id=case.id,
            item_name="自定义护照公证",
            category="identity",
            phase="initial",
            is_required=True,
        ),
        CaseChecklist(
            case_id=case.id,
            item_name="额外兼职工资流水",
            category="income_payg",
            phase="initial",
            is_required=False,
        ),
        CaseChecklist(
            case_id=case.id,
            item_name="神秘特殊材料",
            category="other",
            phase="initial",
            is_required=False,
        ),
    ]
    test_db.add_all(items)
    test_db.commit()

    resp = client.get(f"/api/cases/{case.id}/checklist")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3

    sec_map = {d["item_name"]: d["section"] for d in data}
    assert sec_map["自定义护照公证"] == "id"
    assert sec_map["额外兼职工资流水"] == "income"
    assert sec_map["神秘特殊材料"] == "other"


def test_adjust_initial_checklist_atomic_replace(test_db, client):
    """验证 PUT /cases/{id}/checklist/initial 能原子级精确重设清单项，杜绝重复叠加。"""
    case = Case(
        id="case_wo79_adjust_test",
        client_name="David Miller",
        lender="ORDE",
        employment_type="PAYG",
        residency="PR",
        purpose="Purchase",
        stage="gathering",
    )
    test_db.add(case)
    test_db.commit()

    # 初始 10 项
    generate_initial_checklist(case.id, test_db)

    # Vera 选定了具体的 3 项: passport, driver_license, payslip_2
    selected = ["passport", "driver_license", "payslip_2"]
    resp = client.put(
        f"/api/cases/{case.id}/checklist/initial",
        json={"selected_master_ids": selected},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    master_ids = [it["master_id"] for it in data]
    assert sorted(master_ids) == sorted(selected)
