"""文件 → 清单项 反向匹配。

文件到达后，用文件名 + AI 分类结果反向找出它可能满足哪些全集清单项，
供"清单驱动视图"自动建议标记已满足（Vera 确认，不自动标记已收）。

匹配维度：
    1. aliases 子串命中文件名（小写归一化）；
    2. aliases 命中分类标签（对齐 core/pipeline/classifier.py）；
    3. 命中 case_checklist_ids 时仅返回案件现有清单项，否则返回全部候选。
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from core.logger import get_logger

logger = get_logger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_MIN_ALIAS_LEN = 3


def _load_master() -> list[dict]:
    """读取 config/checklist_master.yaml 的 items 列表（按模块路径定位）。"""
    path = _PROJECT_ROOT / "config" / "checklist_master.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data["items"]


def _normalize(name: str) -> str:
    """文件名/分类归一化：小写 + 去扩展名 + 去非字母数字。"""
    text = re.sub(r"\.[a-z0-9]{1,6}$", "", (name or "").lower())
    return re.sub(r"[^a-z0-9]+", "", text)


def match_file_to_checklist_items(
    file_name: str,
    file_classification: str,
    case_checklist_ids: list[str],
    db: Session,  # 保留签名，为后续记忆/别名扩展预留
) -> list[str]:
    """返回该文件可能满足的清单项 ID 列表。

    Args:
        file_name: 原始文件名（如 "Payslip_Jul.pdf"）。
        file_classification: 分类结果（如 "Payslip" / "payslip" / 空串）。
        case_checklist_ids: 案件当前已选清单项 ID；为空时返回全部候选。
        db: SQLAlchemy session（预留，暂未使用）。

    Returns:
        匹配到的全集清单项 id 列表（按主库顺序）。
    """
    plain = _normalize(file_name)
    cls = _normalize(file_classification)

    candidates: list[str] = []
    for it in _load_master():
        aliases = {_normalize(a) for a in (it.get("aliases") or [])}
        if not aliases:
            continue
        hit = any(a and len(a) >= _MIN_ALIAS_LEN and a in plain for a in aliases)
        if not hit and cls and any(a == cls or a in cls for a in aliases):
            hit = True
        if hit:
            candidates.append(it["id"])

    if not candidates:
        return []

    allowed = {str(i) for i in (case_checklist_ids or []) if i}
    if allowed:
        filtered = [c for c in candidates if c in allowed]
        # 案件清单里没有这些项时仍返回全部候选，供前端"添加到清单"建议
        return filtered or candidates
    return candidates