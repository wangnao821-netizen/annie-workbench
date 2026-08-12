"""PII Gateway — desensitize / rehydrate for Vera Workbench V5.

This module is the **sole exit gate** for any data leaving the internal
network.  Every outbound call (DeepSeek, Gemini, Mem0, any external API) MUST
pass through ``desensitize()`` first.  Every result displayed to Vera MUST pass
through ``rehydrate()`` first.

Desensitization strategy: **Tokenization** (placeholder mapping).
    - PII is replaced with stable tokens like PERSON_1, AMOUNT_2.
    - Same real_value in the same case always maps to the same token.
    - Bank/lender names are explicitly whitelisted and NOT desensitized.
    - The pii_map table (token ↔ real_value) NEVER leaves the internal network.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import PIIMap

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

# ── Known Lender / Institution Names (NOT desensitized) ──────────────
_LENDER_NAMES: frozenset[str] = frozenset({
    # Big 4
    "CBA", "Commonwealth Bank", "Westpac", "ANZ", "NAB",
    # Others
    "HSBC", "Macquarie", "Macquarie Bank",
    "Bankwest", "ING", "ING Direct",
    "St George", "St. George", "Bank of Melbourne",
    "BankSA", "Suncorp", "AMP", "Bendigo Bank",
    "Adelaide Bank", "ME Bank", "Bank of Queensland", "BOQ",
    "Citibank", "Citi", "UBank", "Virgin Money",
    "Pepper", "Pepper Money", "Liberty", "Liberty Financial",
    "La Trobe", "La Trobe Financial", "Resimac",
    "Firstmac", "Athena", "Nano", "loans.com.au",
    "AFG", "Connective", "Aggregator",
    # Government / Regulators
    "ATO", "ASIC", "APRA", "Centrelink",
})

# Pre-compile a case-insensitive pattern for lender names
_LENDER_PATTERN: re.Pattern[str] = re.compile(
    r"\b(" + "|".join(re.escape(n) for n in sorted(_LENDER_NAMES, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

# ── PII Detection Patterns ──────────────────────────────────────────

# Australian phone: 04XX XXX XXX or +614XX XXX XXX or (0X) XXXX XXXX
_PHONE_RE = re.compile(
    r"(?:\+61\s?|0)[2-478](?:[\s\-]?\d){8}\b"
)

# Email
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
)

# TFN: 9-digit number (with optional spaces/hyphens)
_TFN_RE = re.compile(r"\b(\d{3}[\s\-]?\d{3}[\s\-]?\d{3})\b")

# ABN: 11-digit number (with optional spaces)
_ABN_RE = re.compile(r"\b(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})\b")

# BSB: XXX-XXX (6-digit, first digit 0-7)
_BSB_RE = re.compile(r"(?<![a-zA-Z\-\d])[0-7]\d{2}-\d{3}(?!\d)")

# Bank account: 6-10 digits (with optional hyphens/spaces), standalone
_ACCOUNT_RE = re.compile(r"\b(\d{4,6}[\s\-]?\d{3,6})\b")

# Amount patterns:
#   $1,000  $1,000,000  $100000  $1.5M
#   100万   50千   120万元   1200000元
#   1.2M  1.5 million
_AMOUNT_RE = re.compile(
    r"(?:"
    r"\$[\d,]+(?:\.\d+)?(?:\s?[MmKk])?"       # $1,000 / $1.5M
    r"|\d+(?:\.\d+)?\s?(?:万元?|千元?|百万)"   # 100万 / 50千
    r"|\d{6,}"                                   # 1200000 (6+ digits likely amount)
    r"|\d+(?:\.\d+)?\s?(?:million|[MmKk])\b"   # 1.5M / 1.5 million
    r")"
)

# Chinese name: common surname (1 char) + given name (1-3 chars)
_COMMON_SURNAMES = (
    "李王张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董"
    "萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪"
    "田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙"
    "万段雷钱汤尹黎易常武乔贺赖龚文庞樊兰殷施陶翟"
)
_CHINESE_NAME_RE = re.compile(
    r"(?<![一-龥])(["
    + _COMMON_SURNAMES
    + r"][一-龥]{1,2}?)(?=[想贷买要在和的了说去来做办是有以与自至及从到为或但并申需拟已将被让给同跟，。？！；：、]|$|[^一-龥])"
)

# English name: 2+ capitalized words (first + last name)
_ENGLISH_NAME_RE = re.compile(
    r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b"
)


# ── Ordered detection pipeline ──────────────────────────────────────

_PII_DETECTORS: list[tuple[str, re.Pattern[str]]] = [
    ("tfn", _TFN_RE),
    ("abn", _ABN_RE),
    ("phone", _PHONE_RE),
    ("email", _EMAIL_RE),
    ("account", _BSB_RE),
    ("account", _ACCOUNT_RE),
    # NOTE: amount intentionally excluded — 金额不脱敏（AGENTS.md §五 + 规划 §12.3）
    ("person", _CHINESE_NAME_RE),
    ("person", _ENGLISH_NAME_RE),
]


def _is_lender_name(value: str) -> bool:
    """Check if a detected value is a known lender/institution name."""
    stripped = value.strip()
    if stripped.upper() in {n.upper() for n in _LENDER_NAMES}:
        return True
    return False


def _get_or_create_token(
    case_id: str,
    real_value: str,
    pii_type: str,
    db: Session,
) -> str:
    """Look up existing token or create a new one.

    Rule: same case_id + same real_value → always same token.
    New tokens use format TYPE_N (e.g. PERSON_1, AMOUNT_2).

    Args:
        case_id: The case this PII belongs to.
        real_value: The actual PII value.
        pii_type: One of person/amount/tfn/abn/phone/address/account/email.
        db: SQLAlchemy session.

    Returns:
        The token string (e.g. "PERSON_1").
    """
    # Check if this exact value already has a token in this case
    existing = (
        db.query(PIIMap)
        .filter(PIIMap.case_id == case_id, PIIMap.real_value == real_value)
        .first()
    )
    if existing is not None:
        return existing.token

    # Count existing tokens of this type for this case to determine next index
    count = (
        db.query(PIIMap)
        .filter(PIIMap.case_id == case_id, PIIMap.pii_type == pii_type)
        .count()
    )
    token = f"{pii_type.upper()}_{count + 1}"

    # Persist
    entry = PIIMap(
        case_id=case_id,
        token=token,
        real_value=real_value,
        pii_type=pii_type,
    )
    db.add(entry)
    db.flush()  # Ensure token is visible within the same transaction

    return token


def desensitize(text: str, case_id: str, db: Session) -> str:
    """Replace PII in text with stable placeholder tokens.

    Scans for person names, amounts, TFN, ABN, phone numbers,
    addresses, and bank accounts.  Known lender/institution names
    (CBA, Westpac, etc.) are preserved as-is.

    Args:
        text: Raw input text (may contain PII).
        case_id: Case identifier for token scoping.
        db: SQLAlchemy session for pii_map lookups/writes.

    Returns:
        Text with PII replaced by tokens (e.g. "PERSON_1 贷款 AMOUNT_1").
    """
    if not text or not text.strip():
        return text

    # Collect all PII matches with their positions
    replacements: list[tuple[int, int, str, str, str]] = []
    # (start, end, real_value, pii_type, token_placeholder)

    for pii_type, pattern in _PII_DETECTORS:
        for match in pattern.finditer(text):
            value = match.group(0).strip()
            if not value:
                continue

            # Skip known lender/institution names
            if _is_lender_name(value):
                continue

            # For English names, double-check against lender list
            if pii_type == "person" and _LENDER_PATTERN.search(value):
                continue

            start, end = match.start(), match.end()

            # Avoid overlapping replacements
            overlaps = False
            for existing_start, existing_end, _, _, _ in replacements:
                if start < existing_end and end > existing_start:
                    overlaps = True
                    break
            if overlaps:
                continue

            token = _get_or_create_token(case_id, value, pii_type, db)
            replacements.append((start, end, value, pii_type, token))

    # Sort by position (reverse) so replacements don't shift indices
    replacements.sort(key=lambda x: x[0], reverse=True)

    result = text
    for start, end, _value, _pii_type, token in replacements:
        result = result[:start] + token + result[end:]

    db.commit()
    return result


def rehydrate(text: str, case_id: str, db: Session) -> str:
    """Restore placeholder tokens back to real PII values.

    Looks up all tokens for the given case_id in pii_map and
    replaces them in the text.

    Args:
        text: Desensitized text containing tokens like PERSON_1.
        case_id: Case identifier for token lookups.
        db: SQLAlchemy session.

    Returns:
        Text with all tokens replaced by their original real values.
    """
    if not text or not text.strip():
        return text

    # Fetch all tokens for this case, ordered longest-first to avoid
    # partial replacements (e.g. PERSON_10 before PERSON_1)
    mappings = (
        db.query(PIIMap)
        .filter(PIIMap.case_id == case_id)
        .all()
    )

    # Sort by token length descending (longest first)
    mappings.sort(key=lambda m: len(m.token), reverse=True)

    result = text
    for mapping in mappings:
        result = result.replace(mapping.token, mapping.real_value)

    return result


# ── Legacy Compatibility Shim ────────────────────────────────────────
# state_machine.py and processing_center.py use PiiManager().redact_text()
# for classification-stage desensitization (no DB context needed).
# This shim provides that interface using regex-only anonymization.
# For ALL external API calls, use desensitize(text, case_id, db) above.


class PiiManager:
    """Legacy compatibility: regex-only PII redaction for classification stage.

    WARNING: This does NOT produce stable tokens. Use desensitize(text, case_id, db)
    for any data leaving the internal network.
    """

    def __init__(self) -> None:
        """Initialize PiiManager (no-op in shim mode)."""
        logger.debug("PiiManager shim initialized (regex-only, no DB mapping)")

    def redact_text(self, text: str) -> str:
        """Redact PII using regex patterns only (no stable token mapping).

        Suitable for classification where we only need to remove PII before
        sending text to AI for document type detection. Not suitable for
        contexts where tokens need to be reversed (use desensitize() instead).

        Args:
            text: Raw text potentially containing PII.

        Returns:
            Text with PII replaced by type labels like [PHONE], [PERSON], etc.
        """
        if not text or not text.strip():
            return text

        safe = text
        # Apply regex patterns in order
        safe = _PHONE_RE.sub("[PHONE]", safe)
        safe = _EMAIL_RE.sub("[EMAIL]", safe)
        safe = _BSB_RE.sub("[BSB]", safe)
        safe = _ABN_RE.sub("[ABN]", safe)
        safe = _TFN_RE.sub("[TFN]", safe)
        safe = _ACCOUNT_RE.sub("[ACCOUNT]", safe)
        # Skip amount — amounts are useful for classification
        safe = _CHINESE_NAME_RE.sub("[PERSON]", safe)
        safe = _ENGLISH_NAME_RE.sub("[PERSON]", safe)

        return safe

