"""Document classifier for Phase 1C.

Uses the ApiGateway to call LLMs for structuring document categories
and extracting metadata.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from core.ai.gateway import ApiGateway, LLMError, SafetyViolationError
from core.config import ConfigLoader
from core.logger import get_logger
from core.models.types import DesensitizedText

logger = get_logger(__name__)


@dataclass
class ClassificationResult:
    """Result of classifying a document."""

    document_type: str
    confidence: float
    source_label: str  # "client_original" | "internal" | "accountant"
    suggested_name: str
    extracted_data: dict[str, Any] = field(default_factory=dict)
    route_used: str = "llm"


def classify_and_extract(
    text: DesensitizedText,
    route: str,
    config: ConfigLoader,
    gateway: ApiGateway | None = None,
) -> ClassificationResult:
    """Classify a document and extract structured data using AI via ApiGateway.

    Args:
        text: Desensitized document text.
        route: Parse route (used for analytics).
        config: Configuration loader.
        gateway: Optional shared ApiGateway instance. If not provided,
            a new instance is created (for backward compatibility).

    Returns:
        A ``ClassificationResult`` with type, confidence, and suggested name.
    """
    if not isinstance(text, DesensitizedText):
        raise TypeError(
            f"classify_and_extract requires DesensitizedText, "
            f"got {type(text).__name__}"
        )

    # 1. Load Prompt
    prompt_path = config.project_root / "prompts" / "classify.txt"
    try:
        prompt_content = prompt_path.read_text(encoding="utf-8")
    except Exception as e:
        logger.error("Failed to read classify.txt: %s", e)
        prompt_content = "Classify the following document and output JSON:"

    # 2. Call LLM
    _gateway = gateway if gateway is not None else ApiGateway(config)
    try:
        api_result = _gateway.call_llm(
            text=text,
            prompt_template=prompt_content,
            system_prompt="You are an expert Australian mortgage broker assistant."
        )
    except SafetyViolationError:
        logger.warning("Classification blocked due to PII leak.")
        return _build_fallback("SafetyBlocked", config, raw_text=text, error="PII Leak")
    except LLMError as e:
        logger.error("Classification blocked due to LLM error: %s", e)
        return _build_fallback("NetworkError", config, raw_text=text, error=str(e))

    # 3. Parse JSON
    resp_text = api_result.response_text.strip()
    # Strip markdown quotes if any
    if resp_text.startswith("```json"):
        resp_text = resp_text[7:]
    if resp_text.startswith("```"):
        resp_text = resp_text[3:]
    if resp_text.endswith("```"):
        resp_text = resp_text[:-3]

    try:
        data = json.loads(resp_text.strip())
    except json.JSONDecodeError as e:
        logger.error("Failed to decode LLM JSON. Raw: %s", api_result.response_text)
        return _build_fallback("JSONError", config, error=str(e))

    doc_type = data.get("document_type", "Unknown")
    confidence = data.get("confidence", 0.0)
    source_label = data.get("source_label", "client_original")

    # Extract matching template dict
    rules = config.naming_rules.get("rules", {})
    rule = rules.get(doc_type, {})
    template = rule.get("template", "UNCLASSIFIED_{original_filename}")

    # 4. Generate suggested name based on naming rules
    try:
        suggested_name = template.format(
            original_filename="unknown",
            client_name="[Client]",
            employer=data.get("employer", "[Employer]") or "[Employer]",
            date=data.get("key_date", "[Date]") or "[Date]",
            bank=data.get("bank_name", "[Bank]") or "[Bank]",
            last4=data.get("account_last4", "[XXXX]") or "[XXXX]",
            date_range=data.get("period", "[Range]") or "[Range]",
            lender=data.get("bank_name", "[Lender]") or "[Lender]",
            subclass="[Sub]",
            year=data.get("key_date", "[Year]")[:4] if data.get("key_date") else "[Year]",
            quarter="[Q]",
            property_short="[Property]",
            description="[Desc]",
            round="[R]",
        )
    except KeyError:
        suggested_name = "UNCLASSIFIED_NamingRuleError"

    return ClassificationResult(
        document_type=doc_type,
        confidence=float(confidence),
        source_label=source_label,
        suggested_name=suggested_name,
        extracted_data=data,
        route_used=route,
    )


def _build_fallback(reason: str, config: ConfigLoader, raw_text: str = "", **kwargs: str) -> ClassificationResult:
    ext_dict = {"解析状态": "已进行离线规则解析", "错误提示": reason}
    doc_type = "Unknown"
    text_str = str(raw_text)

    if text_str:
        lowered = text_str.lower()
        if "payslip" in lowered or "gross pay" in lowered or "pay date" in lowered:
            doc_type = "Payslip"
        elif "bank" in lowered or "statement" in lowered or "bsb" in lowered:
            doc_type = "Bank Statement"
        elif "passport" in lowered or "driver" in lowered or "license" in lowered:
            doc_type = "ID Document"
        elif "employment" in lowered or "employer" in lowered:
            doc_type = "Employment Letter"

        # 简单提取几行关键文本
        lines = [line.strip() for line in text_str.splitlines() if line.strip()]
        for idx, line in enumerate(lines[:5]):
            ext_dict[f"文本提要_{idx+1}"] = line[:60]

    return ClassificationResult(
        document_type=doc_type,
        confidence=0.75 if doc_type != "Unknown" else 0.0,
        source_label="rule_fallback",
        suggested_name=f"[{doc_type}] Document.pdf" if doc_type != "Unknown" else "ERROR_Unclassified",
        extracted_data=ext_dict,
        route_used="fallback",
    )
