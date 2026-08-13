"""文件信号提取 — 从指定文件文本中抽取申报相关信号（规则先行，不依赖 LLM）。"""

from __future__ import annotations

import re

# 申报关键维度 → 文件中的触发词（中文+英文）
SIGNAL_KEYWORDS = {
    "dependents": ["孩子", "子女", "depend", "child", "baby", "抚养"],
    "income": ["salary", "工资", "收入", "pay", "payslip", "年薪"],
    "living_expense": ["living", "生活", "expense", "支出", "rent", "租金", "还款"],
    "liability": ["loan", "贷款", "信用卡", "credit", "debt", "负债", "offset"],
    "occupation": ["engineer", "工程师", "自雇", "self-employed", "ABN", "director", "董事"],
    "visa": ["visa", "签证", "PR", "citizen", "公民", "临时"],
}


def evidence_lines(text: str, keyword: str, window: int = 40) -> list[str]:
    """返回 keyword 命中处的上下文片段（去重，最多 3 条）。"""
    snippets: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(re.escape(keyword), text, re.IGNORECASE):
        idx = match.start()
        snippet = text[max(0, idx - window) : idx + len(keyword) + window]
        snippet = " ".join(snippet.split())
        if snippet not in seen:
            seen.add(snippet)
            snippets.append(snippet)
        if len(snippets) >= 3:
            break
    return snippets


def extract_signals(text: str) -> dict[str, list[str]]:
    """从文本提取各维度的信号（命中关键词的原文片段，截断 40 字）。

    Returns:
        {"dependents": ["...原文片段..."], "income": [...], ...}（未命中维度为空列表）
    """
    signals: dict[str, list[str]] = {}
    for dim, keywords in SIGNAL_KEYWORDS.items():
        hits: list[str] = []
        for kw in keywords:
            for snippet in evidence_lines(text, kw):
                snippet = snippet if len(snippet) <= 40 else snippet[:40]
                if snippet not in hits:
                    hits.append(snippet)
        signals[dim] = hits[:3]
    return signals
