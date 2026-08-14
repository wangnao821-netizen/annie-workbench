"""AI 助手设置 API — 人格/名字/称呼（2026-08-14）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.models.orm import SystemSetting
from core.persona import get_default_key, list_personas
from server.api.schemas import (
    AssistantSettingsResponse,
    AssistantSettingsUpdate,
    PersonaItem,
)
from server.deps import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

_SETTING_KEYS = ("ai_name", "user_address", "persona_key")


def _read_settings(db: Session) -> dict:
    """读取 AI 助手三个设置键（空值归一为 None）。"""
    rows = db.query(SystemSetting).filter(SystemSetting.key.in_(_SETTING_KEYS)).all()
    values = {row.key: (row.value or "").strip() or None for row in rows}
    return {key: values.get(key) for key in _SETTING_KEYS}


def _apply_updates(db: Session, updates: dict[str, str | None]) -> None:
    """upsert / 删除 system_settings 行（单次提交）。"""
    for key, value in updates.items():
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if value:
            if row:
                row.value = value
            else:
                db.add(SystemSetting(key=key, value=value))
        elif row:
            db.delete(row)
    db.commit()


def _build_response(db: Session) -> AssistantSettingsResponse:
    """组装完整响应：当前设置 + 人格列表 + 引导标志。"""
    settings = _read_settings(db)
    known = {p["key"] for p in list_personas()}
    persona_key = settings["persona_key"]
    if persona_key not in known:
        persona_key = None
    onboarding_needed = not (settings["ai_name"] and settings["user_address"])
    return AssistantSettingsResponse(
        ai_name=settings["ai_name"],
        user_address=settings["user_address"],
        persona_key=persona_key,
        default_persona=get_default_key(),
        personas=[PersonaItem(**p) for p in list_personas()],
        onboarding_needed=onboarding_needed,
    )


@router.get("/assistant", response_model=AssistantSettingsResponse)
def get_assistant_settings(db: Session = Depends(get_db)) -> AssistantSettingsResponse:  # noqa: B008
    """获取 AI 助手设置（名字/称呼/人格）与内置人格列表。"""
    return _build_response(db)


@router.patch("/assistant", response_model=AssistantSettingsResponse)
def update_assistant_settings(
    req: AssistantSettingsUpdate,
    db: Session = Depends(get_db),  # noqa: B008
) -> AssistantSettingsResponse:
    """更新 AI 助手设置；persona_key 非法返回 422，空字符串视为清除。"""
    updates: dict[str, str | None] = {}
    for key in ("ai_name", "user_address", "persona_key"):
        if key in req.model_fields_set:
            value = getattr(req, key)
            updates[key] = (value or "").strip() or None
    if updates.get("persona_key"):
        known = {p["key"] for p in list_personas()}
        if updates["persona_key"] not in known:
            raise HTTPException(
                status_code=422,
                detail=f"persona_key '{updates['persona_key']}' 不存在，可选：{sorted(known)}",
            )
    _apply_updates(db, updates)
    return _build_response(db)
