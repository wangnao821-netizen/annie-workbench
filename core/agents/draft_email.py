"""邮件草稿共创工具 — V1-V3 版本链 + 分支 + DraftCard 出口（WO-27）+ 弹窗深谈（WO-46b）。

红线：只出草稿（无 send）；生成前脱敏、展示前还原；未确认版本不触发蒸馏。
WO-46b：注入案件全景、clarify 澄清、confirm 可选建待办、prompt 带用户 message 指令。
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

# 澄清问题规则模板（LLM 补强失败时回退；1-3 轮上限由前端控制）
_CLARIFY_QUESTIONS = {
    "followup": "1. 收件人是客户还是银行？\n2. 需要包含哪些已递交/待补材料？\n3. 语气需要多正式？",
    "chaser": "1. 收件银行是哪家？\n2. 已等待多久？客户是否已配合补齐材料？\n3. 需要设定回复截止日吗？",
    "os_reply": "1. 要回复哪几条 Special Conditions？\n2. 每条对应的进展/材料是什么？\n3. 预计完成时间？",
}


def _intent_prompt(intent: str, recipient_hint: str, previous: str, message: str = "", panorama: str = "") -> str:
    """组装英文邮件生成指令（进 LLM 前整体脱敏）。"""
    hint = _INTENT_HINTS.get(intent, "跟进贷款申请相关事项。")
    parts = [
        f"请为澳洲贷款经纪团队写一封英文邮件。意图：{hint}",
        f"收件人提示：{recipient_hint or '未指定'}",
    ]
    if panorama:
        parts.append(f"【案件全景】\n{panorama}")
    if message:
        parts.append(f"用户补充指令：{message}")
    parts.append('只输出 JSON：{"subject": "...", "body": "...", "body_cn": "..."}，其中 body 为专业地道的英文纯文本，body_cn 为清晰准确的中文对照翻译。')
    if previous:
        parts.append(f"参考上一版，只改需要改的地方：\n{previous[:800]}")
    return "\n".join(parts)


def _gen_draft(
    case_id: str,
    intent: str,
    recipient_hint: str,
    previous: str,
    db: Session,
    message: str = "",
    panorama: str = "",
) -> dict:
    """脱敏 → LLM 生成英文草稿（Gemini 优先）→ 还原。"""
    scope = case_id or "global"
    prompt = desensitize(_intent_prompt(intent, recipient_hint, previous, message=message, panorama=panorama), scope, db)
    cfg = get_config()
    prefer = "gemini" if cfg.settings.ai.fallback and os.getenv(cfg.settings.ai.fallback.api_key_env, "") else None
    result = ApiGateway(cfg).call_llm(
        text=DesensitizedText(prompt),
        prompt_template="你是邮件写作助手，只输出 JSON。",
        system_prompt="澳洲贷款经纪内部工具：只生成草稿，绝不发送。",
        prefer_provider=prefer,
    )
    raw = rehydrate(result.response_text, scope, db).strip()
    body_cn = ""
    try:
        start, end = raw.index("{"), raw.rindex("}")
        data = json.loads(raw[start:end + 1])
        subject = str(data.get("subject", ""))[:120]
        body = str(data.get("body", ""))
        body_cn = str(data.get("body_cn", ""))
    except (ValueError, TypeError, KeyError):
        subject = raw.splitlines()[0][:120] if raw else "（无主题）"
        body = raw
    return {"subject": subject or "（无主题）", "body": body or raw, "body_cn": body_cn}


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


def _case_panorama(case_id: str, db: Session) -> str:
    """构建案件全景（真实值文本，进 LLM 前整体脱敏；展示 Vera 时直接可读）。

    字段：客户名 / 银行 / 阶段 / 补件要求（未收清单 Top3）/ 相关待办 Top3，
    并注入蒸馏记忆摘要（复用 case_context 的 get_distilled_summary）。
    """
    from core.context.accumulator import get_distilled_summary
    from core.models.orm import Action, Case, CaseChecklist

    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        return ""
    parts = [f"客户名：{case.client_name or '未知'}"]
    parts.append(f"银行：{case.lender or '未指定'}")
    parts.append(f"阶段：{case.stage or '未知'}")
    if case.loan_amount:
        parts.append(f"贷款金额：${case.loan_amount:,.0f}")
    if case.finance_deadline:
        parts.append(f"Finance Clause 截止：{case.finance_deadline.strftime('%Y-%m-%d')}")
    pending_cl = (
        db.query(CaseChecklist)
        .filter(
            CaseChecklist.case_id == case.id,
            CaseChecklist.status.notin_(["received", "collected", "waived", "deferred"]),
        )
        .order_by(CaseChecklist.id)
        .limit(3)
        .all()
    )
    if pending_cl:
        parts.append("补件要求：" + "、".join(c.item_name for c in pending_cl))
    todos = (
        db.query(Action)
        .filter(Action.case_id == case_id, Action.status == "pending")
        .order_by(Action.created_at.desc())
        .limit(3)
        .all()
    )
    if todos:
        parts.append("相关待办：" + "、".join(t.title[:40] for t in todos))
    summary = get_distilled_summary(case_id, db)
    if summary:
        parts.append(f"记忆摘要：{summary[:500]}")
    return "\n".join(parts)


def _clarify_questions(intent: str, panorama: str, db: Session, case_id: str = "") -> str:
    """澄清问题：规则模板 + LLM 补强（失败回退模板）。"""
    template = _CLARIFY_QUESTIONS.get(intent, _CLARIFY_QUESTIONS["followup"])
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("VERA_PAI_TEST") != "1":
        return template  # 测试环境默认不发真实 LLM
    scope = case_id or "global"
    try:
        safe = desensitize(
            f"基于以下案件全景，为「{intent}」邮件起草列出 2-3 个需要向经纪确认的中文问题：\n{panorama}\n只输出问题列表。",
            scope,
            db,
        )
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe),
            prompt_template="你是贷款经纪助手，只输出中文问题列表。",
            system_prompt="澳洲贷款经纪内部工具：只生成澄清问题，绝不发送。",
        )
        extra = rehydrate(result.response_text.strip(), scope, db)
        if extra:
            return f"{template}\n\n补充问题：\n{extra[:300]}"
    except Exception as exc:  # noqa: BLE001 — LLM 补强失败回退规则模板
        logger.warning("clarify LLM enhancement failed, fallback to template: %s", exc)
    return template


def _branch_versions(case_id: str, branch_label: str, db: Session) -> list[dict]:
    """返回指定分支的完整版本链（升序）。"""
    rows = (
        db.query(CaseChatMessage)
        .filter(CaseChatMessage.case_id == case_id, CaseChatMessage.branch_label == branch_label)
        .order_by(CaseChatMessage.id.asc())
        .all()
    )
    out: list[dict] = []
    for m in rows:
        try:
            data = json.loads(m.content)
        except (ValueError, TypeError):
            data = {"subject": "邮件草稿", "body": m.content[:500]}
        out.append(
            {
                "subject": data.get("subject", ""),
                "body": data.get("body", ""),
                "body_cn": data.get("body_cn", ""),
                "version": data.get("version", "V?"),
                "branch_label": m.branch_label or branch_label,
                "message_id": m.id,
            }
        )
    return out


def run_co_create(case_id: str | None, args: dict, db: Session, track: str = "internal") -> dict:
    """共创弹窗深谈入口（WO-46b）：clarify/generate/version/branch/confirm。

    返回 CoCreateResponse 契约：{reply, draft, versions, status, event_id, task_id}。
    红线：脱敏 → LLM → 还原；只出草稿绝不发送；confirm 建待办必须 create_todo=true。
    """
    if not case_id:
        return {
            "reply": "需要先关联案件",
            "draft": None,
            "versions": [],
            "status": "blocked",
            "event_id": None,
            "task_id": None,
            "reason": "需要先关联案件",
        }
    from core.models.orm import Case

    if db.query(Case).filter(Case.id == case_id).first() is None:
        return {
            "reply": "案件不存在",
            "draft": None,
            "versions": [],
            "status": "blocked",
            "event_id": None,
            "task_id": None,
            "reason": "case not found",
        }

    action = str(args.get("action", "generate"))
    flow_key = str(args.get("flow_key", "followup"))
    message = str(args.get("message", ""))
    recipient_hint = str(args.get("recipient_hint", ""))
    branch_label = str(args.get("branch_label", "main"))
    session_id = str(args.get("session_id", "") or f"draft:{case_id}")
    parent_id = args.get("parent_message_id")
    parent = db.get(CaseChatMessage, parent_id) if parent_id else None
    panorama = _case_panorama(case_id, db)

    if action == "clarify":
        questions = _clarify_questions(flow_key, panorama, db, case_id=case_id)
        reply = f"已读取案件全景：\n{panorama}\n\n起草前请确认：\n{questions}"
        return {
            "reply": reply,
            "draft": None,
            "versions": [],
            "status": "clarifying",
            "event_id": None,
            "task_id": None,
        }

    if action == "confirm":
        target = parent or (
            db.query(CaseChatMessage)
            .filter(CaseChatMessage.case_id == case_id, CaseChatMessage.branch_label == branch_label)
            .order_by(CaseChatMessage.id.desc())
            .first()
        )
        if target is None:
            return {
                "reply": "确认失败：未找到指定版本",
                "draft": None,
                "versions": [],
                "status": "blocked",
                "event_id": None,
                "task_id": None,
                "reason": "确认失败：未找到指定版本",
            }
        try:
            data = json.loads(target.content)
        except (ValueError, TypeError):
            data = {"subject": "邮件草稿", "body": target.content[:500]}

        add_items = args.get("add_checklist_items") or []
        if add_items:
            from datetime import datetime

            from core.models.orm import CaseChecklist

            existing_items = (
                db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
            )
            existing_lookup = {
                (it.item_name, (it.source_ref or "").strip()): it
                for it in existing_items
            }
            added_any = False
            for it in add_items:
                if isinstance(it, dict):
                    name = str(it.get("name_zh") or it.get("item_name") or "").strip()
                    dl = it.get("deadline")
                    s_ref = it.get("source_ref") or f"flow:{flow_key}"
                else:
                    name = str(getattr(it, "name_zh", "") or "").strip()
                    dl = getattr(it, "deadline", None)
                    s_ref = getattr(it, "source_ref", None) or f"flow:{flow_key}"
                if not name:
                    continue
                if isinstance(dl, str):
                    try:
                        dl = datetime.fromisoformat(dl)
                    except Exception:  # noqa: BLE001
                        dl = None
                key = (name, (s_ref or "").strip())
                if key in existing_lookup:
                    continue
                row = CaseChecklist(
                    case_id=case_id,
                    item_name=name,
                    category="condition",
                    is_required=True,
                    status="pending",
                    phase="condition",
                    deadline=dl,
                    source_ref=s_ref,
                    item_kind="document",
                )
                db.add(row)
                existing_lookup[key] = row
                added_any = True
            if added_any:
                db.commit()

        from core.context.accumulator import append_context_event

        event = append_context_event(
            case_id=case_id,
            source_type="flow:draft_email",
            content=f"邮件草稿确认：{data.get('subject', '')}",
            db=db,
            track=track,
            trigger_distill=True,
        )
        task_id = None
        if args.get("create_todo"):
            from core.task_engine.dispatcher import create_task

            todo = create_task(
                case_id=case_id,
                task_type="FOLLOWUP_TODO",
                source_channel="manual",
                title=str(data.get("subject", "邮件草稿"))[:120],
                context={"flow_key": flow_key, "draft_message_id": target.id, "branch_label": branch_label},
                db=db,
            )
            task_id = todo.id
        target_branch = target.branch_label or branch_label
        version = str(data.get("version", "V?"))
        draft = {
            "subject": data.get("subject", ""),
            "body": data.get("body", ""),
            "body_cn": data.get("body_cn", ""),
            "version": version,
            "branch_label": target_branch,
            "message_id": target.id,
        }
        return {
            "reply": f"草稿已确认：{data.get('subject', '')}",
            "draft": draft,
            "versions": _branch_versions(case_id, target_branch, db),
            "status": "confirmed",
            "event_id": event.id,
            "task_id": task_id,
        }

    previous = parent.content if parent else ""
    draft = _gen_draft(case_id, flow_key, recipient_hint, previous, db, message=message, panorama=panorama)
    version = _next_version(db, case_id, branch_label)
    content = json.dumps({**draft, "intent": flow_key, "version": version, "branch": branch_label}, ensure_ascii=False)
    msg = _append_message(db, case_id, session_id, content, parent.id if parent else None, branch_label)
    draft_out = {
        "subject": draft["subject"],
        "body": draft["body"],
        "body_cn": draft.get("body_cn", ""),
        "version": version,
        "branch_label": branch_label,
        "message_id": msg.id,
    }
    if action == "branch":
        reply = f"已生成分支 {branch_label} 草稿 {version}，主题：{draft['subject']}"
    elif action == "version":
        reply = f"已按你的指令更新为 {version} 草稿，主题：{draft['subject']}"
    else:
        reply = f"已生成 {version} 草稿，主题：{draft['subject']}"
    return {
        "reply": reply,
        "draft": draft_out,
        "versions": _branch_versions(case_id, branch_label, db),
        "status": "draft",
        "event_id": None,
        "task_id": None,
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