"""core/checklist/spoken_aliases.py — 对话口语材料别名网（P1 阶段）。

将用户在聊天对话中使用的各种口语化、通俗化信贷材料表述（如"供楼单"、"负债单"、"出粮单"、"地税单"），
归一化映射到标准材料 master_key 及文件搜索关键词列表。
"""

from __future__ import annotations

import re
from typing import Any

from core.checklist.matcher import CHECKLIST_ALIAS_MAP

# 对话口语材料映射表：口语短语 -> (master_key, 关联物理搜索关键词列表)
SPOKEN_PHRASE_TO_MASTER_KEY: dict[str, str] = {
    # 现有贷款 / 负债对账单
    "现有贷款对账单": "existing_loan_statement",
    "现有贷款": "existing_loan_statement",
    "贷款对账单": "existing_loan_statement",
    "负债对账单": "existing_loan_statement",
    "负债单": "existing_loan_statement",
    "供楼单": "existing_loan_statement",
    "还款单": "existing_loan_statement",
    "房贷对账单": "existing_loan_statement",
    "房贷流水": "existing_loan_statement",
    "月结单": "existing_loan_statement",
    "现有房贷": "existing_loan_statement",
    "贷款流水": "existing_loan_statement",
    "liability": "existing_loan_statement",
    "home loan": "existing_loan_statement",
    "homeloan": "existing_loan_statement",

    # 工资与雇佣收入
    "工资单": "payslip_2",
    "薪资单": "payslip_2",
    "出粮单": "payslip_2",
    "粮条": "payslip_2",
    "出粮记录": "payslip_2",
    "薪俸单": "payslip_2",
    "工资证明": "payslip_2",
    "payslip": "payslip_2",
    "雇佣信": "employment_letter",
    "工作信": "employment_letter",
    "工作证明": "employment_letter",
    "雇主推荐信": "employment_letter",
    "年度工资": "group_certificate",
    "payment summary": "group_certificate",
    "税局年结": "group_certificate",

    # 自雇与财报材料
    "会计信": "accountant_letter",
    "会计师信": "accountant_letter",
    "会计师声明": "accountant_letter",
    "自雇声明": "se_declaration",
    "收入声明": "se_declaration",
    "自雇收入声明": "se_declaration",
    "税表": "tax_return_2yr",
    "报税单": "tax_return_2yr",
    "报税表": "tax_return_2yr",
    "税单": "tax_return_2yr",
    "noa": "tax_return_2yr",
    "notice of assessment": "tax_return_2yr",
    "季度税表": "bas_statements",
    "bas": "bas_statements",
    "损益表": "profit_loss_statement",
    "pnl": "profit_loss_statement",
    "资产负债表": "balance_sheet",
    "公司查册": "asic_company_search",
    "公司流水": "business_bank_statement",

    # 房产与估价
    "估价报告": "valuation_report",
    "估值报告": "valuation_report",
    "房子估值": "valuation_report",
    "房屋估价": "valuation_report",
    "物业估值": "valuation_report",
    "估价单": "valuation_report",
    "valuation": "valuation_report",
    "地税单": "council_rates_notice",
    "市政费单": "council_rates_notice",
    "地税": "council_rates_notice",
    "市政费": "council_rates_notice",
    "rates notice": "council_rates_notice",
    "购房合同": "contract_of_sale",
    "买卖合同": "contract_of_sale",
    "房屋保险": "insurance_policy",
    "保单": "insurance_policy",
    "租约": "rental_agreement",
    "租赁合同": "rental_agreement",
    "租金流水": "rental_statement",

    # 银行流水与身份
    "银行流水": "personal_bank_statement",
    "个人流水": "personal_bank_statement",
    "存款证明": "personal_bank_statement",
    "3个月流水": "personal_bank_statement",
    "流水单": "personal_bank_statement",
    "护照": "passport",
    "驾照": "driver_license",
    "驾照复印件": "driver_license",
    "签证": "visa_grant",
    "vevo": "visa_grant",
    "永居信": "pr_grant_notice",
    "medicare": "medicare_card",
    "改名证明": "name_change_certificate",

    # 申请表与建议书
    "申请表": "application_form",
    "贷款申请表": "application_form",
    "submission pack": "application_form",
    "信贷建议书": "soca",
    "soca": "soca",
}


def resolve_spoken_query(query: str) -> dict[str, Any]:
    """将用户自然语言查询解析为对应的标准材料主键与扩展物理搜索词列表。

    Args:
        query: 用户的口语提问（如："查一下她的现有贷款对账单"、"看下出粮单"）。

    Returns:
        {
            "matched_master_key": str | None,
            "target_keywords": list[str],
            "raw_query": str
        }
    """
    raw = (query or "").strip()
    clean_q = raw.lower()

    # 1. 优先匹配最长口语短语
    matched_master_key = None
    sorted_phrases = sorted(SPOKEN_PHRASE_TO_MASTER_KEY.keys(), key=len, reverse=True)
    for phrase in sorted_phrases:
        if phrase in clean_q:
            matched_master_key = SPOKEN_PHRASE_TO_MASTER_KEY[phrase]
            break

    # 2. 获取该 master_key 对应的全量物理文件名搜索关键词
    target_keywords = [raw]
    if matched_master_key and matched_master_key in CHECKLIST_ALIAS_MAP:
        aliases = CHECKLIST_ALIAS_MAP[matched_master_key]
        for a in aliases:
            if a not in target_keywords:
                target_keywords.append(a)

    return {
        "matched_master_key": matched_master_key,
        "target_keywords": target_keywords,
        "raw_query": raw,
    }
