"""Unit tests for Skill Manifest Schema & Registry (WO-28)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.models.orm import Base
from core.skills.manifest import validate_manifest
from core.skills.registry import (
    activate_skill,
    create_skill_draft,
    get_skill,
    rollback_skill,
)


@pytest.fixture
def db_session():
    """In-memory SQLite DB session for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_valid_manifest_passes():
    """1. 合法 manifest 通过校验。"""
    data = {
        "key": "test_flow",
        "name": "Test Flow Skill",
        "description": "Valid flow skill",
        "version": "1.0.0",
        "category": "flow",
        "triggers": ["test"],
        "presentation": "result_card",
        "permission": "draft",
        "steps": [{"tool": "declaration_check", "params": {}}],
        "assets": [{"key": "prompt_1", "type": "prompt", "content": "Hello"}],
    }
    manifest = validate_manifest(data)
    assert manifest.key == "test_flow"
    assert manifest.steps[0]["tool"] == "declaration_check"


def test_invalid_category_rejected():
    """2. 非法 category 拒绝。"""
    data = {"key": "k1", "name": "n1", "category": "invalid_cat"}
    with pytest.raises(ValidationError):
        validate_manifest(data)


def test_invalid_presentation_rejected():
    """2b. 非法 presentation 拒绝。"""
    data = {"key": "k1", "name": "n1", "presentation": "popup_window"}
    with pytest.raises(ValidationError):
        validate_manifest(data)


def test_invalid_permission_rejected():
    """2c. 非法 permission 拒绝。"""
    data = {"key": "k1", "name": "n1", "permission": "admin_root"}
    with pytest.raises(ValidationError):
        validate_manifest(data)


def test_tool_not_in_whitelist_rejected():
    """3. 白名单外 tool 拒绝。"""
    data = {
        "key": "k1",
        "name": "n1",
        "steps": [{"tool": "arbitrary_code_exec", "params": {}}],
    }
    with pytest.raises(ValidationError) as excinfo:
        validate_manifest(data)
    assert "not in whitelist" in str(excinfo.value)


def test_empty_steps_pure_template_allowed():
    """4. steps 为空（纯模板/知识技能）合法。"""
    data = {
        "key": "template_skill",
        "name": "Knowledge Template",
        "category": "knowledge",
        "steps": [],
        "assets": [{"key": "t1", "type": "email_template", "content": "Dear Client..."}],
    }
    manifest = validate_manifest(data)
    assert manifest.steps == []
    assert len(manifest.assets) == 1


def test_assets_code_execution_rejected():
    """7. assets 非代码约束（拒绝可执行脚本字段）。"""
    data_bad_key = {
        "key": "bad_asset_1",
        "name": "Bad Asset",
        "assets": [{"key": "a1", "exec": "import os; os.system('rm -rf /')"}],
    }
    with pytest.raises(ValidationError):
        validate_manifest(data_bad_key)

    data_bad_token = {
        "key": "bad_asset_2",
        "name": "Bad Asset Token",
        "assets": [{"key": "a2", "type": "python", "content": "print('hello')"}],
    }
    with pytest.raises(ValidationError):
        validate_manifest(data_bad_token)


def test_version_uniqueness_and_draft_creation(db_session):
    """5. 草稿创建状态机 & 存储。"""
    manifest_data = {
        "key": "my_skill",
        "name": "My Skill",
        "version": "1.0.0",
        "steps": [],
    }
    sv = create_skill_draft(db_session, manifest_data, created_by="vera")
    assert sv.status == "draft"
    assert sv.created_by == "vera"

    skill = get_skill(db_session, "my_skill")
    assert skill is not None
    assert skill["status"] == "draft"


def test_status_machine_invalid_activation_non_vera(db_session):
    """6. 非 Vera 确认无法激活。"""
    manifest_data = {"key": "skill_v1", "name": "V1", "version": "1.0.0"}
    create_skill_draft(db_session, manifest_data, created_by="ai_propose")

    with pytest.raises(PermissionError) as excinfo:
        activate_skill(db_session, "skill_v1", "1.0.0", confirmed_by="hacker")
    assert "Only Vera confirmation" in str(excinfo.value)


def test_rollback_superseded_by_chain(db_session):
    """8. 回滚：superseded_by 链正确。"""
    manifest_v1 = {"key": "chain_skill", "name": "Chain Skill", "version": "1.0.0"}
    manifest_v2 = {"key": "chain_skill", "name": "Chain Skill V2", "version": "2.0.0"}

    v1 = create_skill_draft(db_session, manifest_v1, created_by="vera")
    v2 = create_skill_draft(db_session, manifest_v2, created_by="vera")

    # Activate v1
    activate_skill(db_session, "chain_skill", "1.0.0", confirmed_by="vera")
    assert v1.status == "active"

    # Activate v2 (should deprecate v1 and set v1.superseded_by = v2.id)
    activate_skill(db_session, "chain_skill", "2.0.0", confirmed_by="vera")
    db_session.refresh(v1)
    db_session.refresh(v2)
    assert v1.status == "deprecated"
    assert v1.superseded_by == v2.id
    assert v2.status == "active"

    # Rollback to 1.0.0 (should set v2.superseded_by = v1.id, v1.status = active)
    rollback_skill(db_session, "chain_skill", "1.0.0")
    db_session.refresh(v1)
    db_session.refresh(v2)
    assert v2.status == "deprecated"
    assert v2.superseded_by == v1.id
    assert v1.status == "active"
