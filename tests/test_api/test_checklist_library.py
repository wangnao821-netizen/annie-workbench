"""tests/test_api/test_checklist_library.py — 清单总库接口测试 (WO-68)。

测试 GET /api/checklist/library 返回合并库、custom 去重覆盖与 use_count 排序。
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from core.models.db import get_sa_session
from core.models.orm import ChecklistLibraryCustom
from server.main import app


@pytest.fixture
def db_session():
    db = next(get_sa_session())
    yield db
    db.close()


def test_get_checklist_library_basic(db_session: Session):
    client = TestClient(app)
    resp = client.get("/api/checklist/library")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    items = data["items"]
    assert len(items) > 0

    # 验证 master 前缀与必要字段
    first = items[0]
    assert "id" in first
    assert "name_zh" in first
    assert "category" in first


def test_get_checklist_library_with_custom_override(db_session: Session):
    uid = uuid4().hex[:6]
    # 添加一个自定义高频使用项
    custom_item = ChecklistLibraryCustom(
        id=f"cust_{uid}",
        name_zh=f"高频自定义流水_{uid}",
        name_en="Custom Statement",
        category="liability",
        use_count=99,
    )
    db_session.add(custom_item)
    db_session.commit()

    try:
        client = TestClient(app)
        resp = client.get("/api/checklist/library")
        assert resp.status_code == 200
        items = resp.json()["items"]

        # 由于 use_count=99，它应排在最前列
        top_item = items[0]
        assert top_item["name_zh"] == f"高频自定义流水_{uid}"
        assert top_item["is_custom"] is True
        assert top_item["use_count"] == 99
    finally:
        db_session.query(ChecklistLibraryCustom).filter(ChecklistLibraryCustom.id == f"cust_{uid}").delete()
        db_session.commit()
