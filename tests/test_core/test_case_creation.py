"""案件创建 + client_id 测试 — 钉住 CLI- 前缀和复用逻辑。

覆盖：
1. generate_or_match_client_id 前缀是 CLI-
2. 格式为 CLI-{8位十六进制}
3. 精确匹配：同名+同邮箱 → 复用
4. 模糊匹配：仅同名 → name_only
5. 全新客户 → new
6. create_case_from_source 使用 CLI- 格式
"""

import re

import pytest
from core.case_creation import (
    create_case_from_source,
    generate_case_id,
    generate_or_match_client_id,
)
from core.models.orm import Case


class TestGenerateCaseId:
    """案件 ID 生成。"""

    def test_format(self):
        """格式为 CASE-{8位十六进制大写}。"""
        cid = generate_case_id()
        assert cid.startswith("CASE-"), f"Expected CASE- prefix, got {cid}"
        hex_part = cid.split("-", 1)[1]
        assert re.match(r"^[0-9A-F]{8}$", hex_part), (
            f"Expected 8 hex chars, got {hex_part}"
        )

    def test_uniqueness(self):
        """连续生成不重复。"""
        ids = {generate_case_id() for _ in range(50)}
        assert len(ids) == 50


class TestGenerateOrMatchClientId:
    """client_id 生成 / 匹配测试。"""

    def test_prefix_format(self, test_db):
        """ID 前缀必须是 CLI-。"""
        cid, match_type = generate_or_match_client_id(
            "John Doe", "john@test.com", test_db
        )
        assert cid.startswith("CLI-"), f"Expected CLI- prefix, got {cid}"
        assert match_type == "new"

    def test_hex_format(self, test_db):
        """格式为 CLI-{8位十六进制大写}。"""
        cid, _ = generate_or_match_client_id(
            "Jane Smith", "jane@test.com", test_db
        )
        parts = cid.split("-", 1)
        assert len(parts) == 2
        assert re.match(r"^[0-9A-F]{8}$", parts[1]), (
            f"Expected 8 hex chars, got {parts[1]}"
        )

    def test_exact_match_reuses(self, test_db):
        """同名+同邮箱 → 复用已有 client_id。"""
        # 先创建一个案件
        case = Case(
            id="CASE-TEST-001",
            client_name="PERSON_1",
            client_id="CLI-EXISTING1",
            client_email="person1@test.com",
            loan_amount=500000,
        )
        test_db.add(case)
        test_db.commit()

        # 再匹配
        cid, match_type = generate_or_match_client_id(
            "PERSON_1", "person1@test.com", test_db
        )
        assert cid == "CLI-EXISTING1"
        assert match_type == "exact"

    def test_name_only_match(self, test_db):
        """仅同名（邮箱不同）→ name_only。"""
        case = Case(
            id="CASE-TEST-002",
            client_name="PERSON_2",
            client_id="CLI-NAMEONLY1",
            client_email="old@test.com",
            loan_amount=300000,
        )
        test_db.add(case)
        test_db.commit()

        cid, match_type = generate_or_match_client_id(
            "PERSON_2", "new@test.com", test_db
        )
        assert cid == "CLI-NAMEONLY1"
        assert match_type == "name_only"

    def test_new_client(self, test_db):
        """完全新客户 → new。"""
        cid, match_type = generate_or_match_client_id(
            "Brand New Person", "never@seen.com", test_db
        )
        assert cid.startswith("CLI-")
        assert match_type == "new"


class TestCreateCaseFromSource:
    """create_case_from_source 集成测试。"""

    def test_creates_with_cli_prefix(self, test_db):
        """新建案件的 client_id 使用 CLI- 前缀。"""
        case = create_case_from_source(
            client_name="PERSON_3",
            source="email",
            db=test_db,
            loan_amount=750000,
            client_email="person3@test.com",
        )
        assert case.client_id.startswith("CLI-"), (
            f"Expected CLI- prefix, got {case.client_id}"
        )

    def test_force_new_client(self, test_db):
        """force_new_client=True 强制生成新 client_id。"""
        # 先创建一个案件
        case1 = create_case_from_source(
            client_name="PERSON_4",
            source="folder",
            db=test_db,
            client_email="p4@test.com",
        )

        # 强制新建
        case2 = create_case_from_source(
            client_name="PERSON_4",
            source="email",
            db=test_db,
            client_email="p4@test.com",
            force_new_client=True,
        )
        assert case2.client_id.startswith("CLI-")
        assert case2.client_id != case1.client_id

    def test_reuses_existing_client(self, test_db):
        """同名+同邮箱的新案件复用已有 client_id。"""
        case1 = create_case_from_source(
            client_name="PERSON_5",
            source="folder",
            db=test_db,
            client_email="p5@test.com",
        )

        case2 = create_case_from_source(
            client_name="PERSON_5",
            source="email",
            db=test_db,
            client_email="p5@test.com",
        )
        assert case2.client_id == case1.client_id
