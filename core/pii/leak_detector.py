"""PII leak detection for loan-assistant.

This module scans text for Australian-specific PII patterns before
the text is sent to cloud AI APIs. If any PII is detected, the
operation is blocked and a critical-level log entry is written.

Detected PII types:
    - **Mobile**: Australian mobile numbers (04xx xxx xxx, +61 4xx xxx xxx)
    - **Landline**: Australian landline numbers (0[2,3,7,8]xx xxxx xxxx)
    - **Email**: Email addresses
    - **TFN**: Tax File Number (8-9 digits, validated with checksum)
    - **ABN**: Australian Business Number (11 digits, validated with checksum)
    - **BSB**: Bank-State-Branch (xxx-xxx format)
    - **MRZ**: Passport Machine Readable Zone (TD3 format, starts with ``P<``)
    - **Name**: Client names (matched against a provided list)

The "default replace" desensitization strategy (Phase 1C) replaces
all PII with placeholders before creating ``DesensitizedText``. This
detector serves as the **second line of defense** — if any PII slips
through desensitization, it is caught here before reaching the API.

Red line: **images are never sent to the cloud**. Only text that has
been desensitized and passed this detector may be sent.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import NamedTuple

from core.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


class PiiType(Enum):
    """Types of PII that can be detected."""

    MOBILE = "mobile"
    LANDLINE = "landline"
    EMAIL = "email"
    TFN = "tfn"
    ABN = "abn"
    BSB = "bsb"
    MRZ = "mrz"
    NAME = "name"


@dataclass(frozen=True)
class PiiMatch:
    """A single PII detection result.

    Attributes:
        type: The type of PII detected.
        value: The matched text (may be partially masked in logs).
        start: Start position in the scanned text.
        end: End position in the scanned text.
    """

    type: PiiType
    value: str
    start: int
    end: int

    def masked_value(self) -> str:
        """Return a masked version of the value for safe logging."""
        if len(self.value) <= 4:
            return "*" * len(self.value)
        return self.value[:2] + "*" * (len(self.value) - 4) + self.value[-2:]


class PiiLeakError(Exception):
    """Raised when PII is detected in text meant for cloud API.

    This is a **critical safety violation**. The text must not be
    sent to any external API. The calling code should log the event
    and abort the operation.
    """

    def __init__(self, matches: list[PiiMatch]) -> None:
        """Initialize with the list of detected PII matches.

        Args:
            matches: List of PII matches found in the text.
        """
        self.matches = matches
        types = ", ".join(m.type.value for m in matches)
        super().__init__(
            f"PII leak detected: {len(matches)} match(es) found ({types}). "
            f"Text must not be sent to cloud API."
        )


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Australian mobile: 04XX XXX XXX or +61 4XX XXX XXX (10 digits)
# Formats: 0412345678, 0412 345 678, 0412-345-678, +61 412 345 678
_MOBILE_PATTERN = re.compile(
    r"(?<!\d)(?:\+61[\s\-]?4|04)\d{2}[\s\-]?\d{3}[\s\-]?\d{3}(?!\d)"
)

# Australian landline: 0[2,3,7,8] XXXX XXXX or +61 [2,3,7,8] XXXX XXXX
# Formats: 0298765432, 02 9876 5432, 02-9876-5432, +61 2 9876 5432
_LANDLINE_PATTERN = re.compile(
    r"(?<!\d)(?:\+61[\s\-]?|0)[2378][\s\-]?\d{4}[\s\-]?\d{4}(?!\d)"
)

# Email addresses
_EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)

# TFN: 8-9 digits, commonly formatted as XXX XXX XXX or XXX-XXX-XXX
# Validated with checksum (weights: 1, 4, 3, 7, 5, 8, 6, 9, 10)
_TFN_PATTERN = re.compile(
    r"(?<!\d)\d{3}[\s\-]?\d{3}[\s\-]?\d{3}(?!\d)"
)

# ABN: 11 digits, commonly formatted as XX XXX XXX XXX
# Validated with checksum (weights after subtracting 1 from first digit:
# 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19; sum % 89 == 0)
_ABN_PATTERN = re.compile(
    r"(?<!\d)\d{2}[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{3}(?!\d)"
)

# BSB: 6 digits in XXX-XXX format
# First digit is the state code (0-7). This avoids matching things like
# Visa subclass numbers (e.g. "155-157" in URLs).
# Also require no preceding letter/hyphen to exclude URL fragments.
_BSB_PATTERN = re.compile(
    r"(?<![a-zA-Z\-\d])[0-7]\d{2}-\d{3}(?!\d)"
)

# Passport MRZ (TD3 format): first line starts with P< followed by
# 3-letter country code and name fields with < fillers
_MRZ_PATTERN = re.compile(
    r"P<[A-Z]{3}[A-Z<]{2,}"
)


# ---------------------------------------------------------------------------
# Checksum validators
# ---------------------------------------------------------------------------

_TFN_WEIGHTS = (1, 4, 3, 7, 5, 8, 6, 9, 10)
_ABN_WEIGHTS = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)


def _validate_tfn(digits: str) -> bool:
    """Validate a TFN using the official checksum algorithm.

    The TFN is 8 or 9 digits. For 8-digit TFNs, a leading 0 is assumed.
    The checksum uses weights (1, 4, 3, 7, 5, 8, 6, 9, 10) and the
    weighted sum must be divisible by 11.

    Args:
        digits: String of digits (non-digits already stripped).

    Returns:
        ``True`` if the checksum validates, ``False`` otherwise.
    """
    if len(digits) not in (8, 9):
        return False
    # Pad to 9 digits
    if len(digits) == 8:
        digits = "0" + digits
    total = sum(int(d) * w for d, w in zip(digits, _TFN_WEIGHTS, strict=False))
    return total % 11 == 0


def _validate_abn(digits: str) -> bool:
    """Validate an ABN using the official checksum algorithm.

    The ABN is 11 digits. The first digit is reduced by 1, then the
    weighted sum (weights: 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
    must be divisible by 89.

    Args:
        digits: String of 11 digits (non-digits already stripped).

    Returns:
        ``True`` if the checksum validates, ``False`` otherwise.
    """
    if len(digits) != 11:
        return False
    adjusted_first = int(digits[0]) - 1
    if adjusted_first < 0:
        return False
    total = adjusted_first * _ABN_WEIGHTS[0]
    total += sum(int(d) * w for d, w in zip(digits[1:], _ABN_WEIGHTS[1:], strict=False))
    return total % 89 == 0


# ---------------------------------------------------------------------------
# Pattern definition for the scanner
# ---------------------------------------------------------------------------


class _PatternDef(NamedTuple):
    """A regex pattern and its associated PII type and validator."""

    pii_type: PiiType
    pattern: re.Pattern[str]
    validator: Callable[[str], bool] | None


# Order matters: more specific patterns first to avoid partial matches
_PATTERNS: list[_PatternDef] = [
    _PatternDef(PiiType.MOBILE, _MOBILE_PATTERN, None),
    _PatternDef(PiiType.LANDLINE, _LANDLINE_PATTERN, None),
    _PatternDef(PiiType.EMAIL, _EMAIL_PATTERN, None),
    _PatternDef(PiiType.TFN, _TFN_PATTERN, _validate_tfn),
    _PatternDef(PiiType.ABN, _ABN_PATTERN, _validate_abn),
    _PatternDef(PiiType.BSB, _BSB_PATTERN, None),
    _PatternDef(PiiType.MRZ, _MRZ_PATTERN, None),
]


# ---------------------------------------------------------------------------
# PiiLeakDetector
# ---------------------------------------------------------------------------


class PiiLeakDetector:
    """Scans text for PII before cloud API calls.

    This is the second line of defense after the PII desensitization
    pipeline. If any PII is detected, the text must not be sent to
    a cloud API.

    Usage::

        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        detector.assert_clean(text_to_send)  # raises PiiLeakError if PII found

    Args:
        client_names: List of client names to scan for (e.g., extracted
            from the client folder name). Matching is case-insensitive.
    """

    def __init__(self, client_names: list[str] | None = None) -> None:
        """Initialize the PII leak detector.

        Args:
            client_names: List of client names to detect. Both the full
                name and individual name parts are checked.
        """
        # Store client name parts (lowercase) for case-insensitive matching
        self._name_parts: list[str] = []
        for name in client_names or []:
            name = name.strip()
            if not name:
                continue
            # Add the full name
            self._name_parts.append(name.lower())
            # Add individual parts (skip single-character parts)
            for part in name.split():
                part = part.strip()
                if len(part) > 1:
                    self._name_parts.append(part.lower())

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_parts: list[str] = []
        for p in self._name_parts:
            if p not in seen:
                seen.add(p)
                unique_parts.append(p)
        self._name_parts = unique_parts

        # Pre-compile word-boundary patterns to prevent false positives
        # (e.g., "Li" should not match inside "Liability")
        self._name_patterns: list[re.Pattern[str]] = [
            re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
            for name in self._name_parts
        ]

    def scan(self, text: str) -> list[PiiMatch]:
        """Scan text for PII and return all matches.

        Args:
            text: The text to scan.

        Returns:
            List of ``PiiMatch`` objects, one for each PII occurrence
            found. Returns an empty list if no PII is detected.
        """
        matches: list[PiiMatch] = []

        # Regex-based patterns
        for pdef in _PATTERNS:
            for m in pdef.pattern.finditer(text):
                matched_text = m.group()
                # Apply checksum validation if the pattern has a validator
                if pdef.validator is not None:
                    digits = re.sub(r"\D", "", matched_text)
                    if not pdef.validator(digits):
                        continue
                matches.append(
                    PiiMatch(
                        type=pdef.pii_type,
                        value=matched_text,
                        start=m.start(),
                        end=m.end(),
                    )
                )

        # Client name matching (case-insensitive, word-boundary aware)
        for pattern in self._name_patterns:
            for m in pattern.finditer(text):
                matches.append(
                    PiiMatch(
                        type=PiiType.NAME,
                        value=m.group(),
                        start=m.start(),
                        end=m.end(),
                    )
                )

        return matches

    def has_pii(self, text: str) -> bool:
        """Check if the text contains any PII.

        Args:
            text: The text to check.

        Returns:
            ``True`` if any PII is detected, ``False`` otherwise.
        """
        return len(self.scan(text)) > 0

    def assert_clean(self, text: str) -> None:
        """Assert that the text is free of PII.

        This is the main gate before sending text to a cloud API.
        If PII is detected, a critical log entry is written and
        ``PiiLeakError`` is raised.

        Args:
            text: The text to check.

        Raises:
            PiiLeakError: If any PII is detected in the text.
        """
        matches = self.scan(text)
        if matches:
            masked = [f"{m.type.value}({m.masked_value()})" for m in matches]
            logger.critical(
                f"PII leak detected before cloud API call: "
                f"{len(matches)} match(es): {', '.join(masked)}. "
                f"Operation blocked."
            )
            raise PiiLeakError(matches)
