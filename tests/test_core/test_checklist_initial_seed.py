"""WO-74 首次清单种子测试：模板驱动、裁剪、regenerate 不碰 condition。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.checklist.initial_generator import generate_initial_checklist
from core.models.orm import Case, CaseChecklist
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


def _make_case(db, case_id, **profile):
    db.add(
        Case(
            id=case_id,
            client_name="首次种子",
            lender=profile.get("lender", "CBA"),
            employment_type=profile.get("employment_type", "PAYG"),
            residency=profile.get("residency", "PR"),
            purpose=profile.get("purpose", "Purchase"),
        )
    )
    db.commit()


def _initial_ids(db, case_id) -> list[str]:
    return [
        it.master_id
        for it in db.query(CaseChecklist)
        .filter(
            CaseChecklist.case_id == case_id,
            CaseChecklist.phase == "initial",
        )
        .all()
    ]


def test_seed_creates_initial_items(test_db):
    _make_case(test_db, "IS-1")
    rows = generate_initial_checklist("IS-1", test_db)
    assert len(rows) > 5
    assert all(r.phase == "initial" for r in rows)

    ids = _initial_ids(test_db, "IS-1")
    assert "driver_license" in ids
    assert "passport" in ids
    assert "ato_income_statement" in ids
    # PR 默认删 VISA；PAYG 默认删公司财报/税表/BAS
    assert "visa_grant" not in ids
    assert "accounting_financial_report" not in ids
    assert "payslip_2" in ids
    # 信息项 kind=info
    info = {it.master_id for it in rows if it.item_kind == "info"}
    assert info == {"employment_history", "living_history", "solicitor_info"}


def test_seed_trim_self_employed(test_db):
    _make_case(test_db, "IS-2", employment_type="SelfEmployed")
    generate_initial_checklist("IS-2", test_db)
    ids = _initial_ids(test_db, "IS-2")
    assert "payslip_2" not in ids
    assert "employment_letter" not in ids
    assert "accounting_financial_report" in ids


def test_seed_trim_refinance(test_db):
    _make_case(test_db, "IS-3", purpose="Refinance")
    generate_initial_checklist("IS-3", test_db)
    ids = _initial_ids(test_db, "IS-3")
    assert "contract_of_sale" not in ids
    assert "deposit_receipt" not in ids
    assert "payout_letter" in ids


def test_seed_replace_keeps_condition(test_db):
    _make_case(test_db, "IS-4")
    generate_initial_checklist("IS-4", test_db)
    test_db.add(
        CaseChecklist(
            case_id="IS-4",
            item_name="CBA 补件工资单",
            category="bank_specific",
            is_required=True,
            status="pending",
            phase="condition",
            source_ref="CBA OS 条件 #1",
        )
    )
    test_db.commit()
    before = len(_initial_ids(test_db, "IS-4"))

    generate_initial_checklist("IS-4", test_db, replace=True)
    after = len(_initial_ids(test_db, "IS-4"))
    cond = (
        test_db.query(CaseChecklist)
        .filter(
            CaseChecklist.case_id == "IS-4",
            CaseChecklist.phase == "condition",
        )
        .all()
    )
    assert len(cond) == 1
    assert cond[0].source_ref == "CBA OS 条件 #1"
    assert after == before


def test_seed_missing_case_raises(test_db):
    with pytest.raises(ValueError):
        generate_initial_checklist("IS-NONE", test_db)


def test_regenerate_endpoint_keeps_condition(client, test_db):
    _make_case(test_db, "IS-5")
    generate_initial_checklist("IS-5", test_db)
    test_db.add(
        CaseChecklist(
            case_id="IS-5",
            item_name="追加项",
            category="special",
            is_required=True,
            status="received",
            phase="condition",
            source_ref="x",
            received_file_ids=["file_x"],
        )
    )
    test_db.commit()

    r = client.post("/api/cases/IS-5/checklist/regenerate")
    assert r.status_code == 200
    bodies = r.json()
    assert len(bodies) > 5
    assert all(b["phase"] == "initial" for b in bodies)
    cond = (
        test_db.query(CaseChecklist)
        .filter(
            CaseChecklist.case_id == "IS-5",
            CaseChecklist.phase == "condition",
        )
        .all()
    )
    assert len(cond) == 1
    assert cond[0].item_name == "追加项"


def test_create_case_seeds_initial(client, test_db):
    r = client.post(
        "/api/cases/",
        json={
            "client_name": "种子测试",
            "source": "manual",
            "lender": "CBA",
            "loan_amount": 500000,
            "purpose": "Purchase",
            "employment_type": "PAYG",
            "residency": "PR",
        },
    )
    assert r.status_code == 200
    case_id = r.json()["id"]
    items = client.get(f"/api/cases/{case_id}/checklist").json()
    assert len(items) > 5
    assert all(i["phase"] == "initial" for i in items)
