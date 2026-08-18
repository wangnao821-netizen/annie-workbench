"""AI 助手设置 API — 人格/名字/称呼（2026-08-14）+ AI 模型 API 配置（2026-08-18）。"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.models.orm import SystemSetting
from core.persona import get_default_key, list_personas
from server.api.schemas import (
    AiProviderStatus,
    AiSettingsResponse,
    AiSettingsUpdate,
    AiTestRequest,
    AiTestResponse,
    AssistantSettingsResponse,
    AssistantSettingsUpdate,
    PersonaItem,
)
from server.deps import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

_SETTING_KEYS = ("ai_name", "user_address", "persona_key")
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

# AI key/base 环境变量与请求字段映射
_AI_FIELD_TO_ENV = {
    "deepseek_api_key": "DEEPSEEK_API_KEY",
    "deepseek_base_url": "DEEPSEEK_API_BASE",
    "gemini_api_key": "GEMINI_API_KEY",
    "gemini_base_url": "GEMINI_API_BASE",
}


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


# ── AI 模型 API 配置（设置页） ─────────────────────────────────────────────

def _read_dotenv() -> dict[str, str]:
    """读取 .env 键值（保留可解析行；不存在返回空 dict）。"""
    result: dict[str, str] = {}
    if not _ENV_PATH.exists():
        return result
    for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def _write_dotenv(updates: dict[str, str | None]) -> None:
    """更新 .env 指定键（None 删除该键；保留注释与其他行；文件不存在则创建）。"""
    existing = _ENV_PATH.read_text(encoding="utf-8").splitlines() if _ENV_PATH.exists() else []
    keys = set(updates)
    out: list[str] = []
    written: set[str] = set()
    for line in existing:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.partition("=")[0].strip()
            if key in keys:
                value = updates[key]
                if value is not None:
                    out.append(f"{key}={value}")
                written.add(key)
                continue
        out.append(line)
    for key, value in updates.items():
        if key not in written and value is not None:
            out.append(f"{key}={value}")
    _ENV_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")


def _reload_ai_config() -> None:
    """清配置缓存并重载（ApiGateway 每次调用都新建，天然热更新）。"""
    import core.config as cfg

    cfg._cached_config = None
    from core.config import get_config

    get_config()


@router.get("/ai", response_model=AiSettingsResponse)
def get_ai_settings() -> AiSettingsResponse:
    """读取 AI provider 配置状态（key 只回显是否配置，不返回原文）。"""
    env = _read_dotenv()
    return AiSettingsResponse(
        deepseek=AiProviderStatus(
            key_configured=bool(env.get("DEEPSEEK_API_KEY")),
            base_url=env.get("DEEPSEEK_API_BASE") or None,
        ),
        gemini=AiProviderStatus(
            key_configured=bool(env.get("GEMINI_API_KEY")),
            base_url=env.get("GEMINI_API_BASE") or None,
        ),
    )


@router.patch("/ai", response_model=AiSettingsResponse)
def update_ai_settings(req: AiSettingsUpdate) -> AiSettingsResponse:
    """更新 AI key/base URL（写 .env + 热重载；空字符串=清除）。"""
    updates: dict[str, str | None] = {}
    for field, env_key in _AI_FIELD_TO_ENV.items():
        if field in req.model_fields_set:
            raw = getattr(req, field)
            updates[env_key] = (raw or "").strip() or None
    if not updates:
        return get_ai_settings()
    _write_dotenv(updates)
    _reload_ai_config()
    return get_ai_settings()


@router.post("/ai/test", response_model=AiTestResponse)
def test_ai_connection(req: AiTestRequest) -> AiTestResponse:
    """用提供的（或现有）key/base_url 调一次最小 LLM 请求验证连通性。"""
    env_key = "DEEPSEEK_API_KEY" if req.provider == "deepseek" else "GEMINI_API_KEY"
    api_key = (req.api_key or "").strip() or os.getenv(env_key, "")
    if not api_key:
        return AiTestResponse(ok=False, message="未配置 API Key")
    try:
        from openai import OpenAI

        base = (req.base_url or "").strip() or os.getenv(
            "DEEPSEEK_API_BASE" if req.provider == "deepseek" else "GEMINI_API_BASE"
        )
        from core.config import get_config

        model = (
            get_config().ai.primary.model
            if req.provider == "deepseek"
            else "gemini-2.0-flash"
        )
        client = OpenAI(api_key=api_key, base_url=base or None, timeout=15.0)
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
        return AiTestResponse(ok=True, message="连接成功")
    except Exception as exc:  # noqa: BLE001 — 测试连接需要捕获所有错误并回显
        return AiTestResponse(ok=False, message=str(exc)[:300])
