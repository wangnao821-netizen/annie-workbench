"""REST API endpoints for Skill Package System (WO-28)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from core.skills.registry import (
    activate_skill,
    create_skill_draft,
    deactivate_skill,
    get_skill,
    list_skills,
    propose_skill,
    rollback_skill,
)
from server.api.schemas import (
    SkillActivateRequest,
    SkillCreateRequest,
    SkillProposeRequest,
    SkillResponse,
    SkillRollbackRequest,
)
from server.deps import get_db

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=list[SkillResponse])
def get_skills(
    category: str | None = Query(None),
    status_param: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),  # noqa: B008
) -> list[dict[str, Any]]:
    """List skills with optional category and status filters."""
    return list_skills(db, category=category, status=status_param)


@router.get("/{key}", response_model=SkillResponse)
def get_skill_detail(
    key: str,
    version: str | None = Query(None),
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, Any]:
    """Get detail of a skill by key and optional version."""
    skill = get_skill(db, key=key, version=version)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{key}' not found")
    return skill


@router.post("", status_code=status.HTTP_201_CREATED)
def create_skill(
    req: SkillCreateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, Any]:
    """Create a new skill draft (path A: Vera manual)."""
    try:
        sv = create_skill_draft(db, req.manifest, created_by="vera", reason=req.reason)
        return {"id": sv.id, "key": sv.key, "version": sv.version, "status": sv.status}
    except (ValueError, ValidationError) as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/propose", status_code=status.HTTP_201_CREATED)
def propose_skill_endpoint(
    req: SkillProposeRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, Any]:
    """AI proposes a skill draft (path B: AI propose, human-in-the-loop)."""
    try:
        sv = propose_skill(db, req.manifest, reason=req.reason, scope=req.scope)
        return {"id": sv.id, "key": sv.key, "version": sv.version, "status": sv.status}
    except (ValueError, ValidationError) as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/{key}/activate")
def activate_skill_endpoint(
    key: str,
    req: SkillActivateRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, Any]:
    """Vera activates a draft skill version."""
    try:
        sv = activate_skill(db, key=key, version=req.version, confirmed_by=req.operator)
        return {"id": sv.id, "key": sv.key, "version": sv.version, "status": sv.status}
    except PermissionError as err:
        raise HTTPException(status_code=403, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{key}/deactivate")
def deactivate_skill_endpoint(
    key: str,
    version: str = Query(...),
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, Any]:
    """Deactivate an active skill version."""
    try:
        sv = deactivate_skill(db, key=key, version=version)
        return {"id": sv.id, "key": sv.key, "version": sv.version, "status": sv.status}
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{key}/rollback")
def rollback_skill_endpoint(
    key: str,
    req: SkillRollbackRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, Any]:
    """Rollback skill to a specified target version."""
    try:
        sv = rollback_skill(db, key=key, target_version=req.target_version)
        return {"id": sv.id, "key": sv.key, "version": sv.version, "status": sv.status}
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
