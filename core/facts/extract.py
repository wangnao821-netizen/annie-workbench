"""BrainFact 提取与同步 — 只处理 confirmed 事件（#5/#7）。"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.facts.anchors import extract_rule_facts
from core.logger import get_logger
from core.models.orm import BrainFact, CaseContextEvent
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_EXTRACT_SYSTEM_PROMPT = (
    "你是贷款案件事实提取器。只输出 JSON，不要解释。"
    "从事件文本提取事实，key 只能来自给定的词表；词表外的概念统一输出 "
    '{"key": "unclassified", "value": "原文摘要"}。金额/日期/银行/阶段已由规则锚定，不要重复提取。'
)


def _load_schema_keys() -> set[str]:
    """从 config/fact_schema.yaml 加载全部 category.key（LLM 白名单）。"""
    path = Path(__file__).resolve().parents[2] / "config" / "fact_schema.yaml"
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return {f"{cat}.{k}" for cat, keys in data["categories"].items() for k in keys}


def _build_prompt(text: str, schema_keys: set[str]) -> str:
    """组装提取指令：词表全量 key 白名单 + 提取约束（事件文本由网关脱敏后附上）。"""
    whitelist = "、".join(sorted(schema_keys))
    return (
        "从事件文本提取事实，输出 JSON 数组，每项为 {\"key\": \"...\", \"value\": \"...\"}。"
        f"key 只能来自以下词表：{whitelist}。"
        "金额/日期/银行/阶段已由规则锚定，不要重复提取。"
    )


def _parse_json_facts(raw: str, schema_keys: set[str]) -> list[dict]:
    """解析 LLM JSON 数组；逐条校验 key ∈ schema_keys ∪ {'unclassified'}，非法 key 丢弃。"""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("BrainFact LLM 返回非 JSON，丢弃")
        return []
    items = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
    facts: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        value = item.get("value")
        if not isinstance(key, str) or not key or value is None:
            continue
        if key == "unclassified":
            facts.append(
                {"key": "unclassified", "value": str(value), "category": "unclassified", "anchor": "llm"}
            )
            continue
        if key not in schema_keys:
            logger.warning("BrainFact 词表外 key 丢弃: %s", key)
            continue
        facts.append({"key": key, "value": str(value), "category": key.split(".", 1)[0], "anchor": "llm"})
    return facts


def extract_facts_from_text(text: str, case_id: str, db: Session, schema_keys: set[str]) -> list[dict]:
    """LLM 词表映射提取（脱敏 → LLM → 还原）；失败降级为空列表（不阻断）。"""
    try:
        safe = desensitize(text, case_id, db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe),
            prompt_template=_build_prompt(text, schema_keys),
            system_prompt=_EXTRACT_SYSTEM_PROMPT,
        )
        raw = rehydrate(result.response_text.strip(), case_id, db)
        return _parse_json_facts(raw, schema_keys)
    except Exception as exc:  # noqa: BLE001 — 提取失败必须降级，不阻断业务
        logger.warning("BrainFact LLM 提取失败，降级: %s", exc)
        return []


def sync_brain_facts(case_id: str, db: Session, event: CaseContextEvent | None = None) -> int:
    """重建/增量更新该案件 BrainFact（幂等）。

    - event 为空：全量扫描该案件所有 confirmed 事件重建；
    - event 非空：只处理该事件（confirm 后调用）；
    - pending/superseded 事件不参与；
    - 同 (case_id, key, track, event_id) 已存在 → 跳过；
    - 同 (case_id, key, track) 不同 value 且新事件更新 → 旧行 superseded_by=新 id + conflict=True；
    - 来源事件 superseded → 其派生事实 valid_to=now。

    Returns:
        本次写入/更新的 BrainFact 行数。
    """
    written = 0
    all_events = (
        db.query(CaseContextEvent)
        .filter(CaseContextEvent.case_id == case_id)
        .order_by(CaseContextEvent.id.asc())
        .all()
    )
    events = [event] if event is not None else all_events

    now = datetime.utcnow()  # noqa: DTZ003 — 与 ORM 列默认一致（naive UTC）
    superseded_ids = {e.id for e in all_events if e.status == "superseded"}
    if superseded_ids:
        stale = (
            db.query(BrainFact)
            .filter(
                BrainFact.case_id == case_id,
                BrainFact.event_id.in_(superseded_ids),
                BrainFact.valid_to.is_(None),
            )
            .all()
        )
        for fact in stale:
            fact.valid_to = now
            written += 1

    schema_keys = _load_schema_keys()
    for evt in events:
        if evt.status != "confirmed":
            continue
        for fact in extract_rule_facts(evt.content) + extract_facts_from_text(evt.content, case_id, db, schema_keys):
            key = fact["key"]
            value = str(fact["value"])
            category = fact.get("category") or key.split(".", 1)[0]
            existing = (
                db.query(BrainFact)
                .filter(
                    BrainFact.case_id == case_id,
                    BrainFact.key == key,
                    BrainFact.track == evt.track,
                    BrainFact.event_id == evt.id,
                )
                .first()
            )
            if existing is not None:
                continue
            current = (
                db.query(BrainFact)
                .filter(
                    BrainFact.case_id == case_id,
                    BrainFact.key == key,
                    BrainFact.track == evt.track,
                    BrainFact.valid_to.is_(None),
                )
                .first()
            )
            new_row = BrainFact(
                case_id=case_id,
                key=key,
                value=value,
                category=category,
                track=evt.track,
                event_id=evt.id,
                valid_from=now,
            )
            db.add(new_row)
            db.flush()
            written += 1
            if current is not None and current.value != value:
                current.superseded_by = new_row.id
                current.conflict = True
                current.valid_to = now
                written += 1
    db.commit()
    return written