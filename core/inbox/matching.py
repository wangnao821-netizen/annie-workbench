"""Inbox service — business logic for the global inbox.

Handles:
- Parsing .email_meta.json files from _Inbox/ directories
- Auto-matching emails to existing cases (by sender email, then subject)
- Creating InboxMessage records

Red Line compliance:
- Only reads from client folders, never writes.
- No PII sent externally (all processing is local).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Action, Case, InboxMessage

logger = get_logger(__name__)


def generate_inbox_id() -> str:
    """Generate a unique inbox message ID.

    Returns:
        A string like 'INBOX-A1B2C3D4'.
    """
    return f"INBOX-{uuid.uuid4().hex[:8].upper()}"


def parse_email_meta(meta_path: Path) -> dict[str, Any] | None:
    """Parse a .email_meta.json file into a structured dict.

    Expected JSON format::

        {
            "subject": "RE: John Smith Loan Application",
            "sender_email": "john@example.com",
            "sender_name": "John Smith",
            "received_at": "2026-07-10T14:30:00+10:00",
            "body_preview": "Hi Brandon, please find attached...",
            "attachments": ["payslip_june.pdf", "bank_statement.pdf"]
        }

    Args:
        meta_path: Path to the .email_meta.json file.

    Returns:
        Parsed dict or None if parsing fails.
    """
    try:
        with open(meta_path, encoding="utf-8-sig") as f:
            data = json.load(f)

        # Validate required fields
        if not data.get("subject") or not data.get("sender_email"):
            logger.warning("Invalid email meta (missing subject/sender_email): %s", meta_path)
            return None

        return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to parse email meta %s: %s", meta_path, exc)
        return None



# ── 终态列表 — 统一从 constants 导入 ──
from core.constants import TERMINAL_STAGES


@dataclass
class MatchResult:
    """四招匹配的完整结果。

    Attributes:
        matched_cases: 命中的活跃案件列表。
        match_method: 命中的匹配策略。
        confidence: 匹配置信度 0.0-1.0。
        scenario: 场景标识 A/B/C/D/E/F。
        is_returning_client: 是否为老客户回来（已结案客户有新邮件）。
        archived_cases: 匹配到的已结案案件。
        ai_extracted: 第四招 AI 提取的结构化字段（需单独调用）。
    """

    matched_cases: list[Case]
    match_method: str  # "email" | "name_subject" | "body" | "ai" | "none"
    confidence: float
    scenario: str  # "A" | "B" | "C" | "D" | "E" | "F"
    is_returning_client: bool = False
    archived_cases: list[Case] = field(default_factory=list)
    ai_extracted: dict[str, Any] | None = None


def _determine_scenario(
    active_matches: list[Case],
    archived_matches: list[Case],
) -> str:
    """Determine scenario based on match results.

    A: 匹配到1个活跃案件
    B: 匹配到同客户的2+活跃案件
    C: 匹配到已结案客户（无活跃案件）
    D: (由AI提取判定) 老客户回来
    E: (由AI提取判定) 全新客户
    F: 四招都没中
    """
    if len(active_matches) == 1:
        return "A"
    if len(active_matches) >= 2:
        return "B"
    if archived_matches:
        return "C"
    return "F"


def match_email_to_case(
    sender_email: str,
    sender_name: str,
    subject: str,
    body_preview: str,
    db: Session,
    *,
    use_ai: bool = False,
) -> MatchResult:
    """四招匹配逻辑（按优先级执行）。

    第一招：发件人邮箱精确匹配 Case.client_email（排除终态）
    第二招：发件人名/邮件标题匹配 Case.client_name（忽略大小写）
    第三招：body_preview 前500字匹配客户名
    第四招：调 AI 提取新客户信息（仅 use_ai=True 时执行，由 inbox_ai_extractor 处理）

    前三招是纯 DB 查询，零成本，watcher 发现邮件时自动执行。
    第四招需要 Vera 在前端手动点击"AI 分析"按钮触发。

    Args:
        sender_email: 发件人邮箱。
        sender_name: 发件人显示名。
        subject: 邮件标题。
        body_preview: 邮件正文前500字。
        db: SQLAlchemy session.
        use_ai: 是否启用第四招 AI 分析（默认 False）。

    Returns:
        MatchResult with scenario and matched cases.
    """
    active_matches: list[Case] = []
    archived_matches: list[Case] = []
    match_method = "none"
    confidence = 0.0

    # ── 第一招：发件人邮箱精确匹配 ──
    if sender_email:
        email_matches = (
            db.query(Case)
            .filter(Case.client_email == sender_email)
            .all()
        )
        for c in email_matches:
            if c.stage in TERMINAL_STAGES:
                archived_matches.append(c)
            else:
                active_matches.append(c)

        if active_matches:
            match_method = "email"
            confidence = 0.95
            scenario = _determine_scenario(active_matches, archived_matches)
            return MatchResult(
                matched_cases=active_matches,
                match_method=match_method,
                confidence=confidence,
                scenario=scenario,
                is_returning_client=bool(archived_matches),
                archived_cases=archived_matches,
            )

    # ── 第 1.5 招：标题中含 CASE-XXXXXXXX 模式 → 直接查 DB ──
    import re
    case_id_match = re.search(r"CASE-[A-F0-9]{8}", subject, re.IGNORECASE)
    if case_id_match:
        potential_id = case_id_match.group(0).upper()
        case_by_id = db.query(Case).filter(Case.id == potential_id).first()
        if case_by_id:
            if case_by_id.stage in TERMINAL_STAGES:
                archived_matches.append(case_by_id)
            else:
                return MatchResult(
                    matched_cases=[case_by_id],
                    match_method="subject",
                    confidence=0.95,
                    scenario="A",
                    is_returning_client=False,
                    archived_cases=[],
                )


    # ── 第 1.6 招：银行案件号（lender_ref）精确匹配 ──
    potential_refs = set()
    for text_to_scan in [subject, (body_preview or "")[:500]]:
        if not text_to_scan:
            continue
        # 匹配包含连字符的案号，如: CBA-123456, ORDE-99281, APP-88123 等
        found = re.findall(r"\b([A-Z]{2,10}-[\w\d]+)\b", text_to_scan.upper())
        potential_refs.update(found)
        # 匹配 6 到 12 位的纯数字案号
        numbers = re.findall(r"\b(\d{6,12})\b", text_to_scan)
        potential_refs.update(numbers)

    if potential_refs:
        ref_matches = (
            db.query(Case)
            .filter(Case.lender_ref.in_(list(potential_refs)))
            .all()
        )
        active_ref_matches = [c for c in ref_matches if c.stage not in TERMINAL_STAGES]
        archived_ref_matches = [c for c in ref_matches if c.stage in TERMINAL_STAGES]

        if active_ref_matches:
            return MatchResult(
                matched_cases=active_ref_matches,
                match_method="lender_ref",
                confidence=0.98,
                scenario=_determine_scenario(active_ref_matches, archived_ref_matches),
                is_returning_client=bool(archived_ref_matches),
                archived_cases=archived_ref_matches,
            )

    # ── 第二招：发件人名字 / 邮件标题匹配客户名 ──
    all_cases = db.query(Case).all()
    active_cases = [c for c in all_cases if c.stage not in TERMINAL_STAGES]
    archived_cases_all = [c for c in all_cases if c.stage in TERMINAL_STAGES]

    name_matches: set[str] = set()  # case IDs to deduplicate

    for case in active_cases:
        if not case.client_name:
            continue
        client_lower = case.client_name.lower()
        # Check in sender_name
        if sender_name and client_lower in sender_name.lower() or client_lower in subject.lower():
            active_matches.append(case)
            name_matches.add(case.id)

    # Also check archived cases for scenario C
    for case in archived_cases_all:
        if not case.client_name:
            continue
        client_lower = case.client_name.lower()
        if sender_name and client_lower in sender_name.lower() or client_lower in subject.lower():
            archived_matches.append(case)

    if active_matches:
        match_method = "name_subject"
        confidence = 0.75
        scenario = _determine_scenario(active_matches, archived_matches)
        return MatchResult(
            matched_cases=active_matches,
            match_method=match_method,
            confidence=confidence,
            scenario=scenario,
            is_returning_client=bool(archived_matches),
            archived_cases=archived_matches,
        )

    # ── 第三招：邮件正文匹配客户名 ──
    body_text = (body_preview or "")[:500].lower()
    if body_text:
        for case in active_cases:
            if not case.client_name or case.id in name_matches:
                continue
            if case.client_name.lower() in body_text:
                active_matches.append(case)

        for case in archived_cases_all:
            if not case.client_name:
                continue
            if case.client_name.lower() in body_text:
                if case not in archived_matches:
                    archived_matches.append(case)

    if active_matches:
        match_method = "body"
        confidence = 0.55
        scenario = _determine_scenario(active_matches, archived_matches)
        return MatchResult(
            matched_cases=active_matches,
            match_method=match_method,
            confidence=confidence,
            scenario=scenario,
            is_returning_client=bool(archived_matches),
            archived_cases=archived_matches,
        )

    # 如果只匹配到已结案案件（没有活跃的）→ 场景 C
    if archived_matches:
        return MatchResult(
            matched_cases=[],
            match_method="name_subject" if not body_text else "body",
            confidence=0.60,
            scenario="C",
            is_returning_client=True,
            archived_cases=archived_matches,
        )

    # ── 第四招：AI 提取（需 Vera 手动触发）──
    if use_ai:
        try:
            from core.inbox.extractor import extract_lead_from_email
            ai_result = extract_lead_from_email(subject, body_preview, "system", db)
            if ai_result.has_lead:
                # Check if AI found a returning client
                if ai_result.client_name:
                    returning = (
                        db.query(Case)
                        .filter(Case.client_name == ai_result.client_name)
                        .all()
                    )
                    if returning:
                        archived_from_ai = [c for c in returning if c.stage in TERMINAL_STAGES]
                        return MatchResult(
                            matched_cases=[],
                            match_method="ai",
                            confidence=ai_result.confidence,
                            scenario="D" if archived_from_ai else "E",
                            is_returning_client=bool(archived_from_ai),
                            archived_cases=archived_from_ai,
                            ai_extracted={
                                "client_name": ai_result.client_name,
                                "loan_type": ai_result.loan_type,
                                "approx_amount": ai_result.approx_amount,
                                "contact_email": ai_result.contact_email,
                                "contact_phone": ai_result.contact_phone,
                                "source_hint": ai_result.source_hint,
                            },
                        )
                # Truly new client → scenario E
                return MatchResult(
                    matched_cases=[],
                    match_method="ai",
                    confidence=ai_result.confidence,
                    scenario="E",
                    ai_extracted={
                        "client_name": ai_result.client_name,
                        "loan_type": ai_result.loan_type,
                        "approx_amount": ai_result.approx_amount,
                        "contact_email": ai_result.contact_email,
                        "contact_phone": ai_result.contact_phone,
                        "source_hint": ai_result.source_hint,
                    },
                )
        except Exception as exc:
            logger.warning("AI extraction failed: %s (falling back to no match)", exc)

    # ── 四招都没中 → 场景 F ──
    return MatchResult(
        matched_cases=[],
        match_method="none",
        confidence=0.0,
        scenario="F",
    )


# ── 向后兼容：保留旧的 auto_match_case 签名 ──

def auto_match_case(
    sender_email: str,
    subject: str,
    db: Session,
) -> tuple[str | None, str, float]:
    """Legacy wrapper for backward compatibility.

    Calls match_email_to_case with minimal args and returns
    the old-style tuple (case_id, method, confidence).

    Args:
        sender_email: The email sender address.
        subject: The email subject line.
        db: SQLAlchemy session.

    Returns:
        Tuple of (case_id or None, match_method, confidence).
    """
    result = match_email_to_case(
        sender_email=sender_email,
        sender_name="",
        subject=subject,
        body_preview="",
        db=db,
        use_ai=False,
    )
    if result.matched_cases:
        return result.matched_cases[0].id, result.match_method, result.confidence
    return None, result.match_method, result.confidence


def _post_match_processing(
    matched_case_id: str,
    msg: InboxMessage,
    analysis_fields: dict[str, Any],
    ai_summary: str | None,
    sender_email: str,
    db: Session,
) -> None:
    """Handle timeline, stage progression, and advisor after inbox match."""
    subject = msg.subject or ""
    # ── 审计闭环：自动匹配也生成"邮件驱动的标准动作"（CLIENT_REPLY / classify），
    #    带 source_msg_id 列 → 今日行动展示邮件详情、完成后邮件状态回写归档。
    try:
        from core.inbox.action_factory import create_inbox_action

        existing = (
            db.query(Action)
            .filter(
                Action.case_id == matched_case_id,
                Action.status == "pending",
                Action.source_msg_id == str(msg.id),
            )
            .first()
        )
        if not existing:
            case = db.query(Case).filter(Case.id == matched_case_id).first()
            new_action = create_inbox_action(
                case_id=matched_case_id,
                case_client_name=case.client_name if case else "",
                subject=subject,
                sender_display=msg.sender_name or msg.sender_email,
                has_attachments=bool(msg.has_attachments),
                attachment_count=msg.attachment_count or 0,
                action_type_hint=analysis_fields.get("action_type"),
                ai_summary=ai_summary,
                source_msg_id=str(msg.id),
            )
            db.add(new_action)
            db.flush()
            db.commit()
    except Exception as exc:
        logger.warning("Auto inbox action creation failed (non-fatal): %s", exc)

    # ── 时间线记录 ──
    try:
        from core.events.timeline import record_event as _record_timeline
        _record_timeline(
            case_id=matched_case_id,
            event_type="email_received",
            title=f"收到邮件：{subject[:50]}",
            db=db,
            description=ai_summary,
            source_ref=str(msg.id),
            metadata={"sender": sender_email, "has_attachments": bool(msg.has_attachments)},
        )
    except Exception as exc:
        logger.warning("Timeline record failed (non-fatal): %s", exc)

    # ── 阶段推进评估 ──
    if analysis_fields.get("stage_signal"):
        try:
            from core.case_engine.progression import evaluate_stage_signal
            evaluate_stage_signal(
                case_id=matched_case_id,
                stage_signal=analysis_fields["stage_signal"],
                inbox_msg_id=str(msg.id),
                db=db,
            )
        except Exception as exc:
            logger.warning("Stage signal evaluation failed (non-fatal): %s", exc)

    # ── 案件全局 AI 顾问 ──
    if analysis_fields.get("stage_signal") or analysis_fields.get("action_type"):
        try:
            from core.ai.advisor import analyze_case
            analyze_case(
                case_id=matched_case_id,
                trigger_msg_id=str(msg.id),
                db=db,
            )
        except Exception as exc:
            logger.warning("Case Advisor failed (non-fatal): %s", exc)



def process_email_meta(meta_path: Path, db: Session) -> InboxMessage | None:
    """Parse an .email_meta.json and create an InboxMessage record.

    完整处理流程（需求一对齐）：
    1. 解析 metadata.json
    2. 去重检查（source_path + message_id）
    3. 紧急规则引擎检测
    4. 静音规则检查
    5. 发件人积分决策
    6. 四招案件匹配（仅 business/urgent 级别）
    7. 写入 inbox_messages 表

    Args:
        meta_path: Path to the metadata.json file.
        db: SQLAlchemy session.

    Returns:
        Created InboxMessage or None if parsing failed or duplicate.
    """
    data = parse_email_meta(meta_path)
    if not data:
        return None

    # Dedup check 1: source_path (backward compatible)
    existing = db.query(InboxMessage).filter(InboxMessage.source_path == str(meta_path)).first()
    if existing:
        logger.debug("Email meta already processed (source_path): %s", meta_path)
        return existing

    # Dedup check 2: message_id (Outlook EntryID — stronger guarantee)
    message_id = data.get("message_id") or data.get("entry_id")
    if message_id:
        existing_by_mid = db.query(InboxMessage).filter(InboxMessage.message_id == message_id).first()
        if existing_by_mid:
            logger.debug("Email meta already processed (message_id): %s", message_id)
            return existing_by_mid

    sender_email = data["sender_email"]
    sender_name = data.get("sender_name", "")
    subject = data["subject"]
    body_preview = (data.get("body_preview") or data.get("body", ""))[:500]
    attachments = data.get("attachments", [])
    account = data.get("account")

    # V4.1: 转发邮件 — 用真正发件人替换 Brandon 的转发信息
    original_email = data.get("original_sender_email", "").strip()
    original_name = data.get("original_sender_name", "").strip()
    forwarded_by = None

    # Fallback: 如果 VBA 没提供 original_sender 但 subject 带 FW:，从 body 解析
    if not original_email and subject.strip().upper().startswith(("FW:", "FWD:")):
        import re
        from_match = re.search(
            r"From:\s*(?:(.+?)\s*<([^>]+)>|([^\r\n<]+@[^\r\n>]+))",
            body_preview,
            re.IGNORECASE,
        )
        if from_match:
            original_name = (from_match.group(1) or "").strip()
            original_email = (from_match.group(2) or from_match.group(3) or "").strip()

    if original_email:
        # 记录转发者，用真正发件人作为展示/匹配依据
        forwarded_by = f"{sender_name} <{sender_email}>"
        sender_email = original_email
        sender_name = original_name or sender_email.split("@")[0]
        # 去掉 FW:/FWD: 前缀让 subject 更干净
        stripped = subject.strip()
        if stripped.upper().startswith("FW:"):
            subject = stripped[3:].strip()
        elif stripped.upper().startswith("FWD:"):
            subject = stripped[4:].strip()

    # ── Step 1: 紧急规则引擎检测（秒级，不调 AI）──
    from core.inbox.urgency import detect_urgency

    urgency = detect_urgency(subject, body_preview)

    # ── Step 2: 静音规则检查 ──
    from core.inbox.mute import is_muted

    muted = is_muted(sender_email, subject, None, db)

    # ── Step 3: 发件人积分决策 ──
    from core.inbox.score_engine import classify_by_score, get_sender_score

    score = get_sender_score(sender_email, db)
    score_level = classify_by_score(score)

    # 确定 level（优先级）
    # V4.1: 内部同事邮件识别（@everstones.com.au 域名）
    is_internal = sender_email.lower().endswith("@everstones.com.au")

    if urgency.is_urgent:
        level = "urgent"
    elif muted:
        level = "muted"
    elif is_internal:
        level = "internal"
    elif score_level:
        level = score_level
    else:
        # 积分不明确 → 默认标为 business
        # TODO(Phase 1C): 替换为 AI 分类调用 inbox_classifier
        level = "business"

    # ── Step 4: 四招案件匹配（business/urgent/internal 都执行）──
    matched_case_id = None
    match_result = None
    if level in ("urgent", "business", "internal"):
        match_result = match_email_to_case(
            sender_email=sender_email,
            sender_name=sender_name,
            subject=subject,
            body_preview=body_preview,
            db=db,
            use_ai=False,
        )

        # Determine case assignment based on scenario
        if match_result.scenario == "A":
            matched_case_id = match_result.matched_cases[0].id
        elif match_result.scenario == "B":
            sorted_cases = sorted(
                match_result.matched_cases,
                key=lambda c: c.created_at or datetime.min,
                reverse=True,
            )
            matched_case_id = sorted_cases[0].id

    # Determine initial status
    if level == "muted":
        status = "ignored"
    elif matched_case_id:
        status = "assigned"
    else:
        status = "pending"
    assigned_by = "ai" if matched_case_id else None

    # Parse received_at
    received_at_str = data.get("received_at") or data.get("received_time", "")
    try:
        received_at = datetime.fromisoformat(received_at_str)
    except (ValueError, TypeError):
        received_at = datetime.now(UTC)

    # ── Step 5: 统一 AI 分析（Phase 2A：替代原有的纯文本摘要）──
    ai_summary = None
    analysis_fields: dict[str, Any] = {}
    if body_preview and level != "muted":
        try:
            from core.inbox.ai_analyzer import analyze_email

            analysis = analyze_email(
                subject=subject,
                sender=f"{sender_name} <{sender_email}>" if sender_name else sender_email,
                body_preview=body_preview,
                case_id=matched_case_id,
                db=db,
            )
            ai_summary = analysis.summary
            # Phase 2A 新字段（仅在分析成功时填充）
            if not analysis.is_fallback:
                analysis_fields = {
                    "action_type": analysis.action_type,
                    "stage_signal": analysis.stage_signal,
                    "deadline": analysis.deadline,
                    "conditions_json": json.dumps(
                        analysis.conditions, ensure_ascii=False
                    ) if analysis.conditions else None,
                    "urgency_score": analysis.urgency_score,
                    "detected_client_name": analysis.client_name,
                    "lender_name": analysis.lender_name,
                    "application_ref": analysis.application_ref,
                    "suggested_level": analysis.suggested_level,
                    "ai_category": analysis.category,
                }
            logger.debug("AI analysis for: %s → fallback=%s", subject[:30], analysis.is_fallback)
        except Exception as e:
            logger.warning("AI analysis failed (non-blocking): %s", e)

    msg = InboxMessage(
        id=generate_inbox_id(),
        subject=subject,
        sender_email=sender_email,
        sender_name=sender_name or None,
        received_at=received_at,
        body_preview=body_preview,
        has_attachments=len(attachments) > 0,
        attachment_count=len(attachments),
        attachment_names=json.dumps(attachments, ensure_ascii=False) if attachments else None,
        matched_case_id=matched_case_id,
        match_method=match_result.match_method if match_result else "none",
        match_confidence=match_result.confidence if match_result and matched_case_id else None,
        match_scenario=match_result.scenario if match_result else None,
        status=status,
        assigned_by=assigned_by,
        source_path=str(meta_path),
        message_id=message_id,
        # 需求一新增字段
        level=level,
        account=account,
        urgent_pattern=urgency.matched_pattern if urgency.is_urgent else None,
        ai_summary=ai_summary,
        # Phase 2A 统一分析字段
        **analysis_fields,
    )
    db.add(msg)
    db.commit()

    # ── V5: 邮件匹配归案 → 一句话摘要标记 dirty（懒刷新）──
    if matched_case_id:
        try:
            from core.ai.case_summary import mark_case_summary_dirty

            mark_case_summary_dirty(matched_case_id, db)
        except Exception:
            logger.warning(
                "mark_case_summary_dirty failed for matched case %s", matched_case_id, exc_info=True
            )

    if level == "urgent":
        logger.info(
            "🔔 URGENT inbox message: %s (pattern=%s)",
            subject[:40], urgency.matched_pattern,
        )
    elif matched_case_id:
        logger.info(
            "Inbox message auto-matched: %s → %s (scenario=%s, method=%s, conf=%.2f, level=%s)",
            subject[:40], matched_case_id,
            match_result.scenario if match_result else "N/A",
            match_result.match_method if match_result else "N/A",
            match_result.confidence if match_result else 0.0,
            level,
        )
    else:
        logger.info(
            "Inbox message pending: %s (scenario=%s, level=%s)",
            subject[:40],
            match_result.scenario if match_result else "N/A",
            level,
        )

    # ── Post-match: 时间线 / 阶段推进 / 案件顾问 ──
    if matched_case_id:
        _post_match_processing(matched_case_id, msg, analysis_fields, ai_summary, sender_email, db)

    return msg

