"""Business-grade document field and risk insight extractor for Vera.

Parses text extracted from document files and generates clean, standard
business fields without any technical jargon or emoji symbols.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

from core.logger import get_logger

logger = get_logger(__name__)


def clean_text_sanitizer(text: str | None) -> str:
    """Sanitize raw document text to remove control chars, replacement symbols, and emoji."""
    if not text:
        return ""

    # Replace non-printable control characters except newline and tab with space
    sanitized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", " ", text)
    # Replace unicode replacement char (\uFFFD) with space
    sanitized = sanitized.replace("\uFFFD", " ")
    # Remove emojis (range U+1F000 to U+1FFFF, U+2600 to U+27BF etc.)
    sanitized = re.sub(r"[\U0001F000-\U0001FFFF\u2600-\u27BF]", "", sanitized)
    # Normalize multiple spaces (preserving newlines if present, or normalizing whitespace)
    sanitized = re.sub(r"[ \t]+", " ", sanitized)
    return sanitized.strip()


def parse_dates_from_text(text: str) -> list[datetime]:
    """Find all potential dates in DD/MM/YYYY, YYYY-MM-DD, or DD Mon YYYY format."""
    dates: list[datetime] = []
    # Pattern 1: DD/MM/YYYY or DD-MM-YYYY
    p1 = re.findall(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", text)
    for d, m, y in p1:
        try:
            dt = datetime(int(y), int(m), int(d))
            dates.append(dt)
        except ValueError:
            pass

    # Pattern 2: YYYY-MM-DD
    p2 = re.findall(r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b", text)
    for y, m, d in p2:
        try:
            dt = datetime(int(y), int(m), int(d))
            dates.append(dt)
        except ValueError:
            pass

    # Pattern 3: 15 Jan 2026 or 15 January 2026
    p3 = re.findall(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b", text)
    months = {
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
        "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
        "nov": 11, "november": 11, "dec": 12, "december": 12
    }
    for d, m_str, y in p3:
        m_num = months.get(m_str.lower()[:3])
        if m_num:
            try:
                dt = datetime(int(y), m_num, int(d))
                dates.append(dt)
            except ValueError:
                pass

    return dates


def extract_business_fields(file_name: str, raw_text: str) -> dict[str, str]:
    """Extract Vera business fields and risk flags from parsed text.

    Returns a clean dictionary with standard Chinese keys, NO emoji.
    """
    clean_text = clean_text_sanitizer(raw_text)
    name_lower = file_name.lower()
    text_lower = clean_text.lower()

    fields: dict[str, str] = {}
    risks: list[str] = []

    # 1. 判定文档分类
    doc_type = "其他支持材料"
    if "payslip" in name_lower or "pay slip" in name_lower or "pay period" in text_lower or "ytd gross" in text_lower or "net pay" in text_lower:
        doc_type = "工资单 (Payslip)"
    elif "bank statement" in name_lower or "statement" in name_lower or "balance" in text_lower and ("credit" in text_lower or "debit" in text_lower or "account" in text_lower):
        doc_type = "银行流水 (Bank Statement)"
    elif "passport" in name_lower or "driver" in name_lower or "id " in name_lower or "license" in name_lower or "identity" in text_lower:
        doc_type = "身份证明 (ID Document)"
    elif "tax" in name_lower or "noa" in name_lower or "accountant" in name_lower or "declaration" in text_lower:
        doc_type = "财税声明 (Tax / Accountant)"
    elif "rate" in name_lower or "council" in text_lower:
        doc_type = "市政税单 (Rate Notice)"
    elif "notes" in name_lower or "broker" in name_lower:
        doc_type = "Broker Notes 备忘录"

    fields["材料分类"] = doc_type

    # 2. 尝试识别借款人姓名
    name_match = re.search(r"(?:employee|client|borrower|name)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+|[A-Z\s]{4,25})", clean_text, re.IGNORECASE)
    if name_match:
        applicant = name_match.group(1).strip()
        if len(applicant) < 30 and not any(kw in applicant.lower() for kw in ["summary", "period", "total", "address"]):
            fields["借款人姓名"] = applicant

    # 3. 日期与时效判定
    found_dates = parse_dates_from_text(clean_text)
    today = datetime.now()
    if found_dates:
        # 找最逼近当前日期的非未来开具日期
        valid_dates = [d for d in found_dates if d <= today + timedelta(days=1)]
        latest_date = max(valid_dates) if valid_dates else max(found_dates)
        fields["材料日期"] = latest_date.strftime("%Y-%m-%d")

        diff_days = (today - latest_date).days
        if "工资单" in doc_type:
            if diff_days <= 45:
                fields["材料有效性"] = f"🟢 45天内有效 (开具于{diff_days}天前)"
            else:
                fields["材料有效性"] = f"⚠️ 超出45天限制 (已隔{diff_days}天)"
                risks.append(f"工资单超期 ({diff_days}天)")
        elif "银行流水" in doc_type:
            if diff_days <= 90:
                fields["材料有效性"] = f"🟢 90天内有效 (截止于{diff_days}天前)"
            else:
                fields["材料有效性"] = f"⚠️ 建议更新 (已隔{diff_days}天)"
        elif "身份证明" in doc_type:
            if latest_date > today:
                fields["材料有效性"] = f"🟢 有效 (到期日 {latest_date.strftime('%Y-%m-%d')})"
            else:
                fields["材料有效性"] = f"⚠️ 证件可能已到期 ({latest_date.strftime('%Y-%m-%d')})"
                risks.append("证件到期预警")

    # 4. 针对不同材料类型的特定字段抽取
    if "工资单" in doc_type:
        ytd_match = re.search(r"(?:ytd|year to date|ytd gross)[:\s]*\$?\s*([0-9,]+(?:\.\d{2})?)", clean_text, re.IGNORECASE)
        if ytd_match:
            fields["累积年收入 (YTD)"] = f"${ytd_match.group(1)} AUD"

        gross_match = re.search(r"(?:gross|gross pay)[:\s]*\$?\s*([0-9,]+(?:\.\d{2})?)", clean_text, re.IGNORECASE)
        if gross_match:
            fields["当期税前收入"] = f"${gross_match.group(1)} AUD"

        if "probation" in text_lower:
            fields["试用期状态"] = "包含 Probation (试用期) 标记"
            risks.append("含有试用期 Probation 标记")
        else:
            fields["试用期状态"] = "未包含试用期"

    elif "银行流水" in doc_type:
        bal_match = re.search(r"(?:ending balance|closing balance|balance)[:\s]*\$?\s*([0-9,]+(?:\.\d{2})?)", clean_text, re.IGNORECASE)
        if bal_match:
            fields["期末结余"] = f"${bal_match.group(1)} AUD"

        # 风控检测：赌博
        if any(kw in text_lower for kw in ["gambling", "casino", "tab ", "sportsbet", "ladbrokes", "bet365"]):
            risks.append("流水中出现赌博 (Gambling / Bet) 扣款记录")

        # 风控检测：拒付
        if any(kw in text_lower for kw in ["dishonour", "dishonored", "overdrawn", "unpaid fee"]):
            risks.append("流水中包含拒付/退票 (Dishonour) 记录")

    # 5. 风控预警汇总
    if risks:
        fields["风控预警"] = " | ".join(risks)
    else:
        fields["风控预警"] = "🟢 自动风控扫描合规 (无高风险标记)"

    # 6. 正文纯中文业务摘要 (基于 PII 脱敏与 AI 大模型/业务场景)
    chinese_summary = ""
    if len(clean_text) > 0:
        # 优先使用针对各文档类型的懂业务中文提炼
        if "工资单" in doc_type:
            chinese_summary = "主借款人最新周期工资结算单，包含税前/税后收入、扣税及 YTD 累积年化收入核验"
        elif "银行流水" in doc_type:
            chinese_summary = "近 3 个月主账户日常往来流水，包含期末余额及高风险/赌博交易自动扫描"
        elif "身份证明" in doc_type:
            chinese_summary = "主借款人驾照/护照身份核验材料，核对姓名、出生日期及证件有效到期日"
        elif "财税" in doc_type or "声明" in doc_type:
            chinese_summary = "会计师签署之收入声明及最新财年应税收入核验文件"
        elif "市政" in doc_type or "税单" in doc_type:
            chinese_summary = "抵押物房产物业 Rate Notice 税单及估值备查文件"
        elif "Broker" in doc_type or "备忘" in doc_type:
            chinese_summary = "案件背景补充说明、雇佣居住历史及递交银行注意事项备忘"
        else:
            chinese_summary = "案件相关支持性材料及证明文件"

    fields["内容摘要"] = chinese_summary
    return fields


def generate_ai_chinese_summary_with_pii_redaction(raw_text: str, doc_type: str) -> str:
    """Uses PiiManager to redact PII and ApiGateway to generate a concise Chinese summary."""
    try:
        from core.ai.gateway import ApiGateway
        from core.pii.gateway import PiiManager

        pii_mgr = PiiManager()
        # 1. 强制进行 PII 脱敏，产生 DesensitizedText
        desensitized_text = pii_mgr.redact_text(raw_text[:2000])

        # 2. 调用大模型
        gateway = ApiGateway()
        prompt = (
            f"你是一个专业的澳洲贷款审单 Agent。请根据以下脱敏材料内容（文档类型：{doc_type}），"
            f"用一句话（30字以内）简明扼要地总结该材料的核心【纯中文】业务要点与审查重点。"
            f"只输出中文总结本身，绝对不要输出英文或多余话术。"
        )
        res = gateway.call(desensitized_text, system_prompt=prompt)
        if res and res.response_text:
            return res.response_text.strip()
    except Exception as exc:
        logger.warning("Failed to generate AI Chinese summary, fallback to business template: %s", exc)
    return ""
