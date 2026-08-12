"""升级给老板服务 — 统一"等老板拍板"队列。

入口统一（今日行动 / AI 聊天 / 案件看板 / 邮件预审 / 草稿箱 / 手动），
升级事项都落到同一条 brandon 队列；vera_note 用 JSON 存结构化字段：
  {"problem": "卡点问题", "preference": "Vera 倾向方案",
   "source": "action|ai_chat|case_os|email|draft|manual",
   "context": "来源上下文摘要", "ping_count": 0, "last_ping_at": null}
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from core.config import get_config
from core.ai.context_builder import assemble_context
from core.pii.gateway import desensitize, rehydrate
from core.ai.gateway import ApiGateway
from core.events.bus import CaseEvent, CaseEventBus
from core.logger import get_logger
from core.models.orm import (
    Action,
    Case,
    CaseChecklist,
    CaseFile,
    CaseKnowledge,
    KnowledgeEntry,
    OsCondition,
)
from core.models.types import DesensitizedText

logger = get_logger(__name__)

_LEADING_SYMBOL_RE = re.compile(
    r"^[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F\u2B50\u2764\u2705\u274C\u2757\u2753"
    r"\u26A0\u26A1\u2190-\u21FF\u2B00-\u2BFF\s:：\-—|·•*#☆★]+"
)

# 同义别名组：同一材料的多种叫法归一到一个概念（升级去重用）。
# 实现时以材料/金额/银行等本领域具体术语为准，避免通用语义误判。
TERM_GROUPS: dict[str, list[str]] = {
    "信用卡对账单": ["信用卡对账单", "信用卡账单", "credit card statement", "信用卡"],
    "赠予信": ["赠予信", "赠与信", "赠予声明", "gift letter", "赠予资金证明"],
    "工资单": ["工资单", "工资条", "payslip", "pay slip"],
    "银行流水": ["银行流水", "流水", "bank statement", "银行对账单"],
    "纳税申报单": ["纳税申报单", "税单", "退税单", "tax return", "noa"],
    "雇佣确认信": ["雇佣确认信", "雇主信", "雇主确认信", "employment letter", "雇主证明"],
    "护照": ["护照", "passport"],
    "估价报告": ["估价报告", "valuation", "估值报告"],
    "买卖合同": ["买卖合同", "购房合同", "sales contract", "房屋合同"],
    "资金来源": ["资金来源", "gift", "赠予", "大额转账", "海外转账", "首付来源"],
    "市政费": ["市政费", "council rate", "council rates"],
    "保险单": ["保险单", "insurance policy", "房屋保险"],
}


def _normalized_terms(text: str) -> set[str]:
    """把文本里的材料别名归一成概念集合。"""
    low = (text or "").lower()
    hits: set[str] = set()
    for canonical, aliases in TERM_GROUPS.items():
        if any(a in low for a in aliases):
            hits.add(canonical)
    return hits


def _bigram_dice(a: str, b: str) -> float:
    """字符双元组 Dice 系数，作为术语命中的兜底（短文本/变体表达）。"""

    def grams(s: str) -> set[str]:
        s = "".join(ch for ch in (s or "") if not ch.isspace())
        return {s[i:i + 2] for i in range(max(0, len(s) - 1))}

    ga, gb = grams(a), grams(b)
    if not ga or not gb:
        return 0.0
    return 2 * len(ga & gb) / (len(ga) + len(gb))


def find_similar_pending(
    case_id: str,
    problem: str,
    db: Session,
    exclude_action_id: int | None = None,
) -> list[dict]:
    """保守查重：同客户老板队列里是否已有相似待拍板事项。

    判定规则（命中任一即提示，宁缺毋滥）：
    - 归一化术语重叠 ≥1 且覆盖率 ≥0.35；
    - 或整段文本双元组相似度 ≥0.5。
    """
    pendings = (
        db.query(Action)
        .filter(
            Action.case_id == case_id,
            Action.assignee == "brandon",
            Action.status == "pending",
        )
        .all()
    )
    if not pendings:
        return []

    new_terms = _normalized_terms(problem)
    results: list[dict] = []
    for act in pendings:
        if exclude_action_id is not None and act.id == exclude_action_id:
            continue
        note = parse_escalation_note(act.vera_note)
        old_problem = note["problem"] or act.title or ""
        old_terms = _normalized_terms(old_problem)
        shared = new_terms & old_terms
        reason = ""
        if shared:
            coverage = len(shared) / max(len(new_terms), len(old_terms), 1)
            if coverage >= 0.35:
                reason = f"命中同类材料: {'、'.join(sorted(shared))}"
        if not reason:
            dice = _bigram_dice(problem, old_problem)
            if dice >= 0.5:
                reason = f"文本高度相似（相似度 {dice:.0%}）"
        if reason:
            results.append(
                {
                    "id": act.id,
                    "title": act.title,
                    "problem": old_problem,
                    "preference": note["preference"],
                    "escalatedAt": act.escalated_at.isoformat() if act.escalated_at else None,
                    "reason": reason,
                }
            )
    return results


def _clean_escalation_text(text: str) -> str:
    """清洗升级文本：去掉开头的 emoji/符号前缀，避免把 ⚠️ 之类带进卡片与微信话术。"""
    t = (text or "").strip()
    while True:
        m = _LEADING_SYMBOL_RE.match(t)
        if not m:
            break
        t = t[m.end():].strip()
    return t.strip()


def build_escalation_note(
    problem: str,
    preference: str,
    source: str = "manual",
    context: str = "",
) -> str:
    """把升级字段打包成 vera_note JSON。"""
    return json.dumps(
        {
            "problem": problem,
            "preference": preference,
            "source": source,
            "context": context,
            "ping_count": 0,
            "last_ping_at": None,
        },
        ensure_ascii=False,
    )


def parse_escalation_note(note: str | None) -> dict:
    """解析 vera_note，兼容旧版纯文本（整体当 problem）。"""
    if not note:
        return {"problem": "", "preference": "", "source": "manual", "context": "", "ping_count": 0}
    try:
        parsed = json.loads(note)
        if isinstance(parsed, dict):
            return {
                "problem": str(parsed.get("problem") or ""),
                "preference": str(parsed.get("preference") or ""),
                "source": str(parsed.get("source") or "manual"),
                "context": str(parsed.get("context") or ""),
                "ping_count": int(parsed.get("ping_count") or 0),
            }
    except (json.JSONDecodeError, TypeError):
        pass
    return {"problem": note, "preference": "", "source": "manual", "context": "", "ping_count": 0}


def create_escalation(
    db: Session,
    case_id: str,
    problem: str,
    preference: str = "",
    source: str = "manual",
    context: str = "",
    action_id: int | None = None,
) -> Action:
    """升级到老板：有 action_id 就升级该动作，否则新建一条 ESCALATION 动作。"""
    problem = _clean_escalation_text(problem)
    preference = _clean_escalation_text(preference)
    if not problem:
        raise ValueError("卡点问题不能为空")

    if action_id is not None:
        action = db.query(Action).filter(Action.id == action_id).first()
        if not action:
            raise ValueError(f"Action not found: {action_id}")
        if action.assignee == "brandon" and action.status == "pending":
            # 已在老板队列：更新内容，重新计时
            action.escalated_at = datetime.utcnow()
        else:
            action.assignee = "brandon"
            action.escalated_at = datetime.utcnow()
        action.vera_note = build_escalation_note(problem, preference, source, context)
        db.commit()
        return action

    action = Action(
        case_id=case_id,
        type="ESCALATION",
        title=problem[:60],
        priority="high",
        status="pending",
        assignee="brandon",
        escalated_at=datetime.utcnow(),
        vera_note=build_escalation_note(problem, preference, source, context),
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


def cancel_escalation(action_id: int, db: Session) -> Action:
    """撤回升级：回到 Vera 待办，清空升级时间。"""
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError(f"Action not found: {action_id}")
    if action.assignee != "brandon":
        raise ValueError("该事项不在老板队列中，无需撤回")
    action.assignee = "vera"
    action.escalated_at = None
    db.commit()
    return action


def record_boss_reply(action_id: int, decision: str, db: Session) -> Action:
    """记录老板答复（微信/电话）：写入 boss_decision + 案件知识 + 时间线，事项回到 Vera。"""
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError(f"Action not found: {action_id}")
    if not decision.strip():
        raise ValueError("老板答复不能为空")

    action.assignee = "vera"
    action.boss_decision = decision.strip()
    action.ai_suggestion = f"老板拍板指示: {decision.strip()}"

    note = parse_escalation_note(action.vera_note)
    kn = CaseKnowledge(
        case_id=action.case_id,
        content=(
            f"老板拍板决策: {decision.strip()}"
            f" (针对卡点: {note['problem'] or action.title})"
        ),
        source="boss_decision",
    )
    db.add(kn)

    # 自动沉淀为团队全局经验（脱敏存储，供后续同银行案件的 AI 引用）
    case = db.query(Case).filter(Case.id == action.case_id).first()
    lender = case.lender if case else None
    raw_exp = (
        f"【{lender or '银行'} 老板拍板经验】"
        f"场景: {note['problem'] or action.title} → 拍板: {decision.strip()}"
    )
    safe_exp = desensitize(raw_exp, action.case_id, db)
    existing_exp = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.layer == "global",
            KnowledgeEntry.source == "boss_decision",
            KnowledgeEntry.lender == lender,
            KnowledgeEntry.content == safe_exp,
        )
        .first()
    )
    if not existing_exp:
        db.add(
            KnowledgeEntry(
                id=f"ke_{uuid.uuid4().hex}",
                layer="global",
                case_id=action.case_id,
                content=safe_exp,
                source="boss_decision",
                vera_confirmed=True,
                lender=lender,
                tags=json.dumps(["boss_decision"], ensure_ascii=False),
                entry_type="experience",
            )
        )
        # 每个银行最多保留最近 30 条老板拍板经验，避免堆成垃圾
        too_many = (
            db.query(KnowledgeEntry)
            .filter(
                KnowledgeEntry.layer == "global",
                KnowledgeEntry.source == "boss_decision",
                KnowledgeEntry.lender == lender,
            )
            .order_by(KnowledgeEntry.created_at.asc())
            .all()
        )
        if len(too_many) > 30:
            for stale in too_many[: len(too_many) - 30]:
                db.delete(stale)

    CaseEventBus.emit(
        CaseEvent(
            case_id=action.case_id,
            event_type="boss_decided",
            source="vera",
            operator="vera",
            title=f"老板拍板: {action.title}",
            description=f"老板答复: {decision.strip()}",
            payload={},
        ),
        db,
    )

    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("Failed to record boss reply for action %s: %s", action_id, exc)
        raise RuntimeError("记录老板答复失败，请重试") from exc
    return action


def re_ping_escalation(action_id: int, db: Session) -> Action:
    """再催老板：等待天数不清零，只记录催促次数与时间。"""
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError(f"Action not found: {action_id}")
    if action.assignee != "brandon":
        raise ValueError("该事项不在老板队列中")

    note = parse_escalation_note(action.vera_note)
    note["ping_count"] = note.get("ping_count", 0) + 1
    note["last_ping_at"] = datetime.utcnow().isoformat()
    action.vera_note = json.dumps(note, ensure_ascii=False)
    db.commit()
    return action


def get_boss_summary(db: Session) -> dict:
    """老板队列真实统计：待决策 / 超3天 / 今日新增 / 本周闭环。"""
    now = datetime.utcnow()
    pending = (
        db.query(Action)
        .filter(Action.assignee == "brandon", Action.status == "pending")
        .all()
    )
    pending_count = len(pending)
    over3days = 0
    new_today = 0
    for act in pending:
        if act.escalated_at:
            wait_days = (now - act.escalated_at).days
            if wait_days > 3:
                over3days += 1
            if act.escalated_at.date() == now.date():
                new_today += 1

    # 本周闭环：本周 Vera 记录的老板拍板决策数（CaseKnowledge 带时间戳，最可靠）
    from datetime import date

    week_start = now.date().toordinal() - now.isoweekday() + 1
    week_start_dt = datetime.combine(date.fromordinal(week_start), datetime.min.time())
    closed_this_week = (
        db.query(CaseKnowledge)
        .filter(
            CaseKnowledge.source == "boss_decision",
            CaseKnowledge.created_at >= week_start_dt,
        )
        .count()
    )

    return {
        "pending": pending_count,
        "over3days": over3days,
        "newToday": new_today,
        "closedThisWeek": closed_this_week,
    }


def _call_advice_llm(prompt: str, system_prompt: str) -> str:
    """AI 建议的 LLM 调用出口（测试中 patch）。"""
    config = get_config()
    gateway = ApiGateway(config)
    result = gateway.call_llm(
        text=DesensitizedText(prompt),
        prompt_template=prompt,
        system_prompt=system_prompt,
    )
    return result.response_text.strip()


def generate_escalation_advice(action_id: int, db: Session) -> dict:
    """按需生成"AI 结合案件上下文的参考建议"（给 Vera 看，帮助高效拿到老板拍板）。

    只基于案件真实材料；出站脱敏、入站还原；不自动调用，由 Vera 点按钮触发。
    """
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise ValueError("Action not found")
    note = parse_escalation_note(action.vera_note)

    case = db.query(Case).filter(Case.id == action.case_id).first()
    deadline = case.finance_deadline.isoformat() if case and case.finance_deadline else "未设置"

    files = (
        db.query(CaseFile)
        .filter(CaseFile.case_id == action.case_id)
        .order_by(CaseFile.confidence.desc())
        .all()
    )
    files_str = "\n".join(
        f"- {f.original_name} (分类: {f.assigned_type or '未知'}, 状态: {f.status or '未知'})"
        for f in files
    ) or "（文件库为空）"

    checklist = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == action.case_id)
        .all()
    )
    checklist_str = "\n".join(
        f"- {c.item_name} ({c.status})" for c in checklist
    ) or "（无清单项）"

    os_pending = (
        db.query(OsCondition)
        .filter(
            OsCondition.case_id == action.case_id,
            OsCondition.status == "pending",
        )
        .all()
    )
    os_str = "\n".join(f"- {o.raw_text}" for o in os_pending) or "（无）"

    assembled = assemble_context(action.case_id, "case_advisor", db)
    safe_brain = desensitize(assembled.case_brain, action.case_id, db)
    safe_team_exp = desensitize(assembled.team_experience, action.case_id, db)
    safe_problem = desensitize(note["problem"] or action.title, action.case_id, db)
    safe_pref = desensitize(note["preference"] or "（暂无）", action.case_id, db)
    safe_files = desensitize(files_str, action.case_id, db)
    safe_checklist = desensitize(checklist_str, action.case_id, db)
    safe_os = desensitize(os_str, action.case_id, db)
    safe_case = desensitize(
        f"客户: {case.client_name if case else '未知'}, 银行: {case.lender if case else '未知'}, "
        f"阶段: {case.stage if case else '未知'}, 融资截止: {deadline}",
        action.case_id,
        db,
    )

    prompt = (
        "你是澳洲房贷经纪团队的高级顾问。针对一条『等老板拍板』的卡点，结合案件上下文，"
        "给一线 Vera 一份简短参考建议（已脱敏）。\n\n"
        f"【案件信息】{safe_case}\n\n"
        f"【案件大脑】{safe_brain}\n\n"
        f"【团队历史经验】{safe_team_exp}\n\n"
        f"【卡点问题】{safe_problem}\n\n"
        f"【Vera 倾向方案】{safe_pref}\n\n"
        f"【案件文件库（真实材料）】{safe_files}\n\n"
        f"【材料清单现状】{safe_checklist}\n\n"
        f"【待处理 OS 条件】{safe_os}\n\n"
        "输出 JSON（不要 Markdown 代码块）：\n"
        '{"summary": "一句话定位这个卡点当前的关键",'
        ' "risks": ["最多 3 条风险，基于真实材料"],'
        ' "tips": ["最多 4 条给 Vera 的建议，比如怎么跟老板讲、有什么替代说法、该催什么材料"]}\n\n'
        "铁律：\n"
        "- 只基于上面给出的真实材料，禁止编造客户情况、文件或理由。\n"
        "- tips 聚焦『如何高效获得老板拍板』，要具体可执行。"
    )

    try:
        resp_text = _call_advice_llm(
            prompt,
            "You are an expert Australian mortgage broker advisor that outputs clean JSON.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Escalation advice LLM call failed for action %s: %s", action_id, exc)
        raise RuntimeError("AI 建议生成失败，请稍后重试") from exc

    text = (resp_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("Escalation advice LLM returned invalid JSON for action %s: %s", action_id, resp_text[:200])
        raise RuntimeError("AI 建议解析失败，请重试") from exc

    return {
        "summary": rehydrate(str(payload.get("summary", "")), action.case_id, db),
        "risks": [rehydrate(str(r), action.case_id, db) for r in (payload.get("risks") or []) if str(r).strip()],
        "tips": [rehydrate(str(t), action.case_id, db) for t in (payload.get("tips") or []) if str(t).strip()],
    }