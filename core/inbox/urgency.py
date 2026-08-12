"""紧急邮件检测 — 纯规则引擎，秒级执行，不调 AI。

扫描邮件标题 + 正文前 500 字，匹配预定义的紧急关键词模式。
命中 → 标记为 urgent，前端红色高亮 + 铃铛通知。

Red Line compliance:
- 纯本地正则匹配，不调用外部 API
- 不写入客户文件夹
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from core.logger import get_logger

logger = get_logger(__name__)


# ── 紧急关键词模式（来自规划文档第四节）──
URGENT_PATTERNS: list[str] = [
    r"outstanding.*condition",
    r"finance.*clause",
    r"valuation.*report",
    r"approval.*letter",
    r"unconditional",
    r"urgent|ASAP|紧急",
    r"deadline|到期|逾期",
    r"settlement.*booked",
    r"time.?sensitive",
    r"expire|expir",
    r"final.*notice",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in URGENT_PATTERNS]


@dataclass
class UrgencyResult:
    """紧急检测结果。

    Attributes:
        is_urgent: 是否命中紧急规则。
        matched_pattern: 命中的正则模式字符串（追溯用）。
    """

    is_urgent: bool
    matched_pattern: str | None = None


def detect_urgency(subject: str, body_preview: str) -> UrgencyResult:
    """检测邮件是否紧急。

    扫描 subject + body_preview 前 500 字，匹配任意一个紧急模式即判定为紧急。

    Args:
        subject: 邮件标题。
        body_preview: 邮件正文前 500 字。

    Returns:
        UrgencyResult 包含是否紧急和命中的模式。
    """
    text = f"{subject} {body_preview[:500]}"

    for pattern in _COMPILED_PATTERNS:
        if pattern.search(text):
            logger.debug(
                "Urgent pattern matched: %r in subject=%r",
                pattern.pattern,
                subject[:60],
            )
            return UrgencyResult(is_urgent=True, matched_pattern=pattern.pattern)

    return UrgencyResult(is_urgent=False)
