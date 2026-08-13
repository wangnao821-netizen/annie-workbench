"""Skill Package Registry (WO-28): CRUD, Status Machine, Version Control, Rollback."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from core.agents.flows import load_flows
from core.models.orm import SkillVersion
from core.skills.manifest import validate_manifest


def load_builtin_skills() -> list[dict[str, Any]]:
    """Load builtin flow packages as skills."""
    return [
        {
            "key": k,
            "name": f.get("name", k),
            "description": f.get("description", ""),
            "version": "1.0.0",
            "category": "flow",
            "triggers": f.get("triggers", []),
            "presentation": f.get("presentation", "result_card"),
            "permission": f.get("permission", "read_only"),
            "inputs": f.get("inputs", {}),
            "outputs": f.get("outputs", {}),
            "steps": f.get("steps", []),
            "assets": f.get("assets", []),
            "confirm_required": f.get("confirm_required", True),
            "status": "active",
            "author": "system",
        }
        for k, f in load_flows().items()
    ]


def list_skills(
    db: Session, category: str | None = None, status: str | None = None
) -> list[dict[str, Any]]:
    """List skills, merging builtin skills and DB skill_versions."""
    db_versions = db.query(SkillVersion).order_by(SkillVersion.id.desc()).all()
    db_skills: list[dict[str, Any]] = []

    for v in db_versions:
        try:
            m = json.loads(v.manifest_json)
        except (json.JSONDecodeError, TypeError):
            continue
        m.update({"status": v.status, "version": v.version, "db_id": v.id, "created_by": v.created_by, "reason": v.reason})
        db_skills.append(m)

    builtins = load_builtin_skills()
    db_keys = {m["key"] for m in db_skills}
    result = [b for b in builtins if b["key"] not in db_keys] + db_skills

    if category:
        result = [s for s in result if s.get("category") == category]
    if status:
        result = [s for s in result if s.get("status") == status]
    return result


def get_skill(db: Session, key: str, version: str | None = None) -> dict[str, Any] | None:
    """Get detail of a skill by key and optional version."""
    query = db.query(SkillVersion).filter(SkillVersion.key == key)
    query = query.filter(SkillVersion.version == version) if version else query
    v_obj = query.filter(SkillVersion.status == "active").order_by(SkillVersion.id.desc()).first() or query.order_by(SkillVersion.id.desc()).first()

    if v_obj:
        try:
            m = json.loads(v_obj.manifest_json)
            m.update({"status": v_obj.status, "version": v_obj.version, "db_id": v_obj.id, "created_by": v_obj.created_by, "reason": v_obj.reason})
            return m
        except (json.JSONDecodeError, TypeError):
            pass

    return next((b for b in load_builtin_skills() if b["key"] == key), None)


def create_skill_draft(
    db: Session, manifest_data: dict[str, Any], created_by: str = "vera", reason: str | None = None
) -> SkillVersion:
    """Create a new skill version in draft status (never auto-activates)."""
    manifest_data["status"] = "draft"
    manifest = validate_manifest(manifest_data)
    sv = SkillVersion(
        key=manifest.key,
        version=manifest.version or "1.0.0",
        manifest_json=manifest.model_dump_json(),
        status="draft",
        created_by=created_by,
        reason=reason,
    )
    db.add(sv)
    db.commit()
    db.refresh(sv)
    return sv


def propose_skill(
    db: Session, manifest_data: dict[str, Any], reason: str, scope: str | None = None
) -> SkillVersion:
    """AI proposes a skill draft."""
    return create_skill_draft(db, manifest_data, created_by="ai_propose", reason=reason)


def activate_skill(
    db: Session, key: str, version: str, confirmed_by: str = "vera"
) -> SkillVersion:
    """Vera activates a draft skill version (Human-in-the-loop gate)."""
    if confirmed_by != "vera":
        raise PermissionError("Only Vera confirmation can activate a skill draft")

    target = db.query(SkillVersion).filter(SkillVersion.key == key, SkillVersion.version == version).order_by(SkillVersion.id.desc()).first()
    if not target:
        raise ValueError(f"Skill version {key}:{version} not found")
    if target.status == "deprecated":
        raise ValueError(f"Cannot activate deprecated skill version {key}:{version}")

    for active_v in db.query(SkillVersion).filter(SkillVersion.key == key, SkillVersion.status == "active", SkillVersion.id != target.id).all():
        active_v.status = "deprecated"
        active_v.superseded_by = target.id

    target.status = "active"
    db.commit()
    db.refresh(target)
    return target


def deactivate_skill(db: Session, key: str, version: str) -> SkillVersion:
    """Deactivate an active skill version."""
    target = db.query(SkillVersion).filter(SkillVersion.key == key, SkillVersion.version == version).order_by(SkillVersion.id.desc()).first()
    if not target:
        raise ValueError(f"Skill version {key}:{version} not found")
    target.status = "deprecated"
    db.commit()
    db.refresh(target)
    return target


def rollback_skill(db: Session, key: str, target_version: str) -> SkillVersion:
    """Rollback skill to a previous target version."""
    target = db.query(SkillVersion).filter(SkillVersion.key == key, SkillVersion.version == target_version).order_by(SkillVersion.id.desc()).first()
    if not target:
        raise ValueError(f"Target skill version {key}:{target_version} not found")

    for cur in db.query(SkillVersion).filter(SkillVersion.key == key, SkillVersion.status == "active").all():
        cur.status = "deprecated"
        cur.superseded_by = target.id

    target.status = "active"
    db.commit()
    db.refresh(target)
    return target


def update_skill_draft(db: Session, key: str, manifest_data: dict[str, Any], reason: str | None = None) -> SkillVersion:
    """更新最新 draft 版本 manifest（仅 draft 状态可编辑）。"""
    target = (
        db.query(SkillVersion)
        .filter(SkillVersion.key == key, SkillVersion.status == "draft")
        .order_by(SkillVersion.id.desc())
        .first()
    )
    if target is None:
        raise ValueError(f"Skill '{key}' has no draft version to update")
    manifest_data["status"] = "draft"
    manifest_data["key"] = key
    manifest = validate_manifest(manifest_data)
    target.manifest_json = manifest.model_dump_json()
    if reason:
        target.reason = reason
    db.commit()
    db.refresh(target)
    return target


def reject_skill_proposal(db: Session, key: str, reason: str | None = None) -> SkillVersion:
    """拒绝 AI 提议：将 ai_propose 的 draft 置为 deprecated 并记 reason。"""
    target = (
        db.query(SkillVersion)
        .filter(SkillVersion.key == key, SkillVersion.created_by == "ai_propose", SkillVersion.status == "draft")
        .order_by(SkillVersion.id.desc())
        .first()
    )
    if target is None:
        raise ValueError(f"No AI proposal draft found for '{key}'")
    target.status = "deprecated"
    if reason:
        target.reason = reason
    db.commit()
    db.refresh(target)
    return target