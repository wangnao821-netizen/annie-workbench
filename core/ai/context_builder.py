"""Unified Context Assembler — 所有 AI 调用的统一上下文组装入口。

四层上下文架构：
  Layer 1: 角色定义（固定）
  Layer 2: 团队经验（从 Knowledge Base 按 lender + task_type 检索）
  Layer 3: 案件身份证（案件大脑 7 字段）
  Layer 4: 实时数据（按任务类型选择性加载）

所有 AI 调用点都通过 assemble_context() 获取上下文，
不再各自零散拼接 prompt。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import (
    Case,
    CaseChecklist,
    KnowledgeEntry,
    OsCondition,
)
from core.persona import build_system_prompt

logger = get_logger(__name__)


@dataclass
class AssembledContext:
    """组装后的上下文，供 AI prompt 使用。"""
    role_prompt: str           # Layer 1: 角色定义
    team_experience: str       # Layer 2: 团队经验
    case_brain: str            # Layer 3: 案件身份证
    live_data: str             # Layer 4: 实时数据
    total_chars: int


# 每层的 token 预算（字符数，~3 字符/token）
# 角色层预算 600 → 1000：2026-08-20 人格文案升级（Emoji 排版规范 + 称呼规范）实测约 915 字符，
# 600 会把 Emoji 排版规范截掉；1000 容纳完整文案并留自定义人格余量。
# 角色层是每个 prompt 的固定前缀，DeepSeek 前缀缓存命中后成本可忽略。
BUDGET_ROLE = 1000
BUDGET_TEAM_EXP = 1500
BUDGET_CASE_BRAIN = 1800
BUDGET_LIVE_DATA = 3000

TASK_TYPES = [
    "file_classify",       # 文件分类
    "os_reply",            # OS 条件回复
    "email_draft",         # 邮件草稿生成
    "case_advisor",        # 案件顾问（邮件触发）
    "case_chat",           # 案件级 AI 对话
    "checklist_generate",  # 清单生成
    "brief_generate",      # 简报生成
    "strategy_report",     # 策略报告
]


def _build_role_prompt(db: Session | None = None) -> str:
    """Layer 1 角色定义：人格配置 + 运行期身份称呼；异常/缺失回退旧文案。

    Args:
        db: SQLAlchemy session；提供时读取 system_settings 中的
            ai_name / user_address / persona_key，覆盖 YAML 默认人格。
    """
    persona_key = ai_name = user_address = None
    if db is not None:
        try:
            from core.persona import get_runtime_persona

            rt = get_runtime_persona(db)
            persona_key = rt.get("persona_key")
            ai_name = rt.get("ai_name")
            user_address = rt.get("user_address")
        except Exception:
            logger.warning("runtime persona read failed, fallback to defaults", exc_info=True)
    try:
        prompt = build_system_prompt(persona_key, ai_name=ai_name, user_address=user_address)
        if prompt:
            return prompt
    except Exception:
        logger.warning("persona prompt build failed, fallback to legacy role", exc_info=True)
    return "你是澳洲贷款经纪团队的 AI 助手。你了解每个客户的具体情况和团队的历史经验。回答要具体到这个客户，不要给通用建议。"


def _build_team_experience(
    lender: str | None,
    task_type: str,
    db: Session,
    case_id: str | None = None,
) -> str:
    """从 Knowledge Base (knowledge_entries) 检索与当前银行 + 任务类型相关的团队经验。"""
    experiences: list[str] = []
    lender_entries: list[KnowledgeEntry] = []

    # 1. 按银行筛选经验
    if lender:
        lender_entries = (
            db.query(KnowledgeEntry)
            .filter(
                KnowledgeEntry.layer == "global",
                KnowledgeEntry.lender == lender,
                KnowledgeEntry.vera_confirmed == True,
            )
            .limit(5)
            .all()
        )
        for e in lender_entries:
            experiences.append(f"[{lender} 经验] {e.content[:200]}")

    # 1b. 注入当前案件银行的政策要点（LVR/缓冲率/收入口径/材料），
    #     让 OS 回复、邮件、聊天、升级、顾问等所有 AI 调用都"看得见"政策。
    if lender:
        try:
            from core.knowledge.service import KnowledgeService

            essentials = KnowledgeService().get_lender_policy_essentials(lender)
            if essentials:
                experiences.append(essentials)
        except Exception:
            logger.warning("lender policy injection failed for %s", lender, exc_info=True)

    # 2. 按任务类型筛选通用经验
    general_entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.layer == "global",
            KnowledgeEntry.vera_confirmed == True,
        )
        .order_by(KnowledgeEntry.created_at.desc())
        .limit(5)
        .all()
    )
    for e in general_entries:
        if e not in lender_entries:
            experiences.append(f"[团队经验] {e.content[:200]}")

    # 3. 决策先例：仅 case_chat 注入已确认执行的同类先例（WO-37）
    if task_type == "case_chat" and case_id:
        try:
            from core.knowledge.precedent import build_precedent_block, find_precedents

            precs = find_precedents(case_id, db)
            block = build_precedent_block(precs)
            if block:
                experiences.append(f"\n【决策先例】\n{block}")
        except Exception:  # 先例检索失败不阻断上下文组装
            logger.warning("precedent retrieval failed for case %s", case_id, exc_info=True)

    return "\n".join(experiences) if experiences else "暂无团队经验记录。"


def _build_case_brain(case: Case, db: Session) -> str:
    """组装案件大脑 7 字段。"""
    parts: list[str] = []

    # 1. 客户目标
    parts.append(f"🎯 客户目标: {case.client_goal or '未填写'}")

    # 2. 贷款方案
    loan_amt = f"${case.loan_amount:,.0f}" if case.loan_amount else "待定"
    interest = getattr(case, "interest_rate", None) or "待定"
    parts.append(f"💰 贷款方案: {case.lender or '待定'} · {loan_amt} · {interest} · {case.purpose or '待定'}")

    # 3. 客户画像
    parts.append(f"👤 客户画像: {case.employment_type or '待定'} · {case.residency or '待定'} · {case.preferred_language or '英文'}")

    # 4. 关键时间线
    if case.finance_deadline:
        days_left = (case.finance_deadline - datetime.utcnow()).days  # noqa: DTZ003 — naive 与 DB 一致
        parts.append(f"📅 Finance Clause: {case.finance_deadline.strftime('%Y-%m-%d')} (还剩 {days_left} 天)")

    # 5. 特殊情况
    parts.append(f"⚠️ 特殊情况: {case.special_circumstances or '无'}")

    # 6. 当前瓶颈（自动计算）
    pending_cl = db.query(CaseChecklist).filter(
        CaseChecklist.case_id == case.id,
        CaseChecklist.status.notin_(["received", "collected", "waived", "deferred"]),
    ).all()
    pending_os = db.query(OsCondition).filter(
        OsCondition.case_id == case.id,
        OsCondition.status == "pending"
    ).all()

    blockers: list[str] = []
    for cl in pending_cl[:5]:
        blockers.append(f"清单缺: {cl.item_name}")
    for os in pending_os[:3]:
        raw = os.raw_text or ""
        blockers.append(f"OS待处理: {raw[:60]}")
    parts.append(f"🚧 当前瓶颈: {'; '.join(blockers) if blockers else '无阻塞'}")

    # 7. Vera 备忘录
    notes = db.query(KnowledgeEntry).filter(
        KnowledgeEntry.case_id == case.id,
        KnowledgeEntry.source == "vera_manual"
    ).order_by(KnowledgeEntry.created_at.desc()).limit(3).all()

    if notes:
        notes_text = "; ".join(n.content[:100] for n in notes)
        parts.append(f"📝 Vera备忘: {notes_text}")

    return "\n".join(parts)


def _build_live_data(case_id: str, task_type: str, db: Session) -> str:
    """按任务类型选择性加载实时数据。"""
    parts: list[str] = []

    if task_type in ("case_chat", "case_advisor", "brief_generate", "strategy_report"):
        items = db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
        if items:
            collected = [i for i in items if i.status in ("received", "collected", "deferred")]
            parts.append(f"清单状态: {len(collected)}/{len(items)} 已收")
            for i in items:
                mark = "✅" if i.status in ("received", "collected", "deferred") else "⬜"
                parts.append(f"  {mark} {i.item_name} ({i.status})")

    if task_type in ("os_reply", "case_chat", "case_advisor"):
        conditions = db.query(OsCondition).filter(OsCondition.case_id == case_id).all()
        if conditions:
            pending_count = len([c for c in conditions if c.status == "pending"])
            parts.append(f"OS条件: {pending_count} 条待处理")
            for c in conditions:
                raw = c.raw_text or ""
                parts.append(f"  {'⏳' if c.status == 'pending' else '✅'} {raw[:80]}")

    return "\n".join(parts) if parts else ""


def assemble_context(
    case_id: str,
    task_type: str,
    db: Session,
    extra_data: str = "",
) -> AssembledContext:
    """所有 AI 调用的统一上下文组装入口。

    Args:
        case_id: 案件 ID
        task_type: 任务类型（见 TASK_TYPES）
        db: SQLAlchemy session
        extra_data: 调用方额外补充的数据（如文件文本、邮件正文等）

    Returns:
        AssembledContext 对象，各层已截断到 token 预算内。
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        logger.warning("assemble_context: case %s not found", case_id)
        return AssembledContext(
            role_prompt=_build_role_prompt(db),
            team_experience="",
            case_brain="",
            live_data=extra_data,
            total_chars=len(extra_data),
        )

    role = _build_role_prompt(db)[:BUDGET_ROLE]
    team_exp = _build_team_experience(case.lender, task_type, db, case_id=case.id)[:BUDGET_TEAM_EXP]
    brain = _build_case_brain(case, db)[:BUDGET_CASE_BRAIN]
    live = _build_live_data(case_id, task_type, db)[:BUDGET_LIVE_DATA]

    total = len(role) + len(team_exp) + len(brain) + len(live) + len(extra_data)

    return AssembledContext(
        role_prompt=role,
        team_experience=team_exp,
        case_brain=brain,
        live_data=live + ("\n\n" + extra_data if extra_data else ""),
        total_chars=total,
    )


def prefill_case_brain_from_text(case_id: str, raw_text: str, db: Session) -> None:
    """从初始文本（邮件正文等）中 AI 提取客户目标和特殊情况，预填到案件大脑。

    调用 LLM（经脱敏）提取结构化信息，写回 Case 表。
    非致命操作，失败不影响建案流程。
    """
    if not raw_text or not raw_text.strip():
        return

    from core.ai.gateway import ApiGateway
    from core.config import get_config
    from core.models.types import DesensitizedText
    from core.pii.gateway import desensitize, rehydrate

    try:
        safe_text = desensitize(raw_text, case_id, db)

        prompt = f"""从以下文本中提取两项信息，如果文本中没有相关信息则返回空字符串：
1. 客户目标（client_goal）：客户想要什么？想买什么房？预算多少？
2. 特殊情况（special_circumstances）：有什么会影响贷款审批的非常规因素？

文本：
{safe_text}

返回 JSON 格式：
{{"client_goal": "...", "special_circumstances": "..."}}"""

        config = get_config()
        gw = ApiGateway(config)
        result = gw.call_llm(text=DesensitizedText(prompt), prompt_template="Extract case brain fields.")

        # 解析并写回
        resp_text = result.response_text.strip()
        # 清理 markdown code blocks
        if resp_text.startswith("```"):
            resp_text = resp_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        data = json.loads(resp_text)
        case = db.query(Case).filter(Case.id == case_id).first()
        if case:
            if data.get("client_goal"):
                case.client_goal = rehydrate(data["client_goal"], case_id, db)
            if data.get("special_circumstances"):
                case.special_circumstances = rehydrate(data["special_circumstances"], case_id, db)
            db.commit()
            logger.info("prefill_case_brain_from_text succeeded for case %s", case_id)
    except Exception as exc:  # noqa: BLE001 — 预填失败降级，不阻断对话
        logger.warning("prefill_case_brain_from_text failed for case %s: %s (non-fatal)", case_id, exc)
