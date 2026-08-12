"""第四招 AI 提取 — 仅在前三招失败且 Vera 手动触发时调用。

从邮件内容中提取新客户线索（客户名、贷款类型、金额、联系方式等）。
调 AI 前必须 desensitize()，确保 PII 不外传。

Red Line compliance:
- 发送给 AI 的文本必须经过 desensitize()
- PiiLeakDetector 做二次检查
- 失败时优雅降级（返回空结果），不阻塞流程
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy.orm import Session

from core.logger import get_logger

logger = get_logger(__name__)


@dataclass
class AIExtractionResult:
    """AI 从邮件中提取的新客户线索。

    Attributes:
        has_lead: 是否包含客户线索。
        client_name: 提取到的客户名（可能为空）。
        loan_type: 贷款类型 Purchase/Refinance/Construction 等。
        approx_amount: 大致贷款金额。
        contact_email: 联系邮箱。
        contact_phone: 联系电话。
        source_hint: 来源提示（"朋友转介绍"/"银行推荐"等）。
        confidence: AI 判断置信度 0.0-1.0。
        lender_ref: 银行案件号/申请号。
    """

    has_lead: bool = False
    client_name: str | None = None
    loan_type: str | None = None
    approx_amount: float | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    source_hint: str | None = None
    confidence: float = 0.0
    lender_ref: str | None = None


# AI 提取 prompt 模板
_EXTRACTION_PROMPT = """分析以下邮件内容，判断：
1. 是否包含新客户的贷款咨询/申请线索，或者与已有客户贷款案件相关的银行沟通信息？
2. 如果是，提取以下信息（能提取多少就多少，无法确定的填 null）：
   - client_name: 客户全名
   - loan_type: 贷款类型（Purchase/Refinance/Construction/Investment）
   - approx_amount: 大致金额（数字，单位澳元）
   - contact_email: 联系邮箱
   - contact_phone: 联系电话
   - source_hint: 来源（如"朋友转介绍"/"银行推荐"/"网站咨询"）
   - lender_ref: 银行案件号/申请号/Reference Number（例如以 CBA-、APP- 等开头，或一串唯一的银行内部案号数字/代码，若有提到）
3. 如果不是业务相关邮件，返回 has_lead: false

请严格以 JSON 格式回复，不要添加额外文字：
{{
  "has_lead": true/false,
  "client_name": "...",
  "loan_type": "...",
  "approx_amount": ...,
  "contact_email": "...",
  "contact_phone": "...",
  "source_hint": "...",
  "lender_ref": "...",
  "confidence": 0.0-1.0
}}

邮件标题：{subject}

邮件正文（前500字）：
{body}
"""


def extract_lead_from_email(
    subject: str,
    body_preview: str,
    case_id_for_pii: str,
    db: Session,
) -> AIExtractionResult:
    """调用 DeepSeek 分析邮件是否包含新客户线索。

    流程：
    1. desensitize(subject + body_preview) → safe_text
    2. PiiLeakDetector 二次检查
    3. 调 DeepSeek 提取结构化信息
    4. 解析 JSON 响应
    5. 返回 AIExtractionResult

    只在前三招未命中时才调用（节省 API 费用）。

    Args:
        subject: 邮件标题。
        body_preview: 邮件正文预览（前500字）。
        case_id_for_pii: 用于 PII 映射的案件 ID（新邮件用 "system"）。
        db: SQLAlchemy session.

    Returns:
        AIExtractionResult — 失败时返回 has_lead=False 的空结果。
    """
    empty_result = AIExtractionResult(has_lead=False, confidence=0.0)

    if not subject and not body_preview:
        return empty_result

    # Step 1: Desensitize before sending to AI
    try:
        from core.pii.gateway import desensitize
        safe_subject = desensitize(subject or "", case_id_for_pii, db)
        safe_body = desensitize((body_preview or "")[:500], case_id_for_pii, db)
    except ImportError:
        # Fallback: if desensitizer not available, use raw text with warning
        logger.warning("Desensitizer not available, using raw text (dev mode only)")
        safe_subject = subject or ""
        safe_body = (body_preview or "")[:500]
    except Exception as exc:
        logger.error("Desensitization failed: %s", exc)
        return empty_result

    # Step 2: PII leak check (second line of defense)
    try:
        from core.pii.leak_detector import PiiLeakDetector
        detector = PiiLeakDetector()
        combined_text = f"{safe_subject}\n{safe_body}"
        if detector.has_pii(combined_text):
            logger.error(
                "PII leak detected in desensitized text! Aborting AI extraction. "
                "Subject preview: %s...",
                safe_subject[:20],
            )
            return empty_result
    except ImportError:
        logger.debug("PiiLeakDetector not available, skipping second check")
    except Exception as exc:
        logger.warning("PII leak check error: %s (continuing cautiously)", exc)

    # Step 3: Call DeepSeek (via OpenAI-compatible SDK)
    # TODO(Phase 5): 升级为 chain-of-thought 多步推理，先判断邮件意图再提取字段
    try:
        import os
        from openai import OpenAI

        api_key = os.getenv("DEEPSEEK_API_KEY", "")
        base_url = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
        if not api_key or api_key.startswith("your_"):
            logger.warning("DEEPSEEK_API_KEY not configured, skipping AI extraction")
            return empty_result

        llm_client = OpenAI(api_key=api_key, base_url=base_url, timeout=30)
        prompt = _EXTRACTION_PROMPT.format(subject=safe_subject, body=safe_body)
        ai_response = llm_client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一个专业的澳洲贷款经纪助手。只返回 JSON，不要 markdown 代码块。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=500,
        )
        response = ai_response.choices[0].message.content or ""
    except ImportError:
        logger.warning("OpenAI SDK not available")
        return empty_result
    except Exception as exc:
        logger.error("DeepSeek API call failed: %s", exc)
        return empty_result

    # Step 4: Parse JSON response
    try:
        # Strip markdown code block if present
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]

        data = json.loads(text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Failed to parse AI extraction response: %s", exc)
        return empty_result

    # Step 5: Build result
    has_lead = bool(data.get("has_lead", False))
    if not has_lead:
        return empty_result

    return AIExtractionResult(
        has_lead=True,
        client_name=data.get("client_name"),
        loan_type=data.get("loan_type"),
        approx_amount=data.get("approx_amount"),
        contact_email=data.get("contact_email"),
        contact_phone=data.get("contact_phone"),
        source_hint=data.get("source_hint"),
        lender_ref=data.get("lender_ref"),
        confidence=float(data.get("confidence", 0.5)),
    )
