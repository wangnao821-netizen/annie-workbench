"""WO-43 清单总项库沉淀 + 合并加载 测试。

覆盖：
- POST /api/cases/{id}/checklist 新增项 → 沉淀 checklist_library_custom（custom_{uuid8}、use_count）
- 同名同分类幂等：复用 id、use_count+1
- 非法 category / 空白 name_zh → 422
- _load_master(db) 合并自定义项；_load_master(None) 仅 config
- pick_checklist 候选包含自定义项（use_ai=False 纯规则）
"""

import pytest
from fastapi.testclient import TestClient

from core.checklist.master_picker import _load_master, pick_checklist
from core.models.orm import Case, ChecklistLibraryCustom
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


def _add(client, case_id="C-1", **overrides):
    payload = {"name_zh": "自定义材料", "category": "special"}
    payload.update(overrides)
    return client.post(f"/api/cases/{case_id}/checklist", json=payload)


class TestCustomLibrary:
    """新增项落库 + 幂等（验收 1/2/3/6）。"""

    def test_upsert_new_custom(self, client, test_db):
        test_db.add(Case(id="C-1", client_name="张三"))
        test_db.commit()

        resp = _add(client)
        assert resp.status_code == 201

        rows = test_db.query(ChecklistLibraryCustom).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.id.startswith("custom_")
        assert row.name_zh == "自定义材料"
        assert row.category == "special"
        assert row.use_count == 1
        assert row.source_case_id == "C-1"

    def test_upsert_same_name_same_category(self, client, test_db):
        test_db.add(Case(id="C-2", client_name="李四"))
        test_db.commit()

        assert _add(client, "C-2").status_code == 201
        assert _add(client, "C-2").status_code == 201

        rows = test_db.query(ChecklistLibraryCustom).all()
        assert len(rows) == 1, "同名同分类应复用已有 custom id，不新增行"
        assert rows[0].use_count == 2

    def test_category_validation(self, client, test_db):
        test_db.add(Case(id="C-3", client_name="王五"))
        test_db.commit()

        resp = _add(client, "C-3", category="bogus")
        assert resp.status_code == 422

    def test_blank_name_422(self, client, test_db):
        test_db.add(Case(id="C-4", client_name="赵六"))
        test_db.commit()

        resp = _add(client, "C-4", name_zh="   ")
        assert resp.status_code == 422


class TestMasterMerge:
    """总项库合并加载（验收 4/5）。"""

    def test_master_merge_loads_custom(self, test_db):
        test_db.add(
            ChecklistLibraryCustom(
                id="custom_merge1",
                name_zh="合并测试项",
                category="special",
                applicable_when={"all": True},
                use_count=1,
            )
        )
        test_db.commit()

        merged = _load_master(test_db)
        assert any(m["id"] == "custom_merge1" and m["name_zh"] == "合并测试项" for m in merged)

        config_only = _load_master(None)
        assert not any(m["id"] == "custom_merge1" for m in config_only), "无 db 时应仅加载 config"

    def test_pick_includes_custom(self, test_db):
        test_db.add(
            ChecklistLibraryCustom(
                id="custom_pick1",
                name_zh="预选自定义项",
                category="special",
                applicable_when={"all": True},
                use_count=1,
            )
        )
        test_db.commit()

        result = pick_checklist(
            {"lender": "CBA", "employment_type": "PAYG", "residency": "PR", "purpose": "Purchase"},
            test_db,
            use_ai=False,
        )
        ids = {p["id"] for p in result}
        assert "custom_pick1" in ids, "自定义项 applicable_when=all 应进入纯规则预选候选"
