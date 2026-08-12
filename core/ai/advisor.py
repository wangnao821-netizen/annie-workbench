"""Case Advisor — event-driven AI analysis for case management.

Triggered when an email with stage_signal or action_type is assigned to a case.
Aggregates full case context, sends to LLM, parses structured suggestions,
and creates Action cards for Vera to review.

Architecture:
    inbox_service → case_advisor.analyze_case()
        → assemble_context (unified 4-layer aggregation)
        → desensitize (PII removal)
        → LLM call (DeepSeek v4-flash)
        → parse JSON response
        → create Action records
        → rehydrate for display

Red Line compliance:
    - All context desensitized before LLM call
    - AI never directly modifies Case.stage
    - All suggestions → Action (pending), Vera confirms
    - pii_map never sent externally
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session

from core.ai.context_builder import AssembledContext, assemble_context
from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import Action, Case, InboxMessage
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

# ── Prompt template path ─────────────────────────────────────────────
PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "prompts" / "case_advisor.txt"


@dataclass
class AdvisorOutput:
    """Structured output from Case Advisor."""

    stage_advice: str | None = None
    os_advice: list[dict] | None = None
    broker_notes_draft: str | None = None
    email_reply_draft: str | None = None
    risk_alerts: list[str] | None = None
    checklist_update: list[dict] | None = None
    raw_json: dict = field(default_factory=dict)
    is_fallback: bool = False


def _load_prompt_template() -> str:
    """Load the advisor prompt template."""
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.error("Advisor prompt template not found: %s", PROMPT_PATH)
        raise


def _build_prompt(context: AssembledContext, trigger_email: str, event_type: str) -> str:
    """Fill the advisor prompt template with the unified context + trigger event."""
    template = _load_prompt_template()
    # Manual replacement instead of str.format() because the prompt
    # template contains JSON braces {} that would conflict with format().
    result = template
    result = result.replace("{role_prompt}", context.role_prompt)
    result = result.replace("{case_brain}", context.case_brain)
    result = result.replace("{live_data}", context.live_data)
    result = result.replace("{team_experience}", context.team_experience)
    result = result.replace("{trigger_email}", trigger_email)
    result = result.replace("{event_type}", event_type)
    return result


def _build_trigger_email_text(msg: InboxMessage) -> str:
    """Format a trigger inbox message for the advisor prompt."""
    parts = [
        f"主题: {msg.subject or ''}",
        f"发件人: {msg.sender_email or ''}",
        f"正文: {(msg.body_preview or '')[:400]}",
    ]
    if msg.ai_summary:
        parts.append(f"AI 摘要: {msg.ai_summary}")
    return "\n".join(parts)


def _build_event_type(msg: InboxMessage) -> str:
    """Derive the trigger event type from the inbox message analysis fields."""
    if msg.stage_signal:
        return f"阶段信号: {msg.stage_signal}"
    if msg.action_type:
        return f"动作类型: {msg.action_type}"
    return "通知/告知"


def _call_advisor_llm(context_text: str, event_type: str) -> dict:
    """Call LLM with desensitized context. Returns parsed JSON dict.

    This function is the single point of external API contact.
    It is patched in tests to avoid real API calls.

    Args:
        context_text: The full desensitized prompt text.
        event_type: Event type description (for logging).

    Returns:
        Parsed JSON dict from LLM response.
    """
    config = get_config()
    gateway = ApiGateway(config)

    system_prompt = (
        "You are an expert Australian mortgage broker assistant. "
        "Analyze the case context and provide structured JSON advice. "
        "Output ONLY valid JSON, no markdown, no code fences."
    )

    result = gateway.call_llm(
        text=DesensitizedText(context_text),
        prompt_template=context_text,
        system_prompt=system_prompt,
    )

    response_text = result.response_text.strip()

    # Strip markdown code fences if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        response_text = "\n".join(lines)

    return json.loads(response_text)


def _parse_advisor_response(raw: dict) -> AdvisorOutput:
    """Parse LLM JSON response into AdvisorOutput."""
    return AdvisorOutput(
        stage_advice=raw.get("stage_advice"),
        os_advice=raw.get("os_advice"),
        broker_notes_draft=raw.get("broker_notes_draft"),
        email_reply_draft=raw.get("email_reply_draft"),
        risk_alerts=raw.get("risk_alerts"),
        checklist_update=raw.get("checklist_update"),
        raw_json=raw,
    )


def _create_advisor_actions(
    case_id: str,
    trigger_msg_id: str,
    output: AdvisorOutput,
    db: Session,
) -> list[Action]:
    """Create Action cards from advisor output.

    Each non-null suggestion type becomes a separate Action for Vera.
    """
    actions_created: list[Action] = []

    # Stage advice → high priority action
    if output.stage_advice:
        action = Action(
            case_id=case_id,
            type="advisor_stage",
            title=f"AI 建议：{output.stage_advice[:40]}",
            status="pending",
            priority="high",
            # 审计闭环：source_msg_id 写列而非仅藏在 ai_suggestion，
            # 动作完成后才能把来源邮件状态回写（归档）并展示邮件详情
            source_msg_id=trigger_msg_id,
            ai_suggestion=json.dumps(
                {"stage_advice": output.stage_advice, "source_msg_id": trigger_msg_id},
                ensure_ascii=False,
            ),
        )
        db.add(action)
        actions_created.append(action)

    # OS advice → medium priority actions
    if output.os_advice:
        for item in output.os_advice[:5]:  # Max 5 OS advice items
            action = Action(
                case_id=case_id,
                type="advisor_os",
                title=f"OS 建议：{item.get('condition', '')[:30]}",
                status="pending",
                priority="medium",
                source_msg_id=trigger_msg_id,
                ai_suggestion=json.dumps(item, ensure_ascii=False),
            )
            db.add(action)
            actions_created.append(action)

    # Broker Notes draft → medium priority
    if output.broker_notes_draft:
        action = Action(
            case_id=case_id,
            type="advisor_notes",
            title="AI 拟: Broker Notes 初稿",
            status="pending",
            priority="medium",
            source_msg_id=trigger_msg_id,
            ai_suggestion=json.dumps(
                {"broker_notes_draft": output.broker_notes_draft, "source_msg_id": trigger_msg_id},
                ensure_ascii=False,
            ),
        )
        db.add(action)
        actions_created.append(action)

    # Email reply draft → medium priority
    if output.email_reply_draft:
        action = Action(
            case_id=case_id,
            type="advisor_reply",
            title="AI 拟: 邮件回复草稿",
            status="pending",
            priority="medium",
            source_msg_id=trigger_msg_id,
            ai_suggestion=json.dumps(
                {"email_reply_draft": output.email_reply_draft, "source_msg_id": trigger_msg_id},
                ensure_ascii=False,
            ),
        )
        db.add(action)
        actions_created.append(action)

    # Risk alerts → high priority
    if output.risk_alerts:
        action = Action(
            case_id=case_id,
            type="advisor_risk",
            title=f"⚠️ 风险提醒 ({len(output.risk_alerts)} 项)",
            status="pending",
            priority="high",
            source_msg_id=trigger_msg_id,
            ai_suggestion=json.dumps(
                {"risk_alerts": output.risk_alerts, "source_msg_id": trigger_msg_id},
                ensure_ascii=False,
            ),
        )
        db.add(action)
        actions_created.append(action)

    # Checklist update → medium priority
    if output.checklist_update:
        action = Action(
            case_id=case_id,
            type="advisor_checklist",
            title=f"AI 建议更新清单 ({len(output.checklist_update)} 项)",
            status="pending",
            priority="medium",
            source_msg_id=trigger_msg_id,
            ai_suggestion=json.dumps(
                {"checklist_update": output.checklist_update, "source_msg_id": trigger_msg_id},
                ensure_ascii=False,
            ),
        )
        db.add(action)
        actions_created.append(action)

    if actions_created:
        db.commit()
        logger.info(
            "Case Advisor created %d actions for case %s (trigger msg %s)",
            len(actions_created), case_id, trigger_msg_id,
        )

    return actions_created


def analyze_case(
    case_id: str,
    trigger_msg_id: str,
    db: Session,
) -> AdvisorOutput | None:
    """Event-driven case AI analysis.

    Triggered when an email with stage_signal or action_type is matched
    to a case. Aggregates full context, calls LLM, creates Actions.

    Args:
        case_id: The case to analyze.
        trigger_msg_id: The inbox message that triggered analysis.
        db: SQLAlchemy session.

    Returns:
        AdvisorOutput if analysis succeeded, None if skipped.
    """
    # ── Guard: empty case_id ──
    if not case_id:
        return None

    # ── Guard: trigger message must exist ──
    trigger_msg = db.query(InboxMessage).filter(InboxMessage.id == trigger_msg_id).first()
    if trigger_msg is None:
        logger.warning("Case Advisor: trigger message %s not found", trigger_msg_id)
        return None

    # ── Guard: must have a trigger signal or action (no signal → no AI) ──
    if not trigger_msg.stage_signal and not trigger_msg.action_type:
        logger.debug(
            "Case Advisor: message %s has no stage_signal/action_type, skipping",
            trigger_msg_id,
        )
        return None

    # ── Guard: case must exist ──
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        logger.warning("Case Advisor: case %s not found", case_id)
        return None

    # ── Step 1: Build context (unified assembly + trigger event) ──
    trigger_email_text = _build_trigger_email_text(trigger_msg)
    event_type = _build_event_type(trigger_msg)
    context = assemble_context(case_id, "case_advisor", db, extra_data=trigger_email_text)
    if context is None:
        return None

    # ── Step 2: Idempotency check ──
    existing = (
        db.query(Action)
        .filter(
            Action.case_id == case_id,
            Action.type.in_(["advisor_stage", "advisor_os", "advisor_notes",
                             "advisor_reply", "advisor_risk", "advisor_checklist"]),
            Action.ai_suggestion.contains(f'"source_msg_id": "{trigger_msg_id}"'),
        )
        .first()
    )
    if existing:
        logger.debug(
            "Case Advisor already processed msg %s for case %s, skipping",
            trigger_msg_id, case_id,
        )
        return None

    # ── Step 3: Build full prompt and desensitize ──
    full_prompt = _build_prompt(context, trigger_email_text, event_type)
    safe_prompt = desensitize(full_prompt, case_id, db)

    logger.info(
        "Case Advisor analyzing case %s (trigger msg %s, event: %s, context: %d chars)",
        case_id, trigger_msg_id, event_type, context.total_chars,
    )

    # ── Step 4: Call LLM ──
    try:
        raw_response = _call_advisor_llm(safe_prompt, event_type)
    except json.JSONDecodeError as exc:
        logger.warning(
            "Case Advisor: LLM returned invalid JSON for case %s: %s",
            case_id, exc,
        )
        return AdvisorOutput(is_fallback=True, raw_json={"error": str(exc)})
    except Exception as exc:  # noqa: BLE001 — 非致命：AI 失败不影响邮件/案件流程
        logger.warning(
            "Case Advisor: LLM call failed for case %s: %s",
            case_id, exc,
        )
        return AdvisorOutput(is_fallback=True, raw_json={"error": str(exc)})

    # ── Step 5: Parse response ──
    output = _parse_advisor_response(raw_response)

    # ── Step 6: Rehydrate text fields (restore PII for display) ──
    if output.stage_advice:
        output.stage_advice = rehydrate(output.stage_advice, case_id, db)
    if output.broker_notes_draft:
        output.broker_notes_draft = rehydrate(output.broker_notes_draft, case_id, db)
    if output.email_reply_draft:
        output.email_reply_draft = rehydrate(output.email_reply_draft, case_id, db)
    if output.risk_alerts:
        output.risk_alerts = [rehydrate(a, case_id, db) for a in output.risk_alerts]
    if output.os_advice:
        for item in output.os_advice:
            if "suggestion" in item:
                item["suggestion"] = rehydrate(item["suggestion"], case_id, db)
            if "reply_draft" in item:
                item["reply_draft"] = rehydrate(item["reply_draft"], case_id, db)

    # ── Step 7: Create Action cards ──
    _create_advisor_actions(case_id, trigger_msg_id, output, db)

    return output
