"""双文草稿正文的拼装与拆分（Vera 看中文、复制英文）。"""

from __future__ import annotations

DRAFT_BI_MARKER_ZH = "【中文版】"
DRAFT_BI_MARKER_EN = "【英文版】"


def build_bilingual_body(zh: str, en: str) -> str:
    """按约定拼装双文草稿正文（Vera 看中文、复制英文）。"""
    return f"{DRAFT_BI_MARKER_ZH}\n{zh.strip()}\n\n{DRAFT_BI_MARKER_EN}\n{en.strip()}"


def split_bilingual_body(body: str) -> tuple[str, str]:
    """从双文草稿正文中拆出 中文版 / 英文版（无标记时整体视为中文版）。"""
    if not body:
        return "", ""
    idx = body.find(DRAFT_BI_MARKER_EN)
    if idx == -1:
        return body.strip(), ""
    zh = body[:idx].replace(DRAFT_BI_MARKER_ZH, "").strip()
    en = body[idx + len(DRAFT_BI_MARKER_EN):].strip()
    return zh, en
