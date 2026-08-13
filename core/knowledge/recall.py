"""Knowledge Recall — 统一的知识召回接口。

供策略引擎、Broker Notes、OS 处理等模块消费。
按优先级排序返回知识：
    1. Vera 确认过的 > AI 自动存的（权重 x1.5）
    2. 案件相关的 > 全局通用的
    3. 最近的 > 很久以前的

Red Line compliance:
    - 返回的内容已 rehydrate（本地操作，安全）
    - Mem0 搜索用的 query 不含 PII（query 是功能性描述）
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from core.knowledge.memory import recall
from core.logger import get_logger
from core.models.orm import KnowledgeEntry
from core.pii.gateway import rehydrate

logger = get_logger(__name__)


def recall_for_context(case_id: str, query: str, db: Session, limit: int = 10) -> str:
    """统一的知识召回接口，按优先级排序返回。

    结合 Mem0 向量搜索和本地 knowledge_entries 表，
    确保 Vera 确认过的经验获得更高优先级。

    Args:
        case_id: 案件 ID（用于案件记忆搜索和 rehydrate 上下文）。
        query: 搜索关键词/自然语言描述（功能性，不含 PII）。
        db: SQLAlchemy session。
        limit: 最大返回条数。

    Returns:
        格式化的知识文本，每行带 [Vera确认] 或 [AI记录] 前缀。
        如果无结果返回空字符串。
    """
    results: list[tuple[float, str, bool]] = []  # (score, content, vera_confirmed)

    # ── 1. 本地 knowledge_entries 搜索（SQLite LIKE） ──────────────

    # 第一层：案件记忆
    case_entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.case_id == case_id,
            KnowledgeEntry.layer == "case",
            KnowledgeEntry.content.ilike(f"%{query}%"),
        )
        .order_by(KnowledgeEntry.vera_confirmed.desc(), KnowledgeEntry.created_at.desc())
        .limit(limit)
        .all()
    )

    for entry in case_entries:
        # 案件记忆基础分 0.8, Vera 确认的 x1.5
        score = 0.8
        if entry.vera_confirmed:
            score *= 1.5
        # 时间衰减：最近的分数更高
        age_days = (datetime.now(UTC).replace(tzinfo=None) - (entry.created_at or datetime.now(UTC).replace(tzinfo=None))).days
        score *= max(0.5, 1.0 - age_days * 0.01)
        content = rehydrate(entry.content, case_id, db)
        results.append((score, content, entry.vera_confirmed))

    # 第二层：全局经验
    global_entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.layer == "global",
            KnowledgeEntry.content.ilike(f"%{query}%"),
        )
        .order_by(KnowledgeEntry.vera_confirmed.desc(), KnowledgeEntry.created_at.desc())
        .limit(limit)
        .all()
    )

    for entry in global_entries:
        # 全局经验基础分 0.6, Vera 确认的 x1.5
        score = 0.6
        if entry.vera_confirmed:
            score *= 1.5
        age_days = (datetime.now(UTC).replace(tzinfo=None) - (entry.created_at or datetime.now(UTC).replace(tzinfo=None))).days
        score *= max(0.5, 1.0 - age_days * 0.01)
        content = rehydrate(entry.content, entry.case_id or case_id, db)
        results.append((score, content, entry.vera_confirmed))

    # 第三层：行业知识（lender-specific）
    # Try to get lender from case knowledge entries or search broadly
    lender_entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.layer == "industry",
            KnowledgeEntry.content.ilike(f"%{query}%"),
        )
        .order_by(KnowledgeEntry.created_at.desc())
        .limit(5)
        .all()
    )
    for entry in lender_entries:
        score = 0.5  # 行业知识基础分
        if entry.vera_confirmed:
            score *= 1.5
        content = rehydrate(entry.content, case_id, db)
        results.append((score, content, entry.vera_confirmed))

    # ── 1.5 BrainFact 语义检索（sqlite-vec，本地 BGE；不可用自动跳过） ──
    try:
        from core.knowledge.vector import semantic_search

        semantic_hits = semantic_search(db, query, case_id=case_id, track="internal", limit=5)
    except Exception as exc:  # noqa: BLE001 — 语义层失败不阻断，回退既有路径
        logger.warning("semantic recall failed: %s", exc)
        semantic_hits = []
    for hit in semantic_hits:
        results.append((0.9, f"[语义] {hit['key']}: {hit['value']}", True))

    # ── 2. Mem0 向量搜索补充（如果可用） ──────────────────────────

    try:
        mem0_text = recall(case_id, query, db)
        if mem0_text:
            # Mem0 结果已经 rehydrate 过（recall 内部处理），
            # 但无法知道 vera_confirmed 状态，给中等基础分
            for line in mem0_text.split("\n"):
                line = line.strip()
                if line and line not in [r[1] for r in results]:  # 去重
                    results.append((0.5, line, False))
    except Exception as exc:  # noqa: BLE001 — Mem0 兜底失败降级
        logger.warning("Mem0 recall failed in recall_for_context: %s", exc)

    # ── 3. 排序 + 格式化 ──────────────────────────────────────────

    results.sort(key=lambda x: x[0], reverse=True)
    results = results[:limit]

    if not results:
        return ""

    lines = []
    for _score, content, vera_confirmed in results:
        prefix = "[Vera确认]" if vera_confirmed else "[AI记录]"
        lines.append(f"{prefix} {content}")

    return "\n".join(lines)


def recall_case_context(case_id: str, db: Session, limit: int = 5) -> str:
    """召回案件的核心上下文（无需搜索词）。

    用于策略引擎和 Broker Notes 需要完整案件背景时。

    Args:
        case_id: 案件 ID。
        db: SQLAlchemy session。
        limit: 最大返回条数。

    Returns:
        案件核心记忆的格式化文本。
    """
    entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.case_id == case_id,
            KnowledgeEntry.layer == "case",
        )
        .order_by(KnowledgeEntry.vera_confirmed.desc(), KnowledgeEntry.created_at.desc())
        .limit(limit)
        .all()
    )

    if not entries:
        return ""

    lines = []
    for entry in entries:
        prefix = "[Vera确认]" if entry.vera_confirmed else "[AI记录]"
        content = rehydrate(entry.content, case_id, db)
        lines.append(f"{prefix} {content}")

    return "\n".join(lines)


def recall_lender_experience(lender: str, query: str, db: Session, limit: int = 5) -> str:
    """召回特定银行的经验知识。

    用于策略引擎推荐银行、OS 回复建议等场景。

    Args:
        lender: 银行简称（如 "CBA"）。
        query: 搜索关键词。
        db: SQLAlchemy session。
        limit: 最大返回条数。

    Returns:
        该银行相关经验的格式化文本。
    """
    entries = (
        db.query(KnowledgeEntry)
        .filter(
            KnowledgeEntry.lender == lender,
            KnowledgeEntry.layer.in_(["global", "industry"]),
            KnowledgeEntry.content.ilike(f"%{query}%"),
        )
        .order_by(KnowledgeEntry.vera_confirmed.desc(), KnowledgeEntry.created_at.desc())
        .limit(limit)
        .all()
    )

    if not entries:
        return ""

    lines = []
    for entry in entries:
        prefix = "[Vera确认]" if entry.vera_confirmed else "[AI记录]"
        content = entry.content  # 行业知识不一定需要 rehydrate（可能无 PII）
        lines.append(f"{prefix} {content}")

    return "\n".join(lines)