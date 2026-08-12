"""OS 攻坚工作台服务 — 银行 Outstanding Condition 深度攻坚。

四大能力：
1. build_os_dossier  — 一键案件全景（画像/清单/文件/时间线/历史 OS）
2. generate_os_plan  — 攻坚方案（中文分析 + 证据地图 + 三条合法策略）
3. generate_os_draft — 按策略生成双文回复草稿 + 诚信护栏校验
4. submit_os_reply   — 保存草稿 + 标记已回复 + 完成动作（支持撤回闭环）

合规红线：
- 所有出站文本先 desensitize，入站展示前 rehydrate；
- AI 只允许引用案件文件库中真实存在的文件，禁止编造材料、理由或客户情况；
- 材料真实无法提供时，草稿只能留占位符，原因必须由 Vera 补充；
- 不自动发送任何邮件，只生成草稿（Red Line #3）。
"""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from core.config import get_config
from core.ai.context_builder import assemble_context
from core.knowledge.memory import recall
from core.pii.gateway import desensitize, rehydrate
from core.ai.gateway import ApiGateway
from core.drafts.bilingual import build_bilingual_body
from core.events.bus import CaseEvent, CaseEventBus
from core.logger import get_logger
from core.models.orm import (
    Action,
    Case,
    CaseChecklist,
    CaseContextEvent,
    CaseFile,
    EmailDraft,
    KnowledgeEntry,
    OsCondition,
)
from core.models.types import DesensitizedText

logger = get_logger(__name__)

_RECEIVED_FILE_STATUS = ("APPROVED", "MANUALLY_CLASSIFIED", "VERIFIED")


def _call_plan_llm(prompt: str, system_prompt: str) -> str:
    """调用 LLM 的唯一出口（测试中 patch 此函数，避免真实 API 调用）。"""
    config = get_config()
    gateway = ApiGateway(config)
    result = gateway.call_llm(
        text=DesensitizedText(prompt),
        prompt_template=prompt,
        system_prompt=system_prompt,
    )
    return result.response_text.strip()


def _clean_json(text: str) -> str:
    """去掉 LLM 输出里的 Markdown 代码块围栏，只留 JSON 本体。"""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _linked_conditions(action: Action, db: Session) -> list[OsCondition]:
    """取该动作当前关联的 OS 条件：优先用 os_cond_ids，否则取案件全部 pending。"""
    if action.os_cond_ids:
        try:
            ids = json.loads(action.os_cond_ids or "[]")
        except (json.JSONDecodeError, TypeError):
            ids = []
        if ids:
            conds = db.query(OsCondition).filter(OsCondition.id.in_(ids)).all()
            if conds:
                return conds
    return (
        db.query(OsCondition)
        .filter(
            OsCondition.case_id == action.case_id,
            OsCondition.status == "pending",
        )
        .order_by(OsCondition.created_at.asc())
        .all()
    )


def build_os_dossier(case_id: str, db: Session) -> dict:
    """一键案件全景：把 Vera 做综合判断需要的所有上下文聚到一起。"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        return {}

    checklist_items = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id)
        .order_by(CaseChecklist.updated_at.desc())
        .all()
    )
    checklist_done = sum(1 for c in checklist_items if c.status in ("received", "waived"))

    files = (
        db.query(CaseFile)
        .filter(CaseFile.case_id == case_id)
        .order_by(CaseFile.confidence.desc())
        .all()
    )
    received_files = [
        {
            "id": f.id,
            "name": f.original_name,
            "type": f.assigned_type or "",
            "confidence": round(f.confidence or 0, 2),
            "status": f.status,
        }
        for f in files
        if (f.status or "").upper() in _RECEIVED_FILE_STATUS
    ]

    os_history = (
        db.query(OsCondition)
        .filter(OsCondition.case_id == case_id)
        .order_by(OsCondition.created_at.desc())
        .all()
    )
    timeline = (
        db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == case_id)
        .order_by(CaseContextEvent.created_at.desc())
        .limit(20)
        .all()
    )
    vera_notes = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.case_id == case_id,
            KnowledgeEntry.source == "vera_manual",
        )
        .order_by(KnowledgeEntry.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "caseInfo": {
            "clientName": case.client_name,
            "brokerName": case.broker_name,
            "stage": case.stage,
            "lender": case.lender,
            "loanAmount": case.loan_amount,
            "purpose": case.purpose,
            "employmentType": case.employment_type,
            "residency": case.residency,
            "preferredLanguage": case.preferred_language,
            "financeDeadline": case.finance_deadline.isoformat() if case.finance_deadline else None,
            "submissionPlatform": case.submission_platform,
        },
        "portrait": case.context_summary or "",
        "knowledgeSummary": case.knowledge_summary or "",
        "clientGoal": case.client_goal or "",
        "specialCircumstances": case.special_circumstances or "",
        "checklist": {
            "total": len(checklist_items),
            "done": checklist_done,
            "items": [
                {
                    "id": c.id,
                    "itemName": c.item_name,
                    "category": c.category,
                    "status": c.status,
                    "receivedFileId": c.received_file_id,
                }
                for c in checklist_items
            ],
        },
        "files": received_files,
        "osHistory": [
            {
                "id": o.id,
                "category": o.category,
                "status": o.status,
                "deadline": o.deadline.isoformat() if o.deadline else None,
                "rawText": o.raw_text,
                "aiSuggestion": o.ai_suggestion or "",
                "aiReplyDraft": o.ai_reply_draft or "",
                "createdAt": o.created_at.isoformat() if o.created_at else None,
            }
            for o in os_history
        ],
        "timeline": [
            {
                "sourceType": t.source_type,
                "content": t.content,
                "createdAt": t.created_at.isoformat() if t.created_at else None,
            }
            for t in timeline
        ],
        "veraNotes": [
            {
                "content": n.content,
                "createdAt": n.created_at.isoformat() if n.created_at else None,
            }
            for n in vera_notes
        ],
    }


def _evidence_inventory(case_id: str, db: Session) -> str:
    """把案件真实文件拼成证据清单（LLM 只能引用这些）。"""
    files = (
        db.query(CaseFile)
        .filter(CaseFile.case_id == case_id)
        .order_by(CaseFile.confidence.desc())
        .all()
    )
    lines = [
        f"- 文件: {f.original_name} (分类: {f.assigned_type or '未知'}, "
        f"状态: {f.status or '未知'}, 置信度: {round(f.confidence or 0, 2)})"
        for f in files
    ]
    return "\n".join(lines) if lines else "（案件文件库为空）"


def _checklist_inventory(case_id: str, db: Session) -> str:
    checklist = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
    lines = [f"- 清单项: {c.item_name} (状态: {c.status})" for c in checklist]
    return "\n".join(lines) if lines else "（无清单项）"


def generate_os_plan(action_id: int, db: Session) -> dict:
    """生成 OS 攻坚方案：中文分析 + 证据地图 + 三条合法策略。"""
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError("Action not found")

    conds = _linked_conditions(action, db)
    if not conds:
        conds = (
            db.query(OsCondition)
            .filter(OsCondition.case_id == action.case_id)
            .order_by(OsCondition.created_at.desc())
            .limit(1)
            .all()
        )
    if not conds:
        raise ValueError("该案件暂无 OS 条件可分析")

    conds_text = "\n".join(
        f"- 条件 {c.id}: {c.raw_text} (分类: {c.category})" for c in conds
    )
    files_info = _evidence_inventory(action.case_id, db)
    checklist_info = _checklist_inventory(action.case_id, db)

    try:
        recalled_facts = recall(
            action.case_id,
            "\n".join(c.raw_text for c in conds),
            db,
        )
    except Exception as exc:  # noqa: BLE001 — 记忆召回失败不阻断攻坚
        logger.warning("OS plan: memory recall failed: %s", exc)
        recalled_facts = ""

    assembled = assemble_context(action.case_id, "os_plan", db)
    safe_brain = desensitize(assembled.case_brain, action.case_id, db)
    safe_team_exp = desensitize(assembled.team_experience, action.case_id, db)
    safe_conds = desensitize(conds_text, action.case_id, db)
    safe_files = desensitize(files_info, action.case_id, db)
    safe_checklist = desensitize(checklist_info, action.case_id, db)
    safe_memory = desensitize(recalled_facts or "（无相关历史记忆）", action.case_id, db)

    prompt = (
        "你是一名澳洲房贷经纪人的资深处理助手，专门处理银行发来的 Outstanding Conditions（OS 补件/退单条件）。\n"
        "当前案件已脱敏。请基于以下材料输出攻坚方案。\n\n"
        f"【案件大脑与客户情况】\n{safe_brain}\n\n"
        f"【团队历史经验】\n{safe_team_exp}\n\n"
        f"【案件文件库（真实证据，只能引用这里的文件）】\n{safe_files}\n\n"
        f"【材料清单现状】\n{safe_checklist}\n\n"
        f"【当前待处理条件】\n{safe_conds}\n\n"
        f"【相关历史记忆】\n{safe_memory}\n\n"
        "任务：输出 JSON 对象（不要 Markdown 代码块，不要额外文字）：\n"
        '{"analysis": "中文分析：银行要什么、为什么卡、案件真实情况、Vera 需要判断的关键点",'
        ' "evidenceMap": [{"condition": "银行条件摘要", "matchedFiles": ["从案件文件库精确匹配的真实文件名，没有就空数组"],'
        ' "gap": "缺口说明", "alternatives": [{"title": "替代方案名", "files": ["用到的真实文件名"]}]}],'
        ' "strategies": ['
        '{"route": "satisfy", "title": "补件满足", "summary": "缺口小、直接补齐满足", "feasibility": "high", "risk": "风险说明"},'
        '{"route": "alternative", "title": "替代证据", "summary": "材料真实无法提供时，用案件里已有的其他真实文件作替代并说明替代逻辑", "feasibility": "high", "risk": "风险说明"},'
        '{"route": "escalation", "title": "政策与申诉", "summary": "条件超出银行政策或已有等效证明，申请 senior credit review / reconsideration，强调融资截止日压力", "feasibility": "high", "risk": "风险说明"}]}\n\n'
        "铁律：\n"
        "- 只能引用【案件文件库】里出现的真实文件名，禁止虚构、编造任何文件、材料、理由或客户情况。\n"
        "- 如果某材料真实无法提供，原因必须由 Vera 提供，AI 不得编造原因。\n"
        "- matchedFiles 和 alternatives.files 里的名字必须是上面文件库中真实存在的。"
    )

    try:
        resp_text = _call_plan_llm(
            prompt,
            "You are an expert Australian mortgage broker assistant that outputs clean JSON.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("OS plan LLM call failed for action %s: %s", action_id, exc)
        raise RuntimeError("攻坚方案生成失败，请稍后重试") from exc

    try:
        payload = json.loads(_clean_json(resp_text))
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("OS plan LLM returned invalid JSON for action %s: %s", action_id, resp_text[:300])
        raise RuntimeError("攻坚方案解析失败，请重试") from exc

    analysis = rehydrate(str(payload.get("analysis", "")), action.case_id, db)
    evidence_map = payload.get("evidenceMap") or []
    strategies = payload.get("strategies") or []

    for item in evidence_map:
        if not isinstance(item, dict):
            continue
        for key in ("condition", "gap"):
            if item.get(key):
                item[key] = rehydrate(str(item[key]), action.case_id, db)
        for alt in item.get("alternatives") or []:
            if isinstance(alt, dict) and alt.get("title"):
                alt["title"] = rehydrate(str(alt["title"]), action.case_id, db)
    for s in strategies:
        if not isinstance(s, dict):
            continue
        for key in ("title", "summary", "risk"):
            if s.get(key):
                s[key] = rehydrate(str(s[key]), action.case_id, db)

    for cond in conds:
        cond.ai_suggestion = analysis
    db.commit()

    return {
        "analysis": analysis,
        "evidenceMap": evidence_map,
        "strategies": strategies,
        "condIds": [c.id for c in conds],
    }


def _integrity_check(en_text: str, case_id: str, db: Session) -> list[dict]:
    """诚信护栏：草稿里每个“已提供/已附上”的声明都必须能在案件文件库里找到真实文件。"""
    results: list[dict] = []
    files = db.query(CaseFile).filter(CaseFile.case_id == case_id).all()
    names = {f.original_name.strip().lower() for f in files if f.original_name}
    lower_text = (en_text or "").lower()

    for f in files:
        name = (f.original_name or "").strip()
        if name and name.lower() in lower_text:
            results.append(
                {
                    "level": "ok",
                    "message": f"草稿引用了案件文件「{name}」，有真实证据支撑。",
                    "fileId": f.id,
                }
            )

    claim_keywords = (
        "attached",
        "enclosed",
        "please find",
        "we have provided",
        "we provided",
        "已附上",
        "已提供",
    )
    sentences = re.split(r"(?<=[.!?])\s+|\n", en_text or "")
    for sent in sentences:
        s_lower = sent.strip().lower()
        if not s_lower or not any(k in s_lower for k in claim_keywords):
            continue
        if not any(name in s_lower for name in names):
            results.append(
                {
                    "level": "warning",
                    "message": (
                        f"这句话声称已提供/已附上材料，但案件文件库找不到对应文件："
                        f"「{sent.strip()[:80]}…」。请核对并补上真实证据，或改写为待补充。"
                    ),
                }
            )

    if "请 Vera 填写真实原因" in (en_text or "") or "【" in (en_text or ""):
        results.append(
            {
                "level": "warning",
                "message": "草稿中仍留有待 Vera 补充真实原因的占位符，发送前必须补全，否则银行会追问。",
            }
        )

    if not results:
        results.append(
            {
                "level": "ok",
                "message": "草稿中未发现无依据的材料声明，诚信护栏通过。",
            }
        )
    return results


def _get_or_create_draft(action: Action, db: Session) -> EmailDraft:
    existing = (
        db.query(EmailDraft)
        .filter(EmailDraft.source_action_id == action.id)
        .order_by(EmailDraft.id.desc())
        .first()
    )
    if existing:
        return existing
    draft = EmailDraft(
        case_id=action.case_id,
        draft_type="os_reply",
        subject="",
        body="",
        language="en",
        source_action_id=action.id,
        source_msg_id=action.source_msg_id,
        status="draft",
    )
    db.add(draft)
    db.flush()
    return draft


def generate_os_draft(
    action_id: int,
    strategy: str = "",
    extra_instruction: str = "",
    db: Session | None = None,
) -> dict:
    """按策略生成双文回复草稿，并跑诚信护栏校验。"""
    if db is None:
        raise ValueError("db session required")
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError("Action not found")

    conds = _linked_conditions(action, db)
    if not conds:
        raise ValueError("该案件暂无待处理 OS 条件")

    conds_text = "\n".join(f"- {c.raw_text} (分类: {c.category})" for c in conds)
    files_info = _evidence_inventory(action.case_id, db)
    checklist_info = _checklist_inventory(action.case_id, db)
    plan_text = conds[0].ai_suggestion or ""

    case = db.query(Case).filter(Case.id == action.case_id).first()
    case_info = (
        f"客户: {case.client_name}, 银行: {case.lender or 'TBD'}, "
        f"阶段: {case.stage}, 融资截止日: {case.finance_deadline or '未设置'}"
    )

    assembled = assemble_context(action.case_id, "os_draft", db)
    safe_brain = desensitize(assembled.case_brain, action.case_id, db)
    safe_conds = desensitize(conds_text, action.case_id, db)
    safe_files = desensitize(files_info, action.case_id, db)
    safe_checklist = desensitize(checklist_info, action.case_id, db)
    safe_case = desensitize(case_info, action.case_id, db)
    safe_plan = desensitize(plan_text, action.case_id, db)
    safe_extra = desensitize(extra_instruction or "", action.case_id, db)

    strategy_hint = {
        "satisfy": "补件满足：已齐的材料直接附上，缺口材料明确列出并承诺补交时间",
        "alternative": "替代证据：用案件里已有的真实文件替代银行要求的材料，并说明替代逻辑",
        "escalation": "政策与申诉：申请 senior credit review / reconsideration，强调等效证明与融资截止日压力",
        "explain": "解释说明：针对银行要求的解释类条件，基于案件真实记忆给出说明",
    }.get(strategy, "综合判断：选择当前最可行、最稳妥的回复路线")

    prompt = (
        "你是澳洲房贷经纪人助手，为银行 Outstanding Condition 生成回复邮件草稿（已脱敏）。\n\n"
        f"【案件信息】{safe_case}\n\n"
        f"【案件大脑与客户情况】{safe_brain}\n\n"
        f"【案件文件库（真实证据）】{safe_files}\n\n"
        f"【材料清单现状】{safe_checklist}\n\n"
        f"【当前待处理条件】{safe_conds}\n\n"
        f"【已有攻坚方案（参考）】{safe_plan or '（暂无，可自行分析）'}\n\n"
        f"【本次采用策略】{strategy_hint}\n\n"
        f"【Vera 补充指示】{safe_extra or '（无）'}\n\n"
        "输出 JSON 对象（不要 Markdown 代码块）：\n"
        '{"subject": "英文邮件主题（简短，不超过 80 字符）",'
        ' "zh": "中文思路：给 Vera 看的要点，说明为什么这样回复、引用了哪些真实文件、有哪些风险",'
        ' "en": "英文邮件正文：给银行 Assessor 的完整草稿"}\n\n'
        "铁律：\n"
        "- en 中声称“已附上/已提供”的文件，必须来自【案件文件库】，禁止虚构任何文件或材料。\n"
        "- 不得编造客户情况、不得虚构材料缺失的原因；若某材料确实无法提供，写"
        "\"the document is temporarily unavailable; our office will provide the reason and alternative evidence shortly\"，"
        "并在 zh 中提示 Vera 补充真实原因（en 里留占位【请 Vera 填写真实原因】）。\n"
        "- 语气专业、克制、有理有据；escalation 时引用等效证据与融资截止日压力，但不攻击银行。\n"
        "- 邮件礼貌收尾，署名位置用 [Broker Name] 占位。"
    )

    try:
        resp_text = _call_plan_llm(
            prompt,
            "You are an expert Australian mortgage broker assistant that outputs clean JSON.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("OS draft LLM call failed for action %s: %s", action_id, exc)
        raise RuntimeError("回复草稿生成失败，请稍后重试") from exc

    try:
        payload = json.loads(_clean_json(resp_text))
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("OS draft LLM returned invalid JSON for action %s: %s", action_id, resp_text[:300])
        raise RuntimeError("回复草稿解析失败，请重试") from exc

    subject = rehydrate(str(payload.get("subject", "")), action.case_id, db)
    zh = rehydrate(str(payload.get("zh", "")), action.case_id, db)
    en = rehydrate(str(payload.get("en", "")), action.case_id, db)

    draft = _get_or_create_draft(action, db)
    draft.subject = subject
    draft.body = build_bilingual_body(zh, en)
    draft.draft_type = "os_reply"
    db.commit()

    for cond in conds:
        cond.ai_reply_draft = en
    db.commit()

    integrity = _integrity_check(en, action.case_id, db)
    return {
        "draftId": draft.id,
        "subject": subject,
        "zh": zh,
        "en": en,
        "integrity": integrity,
        "condIds": [c.id for c in conds],
    }


def submit_os_reply(
    action_id: int,
    subject: str,
    zh: str,
    en: str,
    os_ids: list[str],
    db: Session,
) -> dict:
    """保存双文草稿 + 标记指定 OS 条件为 replied + 完成动作（支持撤回闭环）。"""
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError("Action not found")

    draft = _get_or_create_draft(action, db)
    if subject:
        draft.subject = subject
    draft.body = build_bilingual_body(zh, en)
    draft.draft_type = "os_reply"

    conds: list[OsCondition] = []
    if os_ids:
        conds = (
            db.query(OsCondition)
            .filter(
                OsCondition.id.in_(os_ids),
                OsCondition.case_id == action.case_id,
            )
            .all()
        )
    for cond in conds:
        cond.status = "replied"
        cond.ai_reply_draft = en

    action.os_cond_ids = json.dumps([c.id for c in conds])
    action.status = "completed"

    CaseEventBus.emit(
        CaseEvent(
            case_id=action.case_id,
            event_type="os_status_changed",
            source="vera",
            operator="vera",
            title=f"OS 攻坚回复已提交: {subject or 'OS 回复'}",
            description=f"已标记 {len(conds)} 条 OS 条件为 replied，回复草稿已存入草稿箱。",
            payload={"milestone_title": f"OS 条件回复: {len(conds)} 条"},
        ),
        db,
    )

    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("Failed to submit OS reply for action %s: %s", action_id, exc)
        raise RuntimeError("提交 OS 回复失败，请重试") from exc

    return {
        "draftId": draft.id,
        "subject": draft.subject,
        "repliedCount": len(conds),
        "actionStatus": action.status,
    }


def restore_os_conditions_on_reopen(action: Action, db: Session) -> int:
    """撤回闭环：动作撤回时，把该动作标记过的 OS 条件还原为 pending。"""
    if not action.os_cond_ids:
        return 0
    try:
        ids = json.loads(action.os_cond_ids or "[]")
    except (json.JSONDecodeError, TypeError):
        return 0
    if not ids:
        return 0
    conds = (
        db.query(OsCondition)
        .filter(
            OsCondition.id.in_(ids),
            OsCondition.case_id == action.case_id,
        )
        .all()
    )
    for cond in conds:
        cond.status = "pending"
    action.os_cond_ids = None
    return len(conds)
