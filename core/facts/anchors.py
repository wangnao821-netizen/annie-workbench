"""规则锚定 — 金额/日期/银行/阶段不依赖 LLM（#5）。"""

from __future__ import annotations

import re

# 银行枚举（与 fact_schema bank.lender 对齐；名称大小写归一）
BANK_ALIASES = {
    "cba": "CBA", "commonwealth": "CBA", "commonwealth bank": "CBA",
    "anz": "ANZ", "nab": "NAB", "westpac": "Westpac", "st george": "St George",
}

# 阶段词 → fact_schema stage.current 枚举（与 core/constants 阶段语义一致）
STAGE_TERMS = {
    "建档": "gathering", "收集资料": "gathering", "收集": "gathering",
    "递交": "submitted", "递交中": "submitted",
    "补件": "awaiting_docs", "补材料": "awaiting_docs",
    "批准": "approved", "已批准": "approved",
    "结算": "settling", "结算中": "settling", "已结算": "settled",
}

_AMOUNT_RE = re.compile(r"(?:\$|AUD\s*)?([\d,]+(?:\.\d{1,2})?)\s*(万|w|k|千)?", re.IGNORECASE)
_DATE_RE = re.compile(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})")


def extract_rule_facts(content: str) -> list[dict]:
    """从文本提取可确定 key 的规则事实（bank.lender / stage.current）。

    Returns:
        列表：[{"key": "bank.lender", "value": "CBA", "category": "bank", "anchor": "rule"}]。
        金额/日期仅返回 token 证据（key 由 LLM 归属），不在此处硬猜归属。
    """
    facts: list[dict] = []
    lowered = content.lower()
    for alias, canonical in BANK_ALIASES.items():
        if alias in lowered:
            facts.append({"key": "bank.lender", "value": canonical, "category": "bank", "anchor": "rule"})
            break
    for term, canonical in STAGE_TERMS.items():
        if term in content:
            facts.append({"key": "stage.current", "value": canonical, "category": "stage", "anchor": "rule"})
            break
    return facts


def amount_tokens(content: str) -> list[str]:
    """返回金额证据 token（供 LLM 归属 key；不做金额→收入/负债判断）。"""
    return [m.group(0) for m in _AMOUNT_RE.finditer(content)]