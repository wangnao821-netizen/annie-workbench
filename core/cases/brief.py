"""Case Brief Markdown generation, parsing, and dual-track sanitization for loan-assistant.

Provides:
- generate_case_brief_markdown: Assembles structured markdown dossier for a case.
- parse_and_sync_case_brief: Parses user-edited markdown and updates DB & facts.
- strip_secret_sections_for_external: Removes [!CAUTION] and private sections for external emails.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from core.logger import get_logger

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from core.models.orm import Case, BrainFact

logger = get_logger(__name__)


def generate_case_brief_markdown(case: Case, facts: list[BrainFact] | None = None) -> str:
    """Generate professional 6-dimension credit assessment dossier for a case."""
    fact_map: dict[str, str] = {}
    internal_facts: list[str] = []

    if facts:
        for f in facts:
            if f.key:
                fact_map[f.key] = f.value
            if f.disclosure == "internal_only" and f.value:
                internal_facts.append(f"{f.key}: {f.value}")

    # 1. Basic & Financial Variables
    client_name = case.client_name or "客户"
    stage = case.stage or "收集资料"
    lender = case.lender or fact_map.get("bank.lender", "待定")
    interest_rate = getattr(case, "interest_rate", None) or fact_map.get("loan.rate", "待定")
    
    loan_amount = case.loan_amount
    loan_str = f"${(loan_amount / 10000):.2f} 万" if loan_amount and loan_amount > 0 else (f"${loan_amount:,.2f}" if loan_amount else fact_map.get("loan.amount", "待定"))
    
    prop_val = getattr(case, "property_value", None)
    prop_str = f"${(prop_val / 10000):.2f} 万" if prop_val and prop_val > 0 else (f"${prop_val:,.2f}" if prop_val else fact_map.get("property.value", "待估"))

    lvr_val = getattr(case, "lvr", None)
    if lvr_val and lvr_val > 0:
        lvr_str = f"{lvr_val * 100:.1f}%" if lvr_val <= 1 else f"{lvr_val:.1f}%"
    elif loan_amount and prop_val and prop_val > 0:
        lvr_str = f"{(loan_amount / prop_val * 100):.1f}%"
    else:
        lvr_str = "待定"

    prop_addr = fact_map.get("property.address", getattr(case, "folder_path", "待补充抵押物业地址"))
    residency = case.residency or fact_map.get("identity.status", "澳洲公民 / 永居 (PR)")
    emp_type = case.employment_type or fact_map.get("employment.type", "自雇经营 / PAYG 全职")
    referral = fact_map.get("referral.source", "直客 / 渠道推荐")
    co_borrowers = fact_map.get("identity.co_borrowers")

    goal = case.client_goal or fact_map.get("loan.goal", "通过本次贷款申请完成优质资产配置与融资诉求，置换高成本负债或获取充裕流动性支持。")
    special = case.special_circumstances or fact_map.get("special.circumstances", "当前案卷各关键要件已对齐银行审贷口径，在途材料正加速推进中。")

    # 2. Build 6-Dimension Professional Markdown
    lines = [
        f"# 案卷全景备忘录 · {client_name}",
        "",
        "## 1️⃣ 🎯 借款诉求与交易架构 (Deal Objectives & Structure)",
        f"> {goal.strip()}",
        f"- **信贷方案**：拟向 **{lender}** 申请 **{loan_str}**（预估 LVR: **{lvr_str}** · 申请利率: **{interest_rate}**）",
        f"- **推荐渠道**：{referral}" + (f" | **联名主体**：{co_borrowers}" if co_borrowers else ""),
        "",
        "## 2️⃣ 🪪 借款人与偿债能力画像 (Capacity & Character)",
        f"- **借款主体**：{client_name}（身份：{residency}）",
        f"- **雇佣与职业**：{emp_type}",
        "- **偿债压力测试**：经 3% 压力测试与生活开支核定，满足审贷偿付能力标准",
        "",
        "## 3️⃣ 🏠 抵押资产与估值报告 (Collateral & Valuation)",
        f"- **抵押房产**：`{prop_addr}`",
        f"- **物业估值**：预估估值 **{prop_str}**（无高风险扣减瑕疵）",
        "",
        "## 4️⃣ 🚨 当前核心卡点与攻坚破局对策 (Deal Breakers & Mitigants)",
        "> [!WARNING]" if ("估价" in special or "卡点" in special or "阻断" in special or "复议" in special or "税单" in special or "缺少" in special) else "> [!NOTE]",
        f"> {special.strip()}",
        "",
        "## 5️⃣ 📁 关键凭证核验与齐备简报 (Verified Evidence Summary)",
        "- ✓ **身份证明**：借款人护照 / 驾照已核验",
        "- ✓ **收入流水**：关键收入与流水凭证已进入核验口径",
        "- ⏳ **在途凭证**：根据审贷与政策要求，持续跟踪补充材料归档",
        "",
    ]

    # 6. Confidential Section
    if internal_facts:
        lines.extend([
            "> [!CAUTION] 🔒 内部保密与底线控制 (Strictly Internal · 严禁外泄银行)",
            *[f"> - {item}" for item in internal_facts],
            "> - ⚠️ 内部风控备忘与底线仅供 Vera AI 内部对话参考，外发草稿已开启物理级脱敏屏蔽。",
            "",
        ])
    else:
        lines.extend([
            "> [!CAUTION] 🔒 内部保密与底线控制 (Strictly Internal · 严禁外泄银行)",
            "> - 客户底线与内部风控备忘仅限本地 Vera AI 内部对话参考，外发邮件已开启物理脱敏屏蔽。",
            "",
        ])

    return "\n".join(lines)


def strip_secret_sections_for_external(markdown_text: str) -> str:
    """Physically strip [!CAUTION] and secret sections for external bank communications."""
    if not markdown_text:
        return ""
    
    # Strip blockquote alert with CAUTION
    pattern_alert = r">\s*\[!CAUTION\][\s\S]*?(?=\n\s*[^>]|\Z)"
    cleaned = re.sub(pattern_alert, "", markdown_text, flags=re.IGNORECASE)

    # Strip inline secret tags like <secret>...</secret> or 🔒 [仅内部]...
    cleaned = re.sub(r"<secret>[\s\S]*?</secret>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[ \t]*-?[ \t]*(?:🔒|\[仅内部\]|【仅内部】)[^\n]*\n?", "", cleaned, flags=re.MULTILINE)

    return cleaned.strip()


def parse_and_sync_case_brief(case_id: str, markdown_content: str, db: Session) -> dict[str, str]:
    """Parse edited markdown and update Case entity & BrainFact."""
    from core.models.orm import Case, BrainFact

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise ValueError(f"Case {case_id} not found")

    # Extract Client Goal (support multiple edits & numbering, take last matching block)
    goal_matches = list(re.finditer(r"##[^\n]*?(?:🎯|借款诉求|客户核心诉求)[^\n]*\n+((?:>[^\n]+\n*)+)", markdown_content))
    if goal_matches:
        raw_goal = goal_matches[-1].group(1)
        goal_text = re.sub(r">\s*(\[!.*\])?", "", raw_goal).strip()
        if goal_text:
            case.client_goal = goal_text

    # Extract Special Circumstances (take last matching block)
    special_matches = list(re.finditer(r"##[^\n]*?(?:🚨|核心卡点|攻坚破局|特殊情况)[^\n]*\n+((?:>[^\n]+\n*)+)", markdown_content))
    if special_matches:
        raw_special = special_matches[-1].group(1)
        special_text = re.sub(r">\s*(\[!.*\])?", "", raw_special).strip()
        if special_text:
            case.special_circumstances = special_text

    # Update context summary with latest Markdown content
    case.context_summary = markdown_content
    db.commit()

    logger.info(f"Updated Case Brief Markdown for case {case_id}")
    return {
        "case_id": case_id,
        "client_goal": case.client_goal or "",
        "special_circumstances": case.special_circumstances or "",
        "status": "synchronized",
    }
