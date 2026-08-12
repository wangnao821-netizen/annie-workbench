from datetime import datetime

from sqlalchemy.orm import Session

from core.config import get_config
from core.knowledge.memory import recall
from core.pii.gateway import desensitize, rehydrate
from core.ai.gateway import ApiGateway
from core.logger import get_logger
from core.models.orm import Case, CaseBrief, CaseChecklist, CaseFile, CaseKnowledge
from core.models.types import DesensitizedText

logger = get_logger(__name__)


def generate_layered_brief(
    case_id: str,
    level: int,
    db: Session,
) -> str:
    """Generate a layered brief summary (Level 1, 2, or 3) for a loan case.

    Flow:
        1. Check the database brief cache table (case_briefs). If a valid cache
           exists (updated_at >= latest case_knowledge.created_at), return it.
        2. Query hard case details, checklist states, and files from SQLite.
        3. Retrieve soft memories/timelines from Mem0.
        4. Compile context, run desensitize(), and call Gemini Flash.
        5. Run rehydrate() on the brief to restore PII.
        6. Update the database cache (case_briefs).

    Args:
        case_id: Associated case ID.
        level: In (1, 2, 3).
        db: SQLAlchemy session.

    Returns:
        The desensitized, LLM-generated, then rehydrated Markdown brief string.

    Raises:
        ValueError: If case is not found or level is invalid.
    """
    if level not in (1, 2, 3):
        raise ValueError(f"Invalid brief level: {level}. Must be 1, 2, or 3.")

    # ── 1. Cache Verification ─────────────────────────────────────────
    latest_kn = (
        db.query(CaseKnowledge)
        .filter(CaseKnowledge.case_id == case_id)
        .order_by(CaseKnowledge.created_at.desc())
        .first()
    )
    cached = (
        db.query(CaseBrief)
        .filter(CaseBrief.case_id == case_id, CaseBrief.level == level)
        .first()
    )

    if cached:
        # Cache is valid if there is no knowledge or cache was updated after/equal to latest knowledge
        if not latest_kn or cached.updated_at >= latest_kn.created_at:
            logger.info(
                "Returning cached Level %d brief for case %s (avoiding redundant LLM call)",
                level,
                case_id,
            )
            return cached.brief_content

    logger.info("Cache miss or invalid. Generating Level %d brief for case %s", level, case_id)

    # ── 2. Fetch Hard Data and Soft Memory ────────────────────────────
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"Case not found: {case_id}")

    # Fetch checklist items
    checklist_items = (
        db.query(CaseChecklist)
        .filter(CaseChecklist.case_id == case_id)
        .all()
    )
    checklist_str = ", ".join(
        [f"{it.item_name} ({it.status})" for it in checklist_items]
    )

    # Fetch case files
    case_files = (
        db.query(CaseFile)
        .filter(CaseFile.case_id == case_id)
        .all()
    )
    files_str = ", ".join(
        [f"{f.original_name} (分类: {f.assigned_type})" for f in case_files]
    )

    # Fetch soft memory from Mem0
    try:
        memories = recall(case_id, "与本案相关的往返沟通、细节记录、红旗隐患、客户诉求", db)
    except Exception as exc:
        logger.warning("Failed to recall memories for case %s: %s", case_id, exc)
        memories = ""

    # Compile the hard data context
    loan_amt_str = f"${case.loan_amount:,.2f}" if case.loan_amount else "TBD"
    hard_data = f"""【案件基本硬数据】
- 客户姓名: {case.client_name}
- 借款金额: {loan_amt_str}
- 就业类型: {case.employment_type or "TBD"}
- 居民身份: {case.residency or "TBD"}
- 目标银行: {case.lender or "TBD"}
- 贷款目的: {case.purpose or "TBD"}
- 当前阶段: {case.stage or "gathering"}

【清单与材料状态】
- 清单状态: {checklist_str or "无清单项"}
- 已收材料: {files_str or "无材料文件"}

【提炼的事实清单】
{case.context_summary or "暂无事实清单。"}
"""

    # ── 3. Desensitize Context ────────────────────────────────────────
    safe_hard_data = desensitize(hard_data, case_id, db)
    safe_memories = desensitize(memories or "无往返记忆。", case_id, db)

    combined_context = f"""{safe_hard_data}

【软记忆与往返沟通记录】
{safe_memories}"""

    # ── 4. Prompt Selection ───────────────────────────────────────────
    config = get_config()
    gateway = ApiGateway(config)

    if level == 1:
        system_prompt = "You are an expert mortgage supervisor writing short, punchy boss summaries."
        prompt_template = """请根据下面的案件信息生成一份老板/讲标摘要（老板版）。
重点是卡点、核心矛盾和需要老板决策的地方。
控制在150字以内。
第一行必须是“卡点”或“建议决策”（不要加任何特殊 Markdown 字符），不能有任何琐碎材料列表。
如果信息不足，请直说“暂无相关记录”，不要胡编乱造。
确保 Markdown 语法规范（例如，不要在标题中使用错乱的多级星号）。
只输出摘要内容，不要有任何其他前言或后记。

【案件详情】"""
    elif level == 2:
        system_prompt = "You are a professional mortgage processor writing bank submission notes."
        prompt_template = """请根据下面的案件信息生成一份递交/Judy版摘要。
重点说明与目标银行政策的匹配度、材料存放位置和递交时需要注意的特殊备注。
控制在300-500字。
如果信息不足，请直说“暂无相关记录”，不要胡编乱造。
确保 Markdown 语法规范（例如，使用标准的标题、加粗和无序列表）。
只输出摘要内容，不要有任何其他前言或后记。

【案件详情】"""
    else:
        system_prompt = "You are a detailed mortgage analyst writing comprehensive case files."
        prompt_template = """请根据下面的案件信息生成一份全景/Vera版摘要。
重点展示所有往返时间线、客户原始诉求和所有已发现的红旗（Red Flags）隐患。
按主题组织成规范精美的 Markdown 格式。
如果信息不足，请直说“暂无相关记录”，不要胡编乱造。
确保 Markdown 语法完美无暇，以适应 react-markdown 的标准渲染（必须使用标准的标题、加粗、列表格式，严禁语法错乱）。
只输出摘要内容，不要有任何其他前言或后记。

【案件详情】"""

    # ── 5. LLM Call and Rehydration ──────────────────────────────────
    try:
        api_result = gateway.call_llm(
            text=DesensitizedText(combined_context),
            prompt_template=prompt_template,
            system_prompt=system_prompt,
        )
        raw_brief = api_result.response_text.strip()
    except Exception as exc:
        logger.warning("LLM call for brief level %d fallback to local formatted brief: %s", level, exc)
        raw_brief = f"""# 案件决策摘要 (Level {level} · 结构化离线版)
**生成时间**: {datetime.utcnow().strftime('%Y-%m-%d')}
**借款人**: {case.client_name}
**目标银行**: {case.lender} | **申贷额度**: ${case.loan_amount or 0:,.2f}
**贷款目的**: {case.purpose}

## 1. 材料与文件情况
- 已归档文件: {files_str or '暂无文件'}
- 银行核实清单: {checklist_str or '未核对'}

## 2. 系统建议与跟进
- 当前阶段: [{case.stage}]
- AI 提示: 已基于本地硬数据生成结构化报告。请确保在网络连通后更新在线策略。"""

    final_brief = rehydrate(raw_brief, case_id, db)

    # ── 6. Update Cache ───────────────────────────────────────────────
    try:
        if cached:
            cached.brief_content = final_brief
            cached.updated_at = datetime.utcnow()
        else:
            new_brief = CaseBrief(
                case_id=case_id,
                level=level,
                brief_content=final_brief,
            )
            db.add(new_brief)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to update brief cache for case %s: %s", case_id, exc)

    return final_brief
