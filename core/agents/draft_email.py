"""邮件草稿共创工具 — V1-V3 版本链 + 分支 + DraftCard 出口（WO-27）。

红线：只出草稿（无 send）；生成前脱敏、展示前还原；未确认版本不触发蒸馏。
"""

from __future__ import annotations

import json
import os

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import CaseChatMessage
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_SCHEMA_VERSION = 1
_INTENT_HINTS = {
    "followup": "跟进贷款申请进度：说明当前阶段，礼貌询问客户/相关方是否需要补充材料。",
    "chaser": "礼貌催促银行/贷款机构处理申请进度，说明等待时长与客户配合度。",
    "os_reply": "针对银行 Special Conditions 逐条回复进展、材料与预计完成时间。",
}


def _intent_prompt(intent: str, recipient_hint: str, previous: str) -> str:
    """组装英文邮件生成指令（进 LLM 前整体脱敏）。"""
    hint = _INTENT_HINTS.get(intent, "跟进贷款申请相关事项。")
    parts = [
        f"请为澳洲贷款经纪团队写一封英文邮件。意图：{hint}",
        f"收件人提示：{recipient_hint or '未指定'}",
        '只输出 JSON：{"subject": "...", "body": "..."}，body 为纯文本。',
    ]
    if previous:
        parts.append(f"参考上一版，只改需要改的地方：\n{previous[:800]}")
    return "\n".join(parts)


def _gen_draft(case_id: str, intent: str, recipient_hint: str, previous: str, db: Session) -> dict:
    """脱敏 → LLM 生成英文草稿（Gemini 优先）→ 还原。"""
    scope = case_id or "global"
    prompt = desensitize(_intent_prompt(intent, recipient_hint, previous), scope, db)
    cfg = get_config()
    prefer = "gemini" if cfg.settings.ai.fallback and os.getenv(cfg.settings.ai.fallback.api_key_env, "") else None
    result = ApiGateway(cfg).call_llm(
        text=DesensitizedText(prompt),
        prompt_template="你是邮件写作助手，只输出 JSON。",
        system_prompt="澳洲贷款经纪内部工具：只生成草稿，绝不发送。",
        prefer_provider=prefer,
    )
    raw = rehydrate(result.response_text, scope, db).strip()
    try:
        start, end = raw.index("{"), raw.rindex("}")
        data = json.loads(raw[start:end + 1])
        subject = str(data.get("subject", ""))[:120]
        body = str(data.get("body", ""))
    except (ValueError, TypeError, KeyError):
        subject = raw.splitlines()[0][:120] if raw else "（无主题）"
        body = raw
    return {"subject": subject or "（无主题）", "body": body or raw}


def _next_version(db: Session, case_id: str, branch_label: str) -> str:
    """同分支内草稿计数 + 1 → V1/V2/V3。"""
    count = (
        db.query(CaseChatMessage)
        .filter(CaseChatMessage.case_id == case_id, CaseChatMessage.branch_label == branch_label)
        .count()
    )
    return f"V{count + 1}"


def _append_message(db: Session, case_id: str, session_id: str, content: str, parent_id: int | None, branch_label: str) -> CaseChatMessage:
    """写版本链消息（原文留档，不蒸馏）。"""
    msg = CaseChatMessage(
        case_id=case_id,
        session_id=session_id or f"draft:{case_id}",
        role="assistant",
        content=content,
        parent_message_id=parent_id,
        branch_label=branch_label,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def _card(version: str, branch_label: str, msg: CaseChatMessage, draft: dict, action: str, status: str = "draft") -> dict:
    """DraftCard payload（CardSchema：schema_version/state/result）。"""
    return {
        "schema_version": _SCHEMA_VERSION,
        "card_type": "draft_email",
        "action": action,
        "status": status,
        "state": {"version": version, "branch_label": branch_label, "message_id": msg.id},
        "result": {"versions": [{**draft, "version": version, "branch_label": branch_label, "message_id": msg.id}]},
    }


def run_draft_email(case_id: str | None, args: dict, db: Session, track: str = "internal") -> dict:
    """生成/迭代/确认邮件草稿，返回 DraftCard payload（WO-27）。

    action：new（V1）/ version（V2+，需 parent_message_id）/ branch（分支 B）/
    confirm（确认版本 → DraftCard 出口 + 触发蒸馏）。
    """
    if not case_id:
        return {"status": "blocked", "reason": "邮件草稿需要先关联案件"}
    action = str(args.get("action", "new"))
    intent = str(args.get("intent", "followup"))
    recipient = str(args.get("recipient_hint", ""))
    branch_label = str(args.get("branch_label", "main"))
    parent_id = args.get("parent_message_id")
    parent = db.get(CaseChatMessage, parent_id) if parent_id else None

    if action == "confirm":
        target = parent or (
            db.query(CaseChatMessage)
            .filter(CaseChatMessage.case_id == case_id, CaseChatMessage.branch_label == branch_label)
            .order_by(CaseChatMessage.id.desc())
            .first()
        )
        if target is None:
            return {"status": "blocked", "reason": "确认失败：未找到指定版本"}
        try:
            data = json.loads(target.content)
        except (ValueError, TypeError):
            data = {"subject": "邮件草稿", "body": target.content[:500]}
        from core.context.accumulator import append_context_event
        append_context_event(
            case_id=case_id,
            source_type="flow:draft_email",
            content=f"邮件草稿确认：{data.get('subject', '')}",
            db=db,
            track=track,
            trigger_distill=True,
        )
        return _card(str(data.get("version", "V?")), target.branch_label or "main", target, data, "confirm", status="confirmed_draft")

    previous = parent.content if parent else ""
    draft = _gen_draft(case_id, intent, recipient, previous, db)
    version = _next_version(db, case_id, branch_label)
    content = json.dumps({**draft, "intent": intent, "version": version, "branch": branch_label}, ensure_ascii=False)
    msg = _append_message(db, case_id, str(args.get("session_id", "")), content, parent.id if parent else None, branch_label)
    return _card(version, branch_label, msg, draft, action)