"""tests/test_api/test_fact_find.py — Fact Find API 路由与清单联动测试 (WO-77)。

覆盖：
1. GET /api/cases/{case_id}/fact-find 返回全部 5 个 section 默认/已有数据；
2. PUT /api/cases/{case_id}/fact-find/{section} 结构化数据暂存（status=pending）；
3. PUT /api/cases/{case_id}/fact-find/{section} 非法 section 返回 422；
4. 案件不存在返回 404；
5. POST /api/cases/{case_id}/fact-find/{section}/confirm：
   - 标记 status=confirmed；
   - 写入 CaseContextEvent(source_type="fact_find")；
   - 自动将 CaseChecklist(phase="initial", item_kind="info", master_id=section) 联动置 received。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from core.models.orm import Case, CaseChecklist, CaseContextEvent, CaseFactFind
from server.deps import get_db
from server.main import app


def _client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    return TestClient(app)


def test_get_fact_find_all_default(test_db):
    """验证新案件获取 Fact Find 时默认返回 5 个标准 section。"""
    case = Case(id="case_20260825_ff_test1", client_name="Alice Chen", stage="gathering")
    test_db.add(case)
    test_db.commit()

    client = _client(test_db)
    res = client.get(f"/api/cases/{case.id}/fact-find")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["case_id"] == case.id
    assert len(data["sections"]) == 5
    assert "employment_history" in data["sections"]
    assert "living_history" in data["sections"]
    assert "solicitor_info" in data["sections"]
    assert "vehicle_asset" in data["sections"]
    assert "super_balance" in data["sections"]
    assert data["sections"]["employment_history"]["status"] == "pending"


def test_put_fact_find_section_success(test_db):
    """验证 PUT 更新 section 数据成功且 status=pending。"""
    case = Case(id="case_20260825_ff_test2", client_name="Bob Smith", stage="gathering")
    test_db.add(case)
    test_db.commit()

    client = _client(test_db)
    payload = {
        "data": [
            {
                "company": "Canva Pty Ltd",
                "position": "Tech Lead",
                "address": "110 Kippax St, Surry Hills NSW",
                "start_date": "2021-06",
                "end_date": "Current",
            }
        ]
    }
    res = client.put(f"/api/cases/{case.id}/fact-find/employment_history", json=payload)
    assert res.status_code == 200
    ret = res.json()
    assert ret["section"] == "employment_history"
    assert ret["status"] == "pending"
    assert len(ret["data"]) == 1
    assert ret["data"][0]["company"] == "Canva Pty Ltd"

    # 查库验证
    row = test_db.query(CaseFactFind).filter(
        CaseFactFind.case_id == case.id,
        CaseFactFind.section == "employment_history"
    ).first()
    assert row is not None
    assert row.status == "pending"
    assert row.data[0]["position"] == "Tech Lead"


def test_put_fact_find_invalid_section_422(test_db):
    """验证非法 section 返回 422 错误。"""
    case = Case(id="case_20260825_ff_test3", client_name="Carol White", stage="gathering")
    test_db.add(case)
    test_db.commit()

    client = _client(test_db)
    res = client.put(f"/api/cases/{case.id}/fact-find/invalid_custom_section", json={"data": {}})
    assert res.status_code == 422


def test_fact_find_missing_case_404(test_db):
    """验证不存在案件返回 404。"""
    client = _client(test_db)
    res = client.get("/api/cases/case_non_existent/fact-find")
    assert res.status_code == 404
    res2 = client.put("/api/cases/case_non_existent/fact-find/employment_history", json={"data": []})
    assert res2.status_code == 404


def test_confirm_fact_find_writes_event_and_links_checklist(test_db):
    """验证 confirm 端点：标记 confirmed + 写事件 + 联动清单 info 项置 received。"""
    case = Case(id="case_20260825_ff_test4", client_name="David Brown", stage="gathering")
    test_db.add(case)

    # 初始材料清单中的 info 项（WO-74 契约）
    chk_info = CaseChecklist(
        case_id=case.id,
        item_name="雇主推荐信与工作历史",
        category="employment",
        is_required=True,
        status="pending",
        phase="initial",
        item_kind="info",
        master_id="employment_history",
    )
    test_db.add(chk_info)
    test_db.commit()

    client = _client(test_db)
    # 1. 暂存
    client.put(
        f"/api/cases/{case.id}/fact-find/employment_history",
        json={"data": [{"company": "Google Australia", "position": "Staff Engineer"}]},
    )

    # 2. 确认
    res = client.post(f"/api/cases/{case.id}/fact-find/employment_history/confirm")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["status"] == "confirmed"
    assert data["checklist_updated"] is True
    assert data["event_id"] is not None

    # 3. 查库验证 CaseFactFind
    ff_row = test_db.query(CaseFactFind).filter(
        CaseFactFind.case_id == case.id,
        CaseFactFind.section == "employment_history",
    ).first()
    assert ff_row.status == "confirmed"

    # 4. 查库验证 CaseContextEvent
    evt = test_db.query(CaseContextEvent).filter(CaseContextEvent.id == data["event_id"]).first()
    assert evt is not None
    assert evt.source_type == "fact_find"
    assert evt.status == "confirmed"
    assert "Google Australia" in evt.content

    # 5. 查库验证清单联动
    test_db.refresh(chk_info)
    assert chk_info.status == "received"
