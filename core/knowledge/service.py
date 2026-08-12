"""Knowledge Service — 三层知识体系核心 CRUD 服务。

管理案件记忆(case)/全局经验(global)/行业知识库(industry)的增删改查，
以及 Vera 确认、Mem0 同步等操作。

Red Line compliance:
    - create/update 出站时调 desensitize() 再存入 Mem0
    - list/get 响应调 rehydrate() 还原明文（仅后端本地操作）
    - pii_map 永不暴露给外部
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import func
from sqlalchemy.orm import Session

# TODO: memory 接口对齐 # _get_mem0
from core.pii.gateway import desensitize, rehydrate
from core.logger import get_logger
from core.models.orm import CaseKnowledge, KnowledgeEntry

logger = get_logger(__name__)

# lender_policies.yaml 路径
_CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"
_LENDER_POLICIES_PATH = _CONFIG_DIR / "lender_policies.yaml"

# 政策类知识建议复核周期（天）
REVIEW_CYCLE_DAYS = 90

# 缓存
_lender_policies: dict[str, Any] | None = None


def _is_stale(entry: KnowledgeEntry, now: datetime | None = None) -> bool:
    """判断行业知识条目是否"可能过期"（超过复核周期未核实）。"""
    now = now or datetime.utcnow()
    if entry.last_verified_at is not None:
        return (now - entry.last_verified_at).days > REVIEW_CYCLE_DAYS
    if entry.created_at is not None:
        return (now - entry.created_at).days > REVIEW_CYCLE_DAYS
    return False


def _load_lender_policies() -> dict[str, Any]:
    """Load and cache lender_policies.yaml.

    Returns:
        Parsed YAML dict with lender data.
    """
    global _lender_policies
    if _lender_policies is None:
        if _LENDER_POLICIES_PATH.exists():
            with open(_LENDER_POLICIES_PATH, encoding="utf-8") as f:
                _lender_policies = yaml.safe_load(f) or {}
        else:
            logger.warning("lender_policies.yaml not found at %s", _LENDER_POLICIES_PATH)
            _lender_policies = {}
    return _lender_policies


def _generate_id() -> str:
    """Generate a unique knowledge entry ID."""
    return f"ke_{uuid.uuid4().hex[:12]}"


def _parse_tags(tags: str | list[str] | None) -> list[str]:
    """Parse tags from DB storage (JSON string) or API input (list).

    Args:
        tags: JSON string from DB or list from API.

    Returns:
        List of tag strings.
    """
    if tags is None:
        return []
    if isinstance(tags, list):
        return tags
    try:
        parsed = json.loads(tags)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _serialize_tags(tags: list[str] | None) -> str:
    """Serialize tags list to JSON string for DB storage."""
    return json.dumps(tags or [], ensure_ascii=False)


def _entry_to_dict(entry: KnowledgeEntry, case_id_for_rehydrate: str | None = None, db: Session | None = None) -> dict[str, Any]:
    """Convert KnowledgeEntry ORM object to response dict.

    If db is provided, content is rehydrated (PII restored for display).

    Args:
        entry: The KnowledgeEntry ORM instance.
        case_id_for_rehydrate: Case ID context for rehydration.
        db: SQLAlchemy session (needed for rehydrate).

    Returns:
        Dict matching KnowledgeEntryResponse schema.
    """
    content = entry.content
    if db and case_id_for_rehydrate:
        try:
            content = rehydrate(content, case_id_for_rehydrate, db)
        except Exception as exc:
            logger.warning("rehydrate failed for entry %s: %s", entry.id, exc)

    return {
        "id": entry.id,
        "layer": entry.layer,
        "case_id": entry.case_id,
        "content": content,
        "source": entry.source,
        "vera_confirmed": entry.vera_confirmed,
        "lender": entry.lender,
        "tags": _parse_tags(entry.tags),
        "entry_type": entry.entry_type,
        "priority": entry.priority,
        "mem0_id": entry.mem0_id,
        "source_ref": entry.source_ref,
        "last_verified_at": entry.last_verified_at.isoformat() if entry.last_verified_at else None,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


class KnowledgeService:
    """三层知识体系核心服务。

    负责所有知识条目的 CRUD、Mem0 同步、脱敏闭环。
    """

    # ── 案件记忆 (Layer: case) ──────────────────────────────────────

    def list_case_memories(self, case_id: str, db: Session) -> list[dict[str, Any]]:
        """获取某案件的全部案件记忆。

        Args:
            case_id: 案件 ID。
            db: SQLAlchemy session。

        Returns:
            Knowledge entries rehydrated for display.
        """
        entries = (
            db.query(KnowledgeEntry)
            .filter(KnowledgeEntry.case_id == case_id, KnowledgeEntry.layer == "case")
            .order_by(KnowledgeEntry.created_at.desc())
            .all()
        )
        result = [_entry_to_dict(e, case_id_for_rehydrate=case_id, db=db) for e in entries]
        for r in result:
            r["editable"] = True

        # 合并真实案件记忆（case_knowledge）：自动记忆是不可变审计记录，只读展示
        ck_rows = (
            db.query(CaseKnowledge)
            .filter(CaseKnowledge.case_id == case_id)
            .order_by(CaseKnowledge.created_at.desc())
            .all()
        )
        known_ids = {r["id"] for r in result}
        for ck in ck_rows:
            ck_id = f"ck_{ck.id}"
            if ck_id in known_ids:
                continue
            created = ck.created_at.isoformat() if ck.created_at else None
            result.append(
                {
                    "id": ck_id,
                    "layer": "case",
                    "case_id": ck.case_id,
                    "content": ck.content,
                    "source": ck.source,
                    "vera_confirmed": True,
                    "lender": None,
                    "tags": [],
                    "entry_type": None,
                    "priority": "normal",
                    "mem0_id": None,
                    "created_at": created,
                    "updated_at": created,
                    "editable": False,
                }
            )
        result.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return result

    # ── 全局经验 (Layer: global) ─────────────────────────────────────

    def list_global_experiences(
        self,
        db: Session,
        tags: list[str] | None = None,
        lender: str | None = None,
        entry_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """获取全局经验列表，支持筛选。

        Args:
            db: SQLAlchemy session.
            tags: Filter by tags (any match).
            lender: Filter by associated lender.
            entry_type: Filter by type (experience/policy/platform/compliance).

        Returns:
            Filtered list of global experience entries.
        """
        query = db.query(KnowledgeEntry).filter(KnowledgeEntry.layer == "global")

        if lender:
            query = query.filter(KnowledgeEntry.lender == lender)
        if entry_type:
            query = query.filter(KnowledgeEntry.entry_type == entry_type)

        entries = query.order_by(KnowledgeEntry.created_at.desc()).all()

        # Tag filtering (post-query since tags are JSON)
        if tags:
            filtered = []
            for e in entries:
                entry_tags = _parse_tags(e.tags)
                if any(t in entry_tags for t in tags):
                    filtered.append(e)
            entries = filtered

        # Global entries: use first available case_id for rehydrate context, or skip
        return [_entry_to_dict(e, case_id_for_rehydrate=e.case_id, db=db) for e in entries]

    # ── 行业知识库 (Layer: industry) ──────────────────────────────────

    def get_industry_knowledge(self, db: Session) -> dict[str, Any]:
        """获取行业知识库：YAML 银行参数 + DB 动态条目。

        Returns:
            Dict with lenders (YAML params + dynamic experiences),
            platforms, and compliance entries.
        """
        policies = _load_lender_policies()
        lenders_raw = policies.get("lenders", {})

        # Build lender summaries
        lender_summaries = []
        for name, params in lenders_raw.items():
            # Get dynamic experiences tagged with this lender
            experiences = (
                db.query(KnowledgeEntry)
                .filter(
                    KnowledgeEntry.lender == name,
                    KnowledgeEntry.layer.in_(["global", "industry"]),
                )
                .order_by(KnowledgeEntry.created_at.desc())
                .limit(5)
                .all()
            )
            lender_summaries.append({
                "name": name,
                "full_name": params.get("full_name", name),
                "params": params,
                "experiences": [_entry_to_dict(e, case_id_for_rehydrate=e.case_id, db=db) for e in experiences],
            })

        # Platform entries
        platforms = (
            db.query(KnowledgeEntry)
            .filter(KnowledgeEntry.layer == "industry", KnowledgeEntry.entry_type == "platform")
            .order_by(KnowledgeEntry.created_at.desc())
            .all()
        )

        # Compliance entries
        compliance = (
            db.query(KnowledgeEntry)
            .filter(KnowledgeEntry.layer == "industry", KnowledgeEntry.entry_type == "compliance")
            .order_by(KnowledgeEntry.created_at.desc())
            .all()
        )

        return {
            "lenders": lender_summaries,
            "platforms": [_entry_to_dict(e, db=db) for e in platforms],
            "compliance": [_entry_to_dict(e, db=db) for e in compliance],
            "general_rules": policies.get("general_rules", {}),
        }

    # ── 搜索 ─────────────────────────────────────────────────────────

    def search_knowledge(
        self,
        query: str,
        scope: str,
        db: Session,
        case_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """搜索知识条目（本地关键词匹配）。

        Args:
            query: 搜索关键词。
            scope: "all" | "case" | "global" | "industry"。
            db: SQLAlchemy session.
            case_id: Required when scope="case".

        Returns:
            Matching entries sorted by relevance (vera_confirmed first).
        """
        q = db.query(KnowledgeEntry)

        if scope == "case" and case_id:
            q = q.filter(KnowledgeEntry.case_id == case_id, KnowledgeEntry.layer == "case")
        elif scope == "global":
            q = q.filter(KnowledgeEntry.layer == "global")
        elif scope == "industry":
            q = q.filter(KnowledgeEntry.layer == "industry")
        # scope == "all": no layer filter

        # SQLite LIKE search (basic keyword matching)
        q = q.filter(KnowledgeEntry.content.ilike(f"%{query}%"))

        entries = q.order_by(
            KnowledgeEntry.vera_confirmed.desc(),
            KnowledgeEntry.created_at.desc(),
        ).limit(20).all()

        return [
            _entry_to_dict(e, case_id_for_rehydrate=e.case_id or case_id, db=db)
            for e in entries
        ]

    # ── CRUD ──────────────────────────────────────────────────────────

    def create_entry(self, payload: dict[str, Any], db: Session) -> dict[str, Any]:
        """创建知识条目。

        Flow:
            1. 生成 ID，存入 knowledge_entries 表（明文）
            2. desensitize → 存入 Mem0（脱敏版）
            3. 如果是 vera_manual，自动标记 vera_confirmed=True

        Args:
            payload: Dict with layer, content, case_id?, lender?, tags?, entry_type?.
            db: SQLAlchemy session.

        Returns:
            Created entry dict (rehydrated for display).
        """
        entry_id = _generate_id()
        layer = payload["layer"]
        case_id = payload.get("case_id")
        content = payload["content"]
        source = payload.get("source", "vera_manual")
        lender = payload.get("lender")
        tags = payload.get("tags", [])
        entry_type = payload.get("entry_type", "experience")
        source_ref = payload.get("source_ref")

        # Vera 手动添加自动标记确认
        vera_confirmed = source == "vera_manual"

        entry = KnowledgeEntry(
            id=entry_id,
            layer=layer,
            case_id=case_id,
            content=content,
            source=source,
            vera_confirmed=vera_confirmed,
            lender=lender,
            tags=_serialize_tags(tags),
            entry_type=entry_type,
            priority=payload.get("priority", "normal"),
            source_ref=source_ref,
        )
        db.add(entry)
        db.flush()

        # Sync to Mem0 (desensitized)
        mem0_id = self._sync_to_mem0(content, case_id, layer, lender, tags, vera_confirmed, db)
        if mem0_id:
            entry.mem0_id = mem0_id

        db.commit()
        logger.info("Created knowledge entry %s (layer=%s, source=%s)", entry_id, layer, source)

        return _entry_to_dict(entry, case_id_for_rehydrate=case_id, db=db)

    def update_entry(self, entry_id: str, payload: dict[str, Any], db: Session) -> dict[str, Any]:
        """更新知识条目。

        Args:
            entry_id: Entry ID to update.
            payload: Fields to update (content?, lender?, tags?, entry_type?, priority?).
            db: SQLAlchemy session.

        Returns:
            Updated entry dict.

        Raises:
            ValueError: If entry not found.
        """
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise ValueError(f"Knowledge entry not found: {entry_id}")

        if "content" in payload and payload["content"] is not None:
            entry.content = payload["content"]
            # Re-sync to Mem0 with new content
            self._sync_to_mem0(
                payload["content"], entry.case_id, entry.layer,
                entry.lender, _parse_tags(entry.tags), entry.vera_confirmed, db,
            )
        if "lender" in payload:
            entry.lender = payload["lender"]
        if "tags" in payload and payload["tags"] is not None:
            entry.tags = _serialize_tags(payload["tags"])
        if "entry_type" in payload:
            entry.entry_type = payload["entry_type"]
        if "priority" in payload:
            entry.priority = payload["priority"]
        if "source_ref" in payload:
            entry.source_ref = payload["source_ref"]

        # 编辑后自动标记 Vera 确认，并把核实时间更新为本次编辑时间
        entry.vera_confirmed = True
        entry.last_verified_at = datetime.utcnow()
        entry.updated_at = datetime.utcnow()

        db.commit()
        logger.info("Updated knowledge entry %s", entry_id)

        return _entry_to_dict(entry, case_id_for_rehydrate=entry.case_id, db=db)

    def delete_entry(self, entry_id: str, db: Session) -> None:
        """删除知识条目。

        Args:
            entry_id: Entry ID to delete.
            db: SQLAlchemy session.

        Raises:
            ValueError: If entry not found.
        """
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise ValueError(f"Knowledge entry not found: {entry_id}")

        # Delete from Mem0 if synced
        if entry.mem0_id:
            self._delete_from_mem0(entry.mem0_id)

        db.delete(entry)
        db.commit()
        logger.info("Deleted knowledge entry %s", entry_id)

    def confirm_entry(self, entry_id: str, db: Session) -> dict[str, Any]:
        """标记条目为 Vera 已确认。

        Args:
            entry_id: Entry ID to confirm.
            db: SQLAlchemy session.

        Returns:
            Updated entry dict.

        Raises:
            ValueError: If entry not found.
        """
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise ValueError(f"Knowledge entry not found: {entry_id}")

        entry.vera_confirmed = True
        entry.updated_at = datetime.utcnow()
        db.commit()
        logger.info("Confirmed knowledge entry %s", entry_id)

        return _entry_to_dict(entry, case_id_for_rehydrate=entry.case_id, db=db)

    def set_entry_confirmed(self, entry_id: str, confirmed: bool, db: Session) -> dict[str, Any]:
        """设置条目确认状态（确认 / 取消确认），支持全生命周期闭环。

        Args:
            entry_id: Entry ID。
            confirmed: True 标记已核实，False 取消核实。
            db: SQLAlchemy session。

        Returns:
            Updated entry dict。

        Raises:
            ValueError: If entry not found。
        """
        entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
        if not entry:
            raise ValueError(f"Knowledge entry not found: {entry_id}")

        entry.vera_confirmed = confirmed
        entry.last_verified_at = datetime.utcnow() if confirmed else None
        entry.updated_at = datetime.utcnow()
        db.commit()
        logger.info("Set knowledge entry %s vera_confirmed=%s", entry_id, confirmed)

        return _entry_to_dict(entry, case_id_for_rehydrate=entry.case_id, db=db)

    # ── 银行知识 ──────────────────────────────────────────────────────

    def get_lender_knowledge(self, lender_name: str, db: Session) -> dict[str, Any]:
        """获取某银行的完整知识（YAML 参数 + 动态经验）。

        统一数据流：设置里新增的银行（不在 YAML 中）也能打开，params 为空，
        由前端显示"暂无政策数据"并引导维护。

        Args:
            lender_name: Lender short name (e.g. "CBA").
            db: SQLAlchemy session.

        Returns:
            Dict with params and experiences.
        """
        policies = _load_lender_policies()
        lenders = policies.get("lenders", {})
        params = lenders.get(lender_name) or {}
        full_name = params.get("full_name") if params else lender_name
        experiences = (
            db.query(KnowledgeEntry)
            .filter(
                KnowledgeEntry.lender == lender_name,
                KnowledgeEntry.layer.in_(["global", "industry"]),
            )
            .order_by(KnowledgeEntry.created_at.desc())
            .all()
        )

        return {
            "name": lender_name,
            "full_name": full_name,
            "params": params,
            "experiences": [_entry_to_dict(e, case_id_for_rehydrate=e.case_id, db=db) for e in experiences],
        }

    def get_industry_overview(self, db: Session) -> dict[str, Any]:
        """获取行业知识库概览（统计 + 待核实队列）。

        Args:
            db: SQLAlchemy session。

        Returns:
            Dict with stats and pending entries。
        """
        policies = _load_lender_policies()
        base = db.query(KnowledgeEntry).filter(KnowledgeEntry.layer == "industry")
        policy_entries = base.filter(KnowledgeEntry.entry_type == "policy").count()
        platform_entries = base.filter(KnowledgeEntry.entry_type == "platform").count()
        compliance_entries = base.filter(KnowledgeEntry.entry_type == "compliance").count()
        confirmed = base.filter(KnowledgeEntry.vera_confirmed.is_(True)).count()
        pending_count = base.filter(KnowledgeEntry.vera_confirmed.is_(False)).count()
        stale_rows = (
            db.query(KnowledgeEntry)
            .filter(KnowledgeEntry.layer == "industry")
            .order_by(KnowledgeEntry.updated_at.desc())
            .all()
        )
        stale_entries = [e for e in stale_rows if _is_stale(e)]
        stale_count = len(stale_entries)

        pending_rows = (
            base.filter(KnowledgeEntry.vera_confirmed.is_(False))
            .order_by(KnowledgeEntry.created_at.desc())
            .limit(100)
            .all()
        )

        return {
            "stats": {
                "lenders": len(policies.get("lenders", {}) or {}),
                "policy_entries": policy_entries,
                "platform_entries": platform_entries,
                "compliance_entries": compliance_entries,
                "confirmed": confirmed,
                "pending": pending_count,
                "stale": stale_count,
            },
            "pending": [_entry_to_dict(e, db=db) for e in pending_rows],
            "stale": [_entry_to_dict(e, db=db) for e in stale_entries[:50]],
        }

    def get_platform_rules(self, platform_name: str, db: Session) -> dict[str, Any]:
        """获取某递交平台的规则清单（递交前自查用）。

        Args:
            platform_name: 平台名称（如 MQG），大小写/空格容错。
            db: SQLAlchemy session。

        Returns:
            Dict with name and entries。
        """
        entries = (
            db.query(KnowledgeEntry)
            .filter(
                KnowledgeEntry.layer == "industry",
                KnowledgeEntry.entry_type == "platform",
                KnowledgeEntry.lender.isnot(None),
                func.lower(func.trim(KnowledgeEntry.lender)) == platform_name.strip().lower(),
            )
            .order_by(KnowledgeEntry.created_at.asc())
            .all()
        )
        return {
            "name": platform_name,
            "entries": [_entry_to_dict(e, db=db) for e in entries],
        }

    def get_lender_policy_essentials(self, lender_name: str) -> str:
        """获取某银行的核心政策要点（用于 AI 上下文注入）。

        只返回 2-3 条关键信息：LVR 上限、还款缓冲率、收入口径、常用材料，
        全部来自 lender_policies.yaml（方向性参考，非精确计算器）。

        Args:
            lender_name: 银行简称（如 "CBA"）。

        Returns:
            格式化政策要点文本；银行不存在时返回空字符串。
        """
        policies = _load_lender_policies()
        params = (policies.get("lenders", {}) or {}).get(lender_name)
        if not params:
            return ""

        lines = [f"[{lender_name} 政策要点（方向性参考）]"]
        if params.get("max_lvr_no_lmi"):
            lines.append(
                f"LVR 上限: 无 LMI {params['max_lvr_no_lmi']}% / "
                f"有 LMI {params.get('max_lvr_with_lmi', '?')}%"
            )
        if params.get("buffer_rate"):
            lines.append(f"还款缓冲率: {params['buffer_rate']}%")
        if params.get("min_deposit"):
            lines.append(f"最低首付: {params['min_deposit']}%")

        income = params.get("income_shading") or {}
        se = income.get("self_employed")
        if isinstance(se, str):
            lines.append(f"自雇收入口径: {se}")
        bonus = income.get("bonus")
        if isinstance(bonus, (int, float)):
            lines.append(f"Bonus 计算: {int(bonus * 100)}%")

        materials = params.get("key_materials") or []
        if materials:
            lines.append("常用材料: " + "、".join(str(m) for m in materials[:4]))

        special = params.get("special_requirements") or []
        if special:
            lines.append("特殊要求: " + "；".join(str(s) for s in special[:3]))

        return "\n".join(lines)

    def search_lender_policy(
        self,
        lender_name: str,
        keyword: str,
        db: Session,
        limit: int = 3,
    ) -> list[str]:
        """在银行政策与团队经验中检索关键词（本地匹配，不依赖向量嵌入）。

        检索范围：
            1. lender_policies.yaml 中该银行的 strengths/weaknesses/best_for/
               avoid_for/key_materials/special_requirements；
            2. 数据库 knowledge_entries 中该银行已确认的全局/行业经验。

        Args:
            lender_name: 银行简称（如 "CBA"）。
            keyword: 检索关键词（可空，空则返回该银行最新经验）。
            db: SQLAlchemy session。
            limit: 知识条目最多返回条数。

        Returns:
            格式化检索结果列表。
        """
        results: list[str] = []
        kw = (keyword or "").strip().lower()

        policies = _load_lender_policies()
        params = (policies.get("lenders", {}) or {}).get(lender_name)
        if params and kw:
            for field in ("strengths", "weaknesses", "best_for", "avoid_for",
                          "key_materials", "special_requirements"):
                for item in params.get(field) or []:
                    if kw in str(item).lower():
                        results.append(f"[{field}] {item}")
            results = results[:limit]

        query = db.query(KnowledgeEntry).filter(
            KnowledgeEntry.lender == lender_name,
            KnowledgeEntry.layer.in_(["global", "industry"]),
        )
        if kw:
            query = query.filter(KnowledgeEntry.content.ilike(f"%{kw}%"))
        # 已确认的排前面，未确认的（行业种子等）也返回，但标记待核实
        entries = (
            query.order_by(
                KnowledgeEntry.vera_confirmed.desc(),
                KnowledgeEntry.created_at.desc(),
            )
            .limit(limit)
            .all()
        )
        for e in entries:
            prefix = "[经验]" if e.vera_confirmed else "[经验·待核实]"
            results.append(f"{prefix} {e.content[:200]}")

        return results

    def update_lender_params(self, lender_name: str, params: dict[str, Any]) -> None:
        """更新银行基础参数（写入 YAML）。

        # TODO(Phase 5B): YAML 编辑走 git auto-commit

        Args:
            lender_name: Lender short name.
            params: New params dict to merge.

        Raises:
            ValueError: If lender not found.
        """
        global _lender_policies

        policies = _load_lender_policies()
        lenders = policies.get("lenders", {})

        if lender_name not in lenders:
            raise ValueError(f"Lender not found: {lender_name}")

        # Merge params
        lenders[lender_name].update(params)

        # Write back
        with open(_LENDER_POLICIES_PATH, "w", encoding="utf-8") as f:
            yaml.safe_dump(policies, f, allow_unicode=True, default_flow_style=False)

        # Invalidate cache
        _lender_policies = None
        logger.info("Updated lender params for %s", lender_name)

    def rename_lender(self, old_name: str, new_name: str) -> bool:
        """重命名 lender_policies.yaml 中的银行键（统一数据流）。

        设置里银行改名时调用，确保政策库、知识条目与设置列表使用同一名称。

        Args:
            old_name: 旧银行名。
            new_name: 新银行名。

        Returns:
            True 表示 YAML 中存在该银行并已改名；False 表示不存在（未改动）。
        """
        global _lender_policies

        policies = _load_lender_policies()
        lenders = policies.get("lenders", {})
        if old_name not in lenders:
            return False

        lenders[new_name] = lenders.pop(old_name)
        with open(_LENDER_POLICIES_PATH, "w", encoding="utf-8") as f:
            yaml.safe_dump(policies, f, allow_unicode=True, default_flow_style=False)
        _lender_policies = None
        logger.info("Renamed lender %s -> %s in lender_policies.yaml", old_name, new_name)
        return True

    # ── Private: Mem0 Sync ────────────────────────────────────────────

    def _sync_to_mem0(
        self,
        content: str,
        case_id: str | None,
        layer: str,
        lender: str | None,
        tags: list[str],
        vera_confirmed: bool,
        db: Session,
    ) -> str | None:
        """Desensitize content and store in Mem0.

        Args:
            content: Raw plaintext content.
            case_id: Case context for desensitization.
            layer: Knowledge layer.
            lender: Associated lender.
            tags: Entry tags.
            vera_confirmed: Whether Vera confirmed.
            db: SQLAlchemy session.

        Returns:
            Mem0 memory ID if successful, None otherwise.
        """
        mem0 = _get_mem0()
        if mem0 is None:
            logger.debug("Mem0 unavailable — skipping sync")
            return None

        # Desensitize before sending to Mem0
        safe_content = desensitize(content, case_id or "global", db)

        metadata = {
            "source": "knowledge_service",
            "vera_confirmed": vera_confirmed,
            "layer": layer,
            "tags": tags,
        }
        if lender:
            metadata["lender"] = lender

        try:
            if layer == "case" and case_id:
                result = mem0.add(safe_content, user_id=case_id, metadata=metadata)
            else:
                result = mem0.add(safe_content, agent_id="global_experience", metadata=metadata)

            # Extract memory ID from result
            if isinstance(result, dict) and "results" in result:
                results = result["results"]
                if results and isinstance(results, list) and "id" in results[0]:
                    return results[0]["id"]
            elif isinstance(result, list) and result and isinstance(result[0], dict):
                return result[0].get("id")

            return None
        except Exception as exc:
            logger.warning("Mem0 sync failed: %s (non-fatal)", exc)
            return None

    def _delete_from_mem0(self, mem0_id: str) -> None:
        """Delete a memory from Mem0 by ID.

        Args:
            mem0_id: The Mem0 memory ID to delete.
        """
        mem0 = _get_mem0()
        if mem0 is None:
            return

        try:
            mem0.delete(mem0_id)
            logger.debug("Deleted memory %s from Mem0", mem0_id)
        except Exception as exc:
            logger.warning("Mem0 delete failed for %s: %s (non-fatal)", mem0_id, exc)