"""会话压缩 — 对话窗口外消息蒸馏为 CaseContextEvent 摘要（WO-35）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import CaseChatMessage, CaseContextEvent
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

SESSION_COMPRESSION_SOURCE_TYPE = "session_compression"
_SOURCE_REF_PREFIX = "session_compression:"

_SYSTEM_PROMPT = (
    "你是一个贷款对话摘要专家。将历史对话总结为简短的高密度摘要。"
    "要求：1. 纯中文输出；2. 保留关键事实（客户目标、关键数字、重要决定、待办事项）；"
    "3. 严禁编造；4. 纯文本格式，不要包含 Markdown 标记。"
)


def ensure_session_compression(case_id: str, db: Session, track: str = "internal") -> str:
    """懒压缩入口（幂等）：未压缩消息 ≥ trigger_messages → 压缩并写事件；返回最新摘要文本。

    Args:
        case_id: 案件 ID
        db: SQLAlchemy session
        track: 压缩事件归属轨道（internal | external，对话层本身不区分轨道）

    Returns:
        最新压缩摘要文本；无压缩/被禁用/失败时返回 ""（失败仅 logger.warning，不抛异常）。
    """
    if not case_id:
        return ""
    try:
        cfg = get_config().settings.ai.session_compression
        if not cfg.enabled:
            return ""

        if _should_compress(case_id, db, cfg.trigger_messages):
            _compress(
                case_id,
                db,
                track,
                cfg.trigger_messages,
                cfg.keep_messages,
                cfg.summary_max_chars,
            )

        latest_evt = (
            db.query(CaseContextEvent)
            .filter(
                CaseContextEvent.case_id == case_id,
                CaseContextEvent.source_type == SESSION_COMPRESSION_SOURCE_TYPE,
                CaseContextEvent.status == "confirmed",
            )
            .order_by(CaseContextEvent.id.desc())
            .first()
        )
        return latest_evt.content if latest_evt else ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("ensure_session_compression failed: %s", exc)
        return ""


def _last_compressed_msg_id(case_id: str, db: Session) -> int:
    """最新 session_compression 事件 source_ref 中解析的 last_msg_id；无则 0。"""
    latest_evt = (
        db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == case_id,
            CaseContextEvent.source_type == SESSION_COMPRESSION_SOURCE_TYPE,
            CaseContextEvent.status == "confirmed",
        )
        .order_by(CaseContextEvent.id.desc())
        .first()
    )
    if latest_evt and latest_evt.source_ref and latest_evt.source_ref.startswith(_SOURCE_REF_PREFIX):
        parts = latest_evt.source_ref.split(":")
        if len(parts) >= 3:
            try:
                return int(parts[1])
            except ValueError:
                pass
    return 0


def _should_compress(case_id: str, db: Session, trigger_messages: int) -> bool:
    """未压缩消息数（id > 上次压缩最后消息 id）≥ trigger_messages。"""
    last_id = _last_compressed_msg_id(case_id, db)
    uncompressed_count = (
        db.query(CaseChatMessage)
        .filter(
            CaseChatMessage.case_id == case_id,
            CaseChatMessage.id > last_id,
        )
        .count()
    )
    return uncompressed_count >= trigger_messages


def _compress(
    case_id: str,
    db: Session,
    track: str,
    trigger_messages: int,
    keep_messages: int,
    summary_max_chars: int,
) -> str | None:
    """取未压缩消息（按 id 升序，最多 500 条）→ 保留最近 keep_messages 条 →
    其余脱敏摘要 → 写事件。返回摘要文本；失败返回 None。"""
    last_id = _last_compressed_msg_id(case_id, db)
    uncompressed = (
        db.query(CaseChatMessage)
        .filter(
            CaseChatMessage.case_id == case_id,
            CaseChatMessage.id > last_id,
        )
        .order_by(CaseChatMessage.id.asc())
        .limit(500)
        .all()
    )
    if len(uncompressed) < trigger_messages:
        return None

    to_compress = uncompressed[:-keep_messages] if len(uncompressed) > keep_messages else []
    if not to_compress:
        return None

    blocks = [f"[{m.role}] {m.content}" for m in to_compress]
    summary = _summarize(case_id, blocks, db, summary_max_chars)
    if not summary:
        return None

    last_msg_id = to_compress[-1].id
    count = len(to_compress)
    source_ref = f"{_SOURCE_REF_PREFIX}{last_msg_id}:{count}"

    existing = (
        db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == case_id,
            CaseContextEvent.source_ref == source_ref,
        )
        .first()
    )
    if existing:
        return existing.content

    event = CaseContextEvent(
        case_id=case_id,
        source_type=SESSION_COMPRESSION_SOURCE_TYPE,
        content=summary,
        track=track,
        status="confirmed",
        source_ref=source_ref,
    )
    db.add(event)
    db.commit()
    return summary


def _summarize(case_id: str, blocks: list[str], db: Session, max_chars: int) -> str:
    """脱敏 → LLM 摘要 → rehydrate。LLM 失败回退文本尾部截断（仍返回非空，不抛异常）。"""
    raw_text = "\n".join(blocks)
    fallback_text = raw_text[:max_chars]
    if not raw_text.strip():
        return ""

    try:
        safe_text = desensitize(raw_text, case_id, db)
        prompt = f"请将以下对话历史压缩总结为一段不超过 {max_chars} 字的纯文本摘要：\n\n{safe_text}"
        gw = ApiGateway(get_config())
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template=prompt,
            system_prompt=_SYSTEM_PROMPT,
        )
        res_text = result.response_text.strip() if result and result.response_text else ""
        if not res_text:
            return fallback_text
        hydrated = rehydrate(res_text, case_id, db)
        return hydrated[:max_chars] if len(hydrated) > max_chars else hydrated
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM summarize failed, fallback to raw truncation: %s", exc)
        return fallback_text
