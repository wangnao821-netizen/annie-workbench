"""Core 测试专属 fixtures。"""

import pytest
from core.models.orm import Case


@pytest.fixture
def sample_case(test_db):
    """创建一个样本案件（脱敏数据）。"""
    case = Case(
        id="CASE-20240115001",
        client_name="PERSON_1",
        client_id="CLI-AABB1122",
        client_email="test@example.com",
        lender="CBA",
        loan_amount=850000,
        stage="收集资料",
        broker_name="Brandon",
    )
    test_db.add(case)
    test_db.commit()
    return case
