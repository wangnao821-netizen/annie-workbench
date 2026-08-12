"""EmailDraftGenerator — 邮件草稿生成服务。

Phase 2D-1: 邮件生成闭环（Layer 6）

三种生成模式：
1. generate_from_advisor(action_id, db) — 从 Advisor Action 提取草稿，不调 LLM
2. generate_fresh(case_id, draft_type, context, db) — 独立生成，走 desensitize → LLM → rehydrate
3. regenerate(draft_id, instructions, db) — 用户指令重新生成

Red Line compliance:
- 不自动发送邮件（只存 SQLite，status 为 draft）
- 独立生成走 desensitize → LLM → rehydrate
- Broker Notes 强制英文
- 幂等：同一 Action 不重复生成
- 不写客户文件夹
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy.orm import Session

from core.config import get_config
from core.pii.gateway import desensitize, rehydrate
from core.ai.gateway import ApiGateway
from core.drafts.bilingual import build_bilingual_body, split_bilingual_body
from core.logger import get_logger
from core.models.orm import Action, Case, EmailDraft
from core.models.types import DesensitizedText

logger = get_logger(__name__)

# ── 模板路径 ─────────────────────────────────────────────────────────
TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "prompts" / "email_templates"

# ── 草稿类型 → 模板文件映射 ──────────────────────────────────────────
_TEMPLATE_MAP: dict[str, str] = {
    "reply": "reply_bank.txt",
    "reply_client": "reply_client.txt",
    "broker_notes": "broker_notes.txt",
    "follow_up": "follow_up_bank.txt",
    "progress_update": "progress_update.txt",
    "settlement": "settlement_notice.txt",
}

# ── Advisor Action type → draft_type 映射 ────────────────────────────
_ACTION_TYPE_TO_DRAFT: dict[str, str] = {
    "advisor_reply": "reply",
    "advisor_notes": "broker_notes",
    "followup_draft": "follow_up",
}


def _load_template(draft_type: str) -> str:
    """Load prompt template for given draft type.

    Args:
        draft_type: One of reply/broker_notes/follow_up/progress_update/settlement.

    Returns:
        Template text content.

    Raises:
        FileNotFoundError: If template file doesn't exist.
    """
    filename = _TEMPLATE_MAP.get(draft_type, "reply_bank.txt")
    path = TEMPLATES_DIR / filename
    return path.read_text(encoding="utf-8")


def _call_draft_llm(prompt: str, system_prompt: str) -> str:
    """Call LLM for draft generation. Single external API contact point.

    This function is patched in tests to avoid real API calls.

    Args:
        prompt: Full desensitized prompt text.
        system_prompt: System-level instruction.

    Returns:
        Raw LLM response text (the draft body).
    """
    config = get_config()
    gateway = ApiGateway(config)

    result = gateway.call_llm(
        text=DesensitizedText(prompt),
        prompt_template=prompt,
        system_prompt=system_prompt,
    )

    return result.response_text.strip()


def generate_from_advisor(action_id: int, db: Session) -> EmailDraft | None:
    """从 Advisor Action 生成草稿，不调 LLM。

    Advisor 已有 ai_suggestion 中的 email_reply_draft 或 broker_notes_draft，
    直接提取为 EmailDraft 记录。

    Args:
        action_id: The Action.id to extract draft from.
        db: SQLAlchemy session.

    Returns:
        Created EmailDraft, or None if action not found or unsupported.
    """
    action = db.query(Action).filter(Action.id == action_id).first()
    if action is None:
        logger.warning("generate_from_advisor: Action %d not found", action_id)
        return None

    # FOLLOWUP_DRAFT：ai_suggestion 是纯文本催件文案（不走 JSON 解析）
    if action.type == "followup_draft":
        existing = (
            db.query(EmailDraft)
            .filter(EmailDraft.source_action_id == action_id)
            .first()
        )
        if existing is not None:
            return existing
        body = (action.ai_suggestion or "请协助提供缺失材料。").strip()
        subject = f"【补件提醒】{action.title.replace('催件：', '').strip()}"
        draft = EmailDraft(
            case_id=action.case_id,
            draft_type="follow_up",
            subject=subject,
            body=body,
            language="zh",
            source_action_id=action_id,
            status="draft",
        )
        db.add(draft)
        db.commit()
        return draft

    draft_type = _ACTION_TYPE_TO_DRAFT.get(action.type)
    if draft_type is None:
        logger.debug(
            "generate_from_advisor: Action type '%s' not supported for draft generation",
            action.type,
        )
        return None

    # ── 幂等检查：同一 Action 不重复生成 ──
    existing = (
        db.query(EmailDraft)
        .filter(EmailDraft.source_action_id == action_id)
        .first()
    )
    if existing is not None:
        logger.debug("Draft already exists for action %d, returning existing", action_id)
        return existing

    # ── 解析 ai_suggestion JSON ──
    try:
        suggestion = json.loads(action.ai_suggestion) if action.ai_suggestion else {}
    except (json.JSONDecodeError, TypeError):
        logger.warning("Action %d has invalid ai_suggestion JSON", action_id)
        return None

    # 提取草稿正文
    if draft_type == "reply":
        body = suggestion.get("email_reply_draft", "")
    elif draft_type == "broker_notes":
        body = suggestion.get("broker_notes_draft", "")
    else:
        body = ""

    if not body:
        logger.warning("Action %d ai_suggestion has no draft content", action_id)
        return None

    # ── Rehydrate（Advisor 可能已脱敏存储） ──
    body = rehydrate(body, action.case_id, db)

    source_msg_id = suggestion.get("source_msg_id")

    # ── 确定语言 ──
    language = "en"  # Broker Notes 强制英文
    if draft_type == "reply":
        case = db.query(Case).filter(Case.id == action.case_id).first()
        if case and case.preferred_language:
            language = case.preferred_language

    # ── 创建草稿 ──
    draft = EmailDraft(
        case_id=action.case_id,
        draft_type=draft_type,
        subject=None,
        to_email=None,
        body=body,
        language=language,
        source_action_id=action_id,
        source_msg_id=source_msg_id,
        status="draft",
    )
    db.add(draft)
    db.commit()

    logger.info(
        "Generated draft from action %d for case %s (type=%s)",
        action_id, action.case_id, draft_type,
    )
    return draft


def generate_fresh(
    case_id: str,
    draft_type: str,
    context: str,
    db: Session,
    vera_instruction: str = "",
) -> EmailDraft | None:
    """独立生成草稿 — 走 desensitize → LLM → rehydrate。

    Args:
        case_id: Target case ID.
        draft_type: One of reply/broker_notes/follow_up/progress_update/settlement.
        context: Additional context text (case info, email content, etc.).
        db: SQLAlchemy session.
        vera_instruction: Optional specific instruction from Vera.

    Returns:
        Created EmailDraft, or None if generation fails.
    """
    # ── 加载模板 ──
    try:
        template = _load_template(draft_type)
    except FileNotFoundError:
        logger.error("Template not found for draft_type: %s", draft_type)
        return None

    # ── 获取案件信息 ──
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        logger.warning("generate_fresh: case %s not found", case_id)
        return None

    # ── 确定语言（Broker Notes 强制英文）──
    language = "en"
    if draft_type not in ("broker_notes",):
        language = case.preferred_language or "en"

    # ── 构建 prompt（简单占位符替换）──
    prompt = template
    prompt = prompt.replace("{case_info}", f"Case: {case.client_name}, {case.lender or 'TBD'}, Stage: {case.stage}")
    prompt = prompt.replace("{language}", language)
    prompt = prompt.replace("{broker_name}", case.broker_name or "Brandon")
    prompt = prompt.replace("{lender}", case.lender or "TBD")
    prompt = prompt.replace("{vera_instruction}", vera_instruction or "无特别指示")

    # 补充可选占位符（部分模板有但不一定用到）
    optional_placeholders = {
        "{original_subject}": "",
        "{original_body}": "",
        "{reference}": case.id,
        "{loan_amount}": str(case.loan_amount or ""),
        "{lvr}": str(case.lvr or ""),
        "{employment_type}": case.employment_type or "",
        "{loan_purpose}": case.purpose or "",
        "{key_strengths}": "",
        "{mitigating_factors}": "",
        "{days_waiting}": "",
        "{outstanding_items}": "",
        "{deadline}": "",
        "{current_stage}": case.stage or "",
        "{recent_progress}": "",
        "{next_steps}": "",
        "{settlement_date}": "",
        "{solicitor}": "",
    }
    for placeholder, default in optional_placeholders.items():
        prompt = prompt.replace(placeholder, default)

    # 追加上下文
    if context:
        prompt += f"\n\nAdditional context:\n{context}"

    # ── 组装上下文与 System Prompt ──
    from core.ai.context_builder import assemble_context
    assembled_ctx = assemble_context(case_id, "email_draft", db, extra_data=context)

    system_prompt = (
        "You are an expert Australian mortgage broker assistant. "
        "Generate the requested email draft. Output ONLY the email body text.\n\n"
        f"Case Brain:\n{assembled_ctx.case_brain}\n\n"
        f"Team Experience:\n{assembled_ctx.team_experience}"
    )

    # ── 脱敏 ──
    safe_prompt = desensitize(prompt, case_id, db)

    try:
        raw_body = _call_draft_llm(safe_prompt, system_prompt)
    except Exception as exc:
        logger.warning("Draft LLM call failed for case %s: %s", case_id, exc)
        return None

    # ── 还原 PII ──
    body = rehydrate(raw_body, case_id, db)

    # ── 创建草稿 ──
    draft = EmailDraft(
        case_id=case_id,
        draft_type=draft_type,
        subject=None,
        to_email=None,
        body=body,
        language=language,
        source_action_id=None,
        source_msg_id=None,
        status="draft",
    )
    db.add(draft)
    db.commit()

    logger.info("Generated fresh draft for case %s (type=%s)", case_id, draft_type)
    return draft


def regenerate(
    draft_id: int,
    instructions: str,
    db: Session,
) -> EmailDraft | None:
    """基于用户指令重新生成草稿。

    保留原始 draft_type 和 case_id，用新的 instructions 重新调 LLM。
    原草稿标记为 discarded，创建新草稿。

    Args:
        draft_id: Existing draft to regenerate.
        instructions: Vera's new instructions for the regeneration.
        db: SQLAlchemy session.

    Returns:
        New EmailDraft, or None if regeneration fails.
    """
    old_draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if old_draft is None:
        logger.warning("regenerate: draft %d not found", draft_id)
        return None

    # ── 标记旧草稿为 discarded ──
    old_draft.status = "discarded"
    db.commit()

    # ── 重新生成 ──
    context = f"Previous draft:\n{old_draft.body}\n\nUser instructions for revision:\n{instructions}"

    new_draft = generate_fresh(
        case_id=old_draft.case_id,
        draft_type=old_draft.draft_type,
        context=context,
        db=db,
        vera_instruction=instructions,
    )

    if new_draft is not None:
        # 继承原始来源信息
        new_draft.source_action_id = old_draft.source_action_id
        new_draft.source_msg_id = old_draft.source_msg_id
        db.commit()

    return new_draft


def _clean_json(text: str) -> str:
    """去掉 LLM 输出里的 Markdown 代码块围栏，只留 JSON 本体。"""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def generate_bilingual_reply(
    case_id: str,
    context: str,
    db: Session,
    vera_instruction: str = "",
    source_action_id: int | None = None,
    source_msg_id: str | None = None,
) -> EmailDraft | None:
    """生成双文回复草稿（中文思路 + 英文正文），正文按双文约定拼装。

    方案 A 邮件工作台用：Vera 在右侧直接看到中文思路与英文正文，
    可编辑后存入草稿箱。走 desensitize → LLM → rehydrate。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None:
        logger.warning("generate_bilingual_reply: case %s not found", case_id)
        return None

    from core.ai.context_builder import assemble_context

    assembled_ctx = assemble_context(case_id, "email_draft", db, extra_data=context)
    prompt = (
        "你是澳洲房贷经纪人助手，生成一封双文邮件回复草稿（已脱敏）。\n"
        '输出 JSON 对象（不要 Markdown 代码块）：{"subject": "英文邮件主题（简短）",'
        ' "zh": "中文思路（给 Vera 看，说明回复要点与引用的事实）",'
        ' "en": "英文正文（给收件人的完整草稿）"}\n\n'
        f"案件信息：客户 {case.client_name} / 银行 {case.lender or 'TBD'} / 阶段 {case.stage}\n"
        f"邮件上下文：{context or '（无）'}\n"
        f"Vera 指示：{vera_instruction or '无'}\n\n"
        "规则：\n"
        "- 只根据邮件上下文与案件事实回复，禁止编造客户情况或材料。\n"
        "- 语气专业、友好、克制；en 用英文正式语气。\n"
        "- zh 用中文写给 Vera，说明为什么这样回复。"
    )
    safe_prompt = desensitize(prompt, case_id, db)
    system_prompt = (
        "You are an expert Australian mortgage broker assistant that outputs clean JSON.\n\n"
        f"Case Brain:\n{assembled_ctx.case_brain}\n\n"
        f"Team Experience:\n{assembled_ctx.team_experience}"
    )

    try:
        raw_body = _call_draft_llm(safe_prompt, system_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Bilingual reply LLM call failed for case %s: %s", case_id, exc)
        return None

    try:
        payload = json.loads(_clean_json(raw_body))
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Bilingual reply LLM returned invalid JSON for case %s: %s", case_id, raw_body[:200])
        return None

    subject = rehydrate(str(payload.get("subject", "")), case_id, db)
    zh = rehydrate(str(payload.get("zh", "")), case_id, db)
    en = rehydrate(str(payload.get("en", "")), case_id, db)
    if not en.strip():
        logger.warning("Bilingual reply LLM returned empty English body for case %s", case_id)
        return None

    draft = EmailDraft(
        case_id=case_id,
        draft_type="reply",
        subject=subject,
        to_email=None,
        body=build_bilingual_body(zh, en),
        language="en",
        source_action_id=source_action_id,
        source_msg_id=source_msg_id,
        status="draft",
    )
    db.add(draft)
    db.commit()
    logger.info("Generated bilingual reply draft %d for case %s", draft.id, case_id)
    return draft


def rewrite_reply_draft(
    draft_id: int,
    instruction: str,
    db: Session,
) -> EmailDraft | None:
    """按 Vera 指示润色/重写双文草稿（语气重写、翻译、精简等）。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if draft is None:
        return None
    if draft.status != "draft":
        logger.warning("rewrite_reply_draft: draft %d is not editable (status=%s)", draft_id, draft.status)
        return None

    zh, en = split_bilingual_body(draft.body or "")
    case = db.query(Case).filter(Case.id == draft.case_id).first()
    if case is None:
        return None

    prompt = (
        "你是澳洲房贷经纪人助手，帮 Vera 润色一封双文邮件草稿（已脱敏）。\n"
        '输出 JSON 对象（不要 Markdown 代码块）：{"zh": "中文思路（更新后）", "en": "英文正文（更新后）"}\n\n'
        f"【Vera 润色指示】{instruction or '无'}\n\n"
        f"【当前中文思路】\n{zh or '（无）'}\n\n"
        f"【当前英文正文】\n{en or '（无）'}\n\n"
        "规则：\n"
        "- 只润色文字表达，不得新增或编造事实、材料、客户情况。\n"
        "- 保持原意与关键事实不变；按指示调整语气/长度/结构。\n"
        "- en 用英文正式语气，zh 用中文写给 Vera。"
    )
    safe_prompt = desensitize(prompt, draft.case_id, db)
    try:
        raw_body = _call_draft_llm(
            safe_prompt,
            "You are an expert Australian mortgage broker assistant that outputs clean JSON.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Rewrite LLM call failed for draft %s: %s", draft_id, exc)
        return None

    try:
        payload = json.loads(_clean_json(raw_body))
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Rewrite LLM returned invalid JSON for draft %s: %s", draft_id, raw_body[:200])
        return None

    new_zh = rehydrate(str(payload.get("zh", zh)), draft.case_id, db)
    new_en = rehydrate(str(payload.get("en", en)), draft.case_id, db)
    if not new_en.strip():
        logger.warning("Rewrite returned empty English body for draft %s", draft_id)
        return None

    draft.body = build_bilingual_body(new_zh, new_en)
    db.commit()
    logger.info("Rewrote draft %d", draft_id)
    return draft