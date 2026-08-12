"""Shared JSON utilities for safely parsing potentially double-encoded JSON strings.

Used across routes where extracted_data may be stored as double/triple-encoded
JSON strings due to legacy pipeline behavior.
"""

from __future__ import annotations

import json
from typing import Any


def safe_parse_json(raw: str | dict | None, *, max_passes: int = 3) -> dict[str, Any]:
    """Parse a potentially multi-encoded JSON string into a dict.

    Handles the case where a JSON string has been json.dumps'd multiple times
    (e.g., '"{\"key\": \"val\"}"' → {"key": "val"}).

    Args:
        raw: The raw value to parse. Can be None, a dict, or a string.
        max_passes: Maximum number of json.loads attempts (default 3).

    Returns:
        Parsed dict, or empty dict if parsing fails or input is None.
    """
    if raw is None:
        return {}
    val: Any = raw
    for _ in range(max_passes):
        if isinstance(val, str):
            try:
                val = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                break
        else:
            break
    return val if isinstance(val, dict) else {}
