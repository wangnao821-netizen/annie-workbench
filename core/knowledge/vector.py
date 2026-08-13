"""BrainFact 语义检索 — sqlite-vec + 本地 BGE（WO-24）。

红线：
- 嵌入输入必须 desensitize 后送入（pii_map 永不出内网）；
- 嵌入只用本地 ONNX（fastembed BGE），绝不调外部 embedding API。
降级纪律：任何一步失败 → 返回 None/[]，只日志 warning，绝不抛错阻断对话。
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from core.logger import get_logger
from core.models.orm import BrainFact
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"  # 384 维
_VECTOR_DIM = 384
_VTABLE = "fact_embeddings"

_model = None  # fastembed 单例（懒加载）


def _load_extension(raw) -> None:
    """在底层 DBAPI 连接上启用并加载 sqlite-vec 扩展（幂等）。"""
    try:
        import sqlite_vec

        raw.enable_load_extension(True)
        sqlite_vec.load(raw)
    except Exception as exc:
        logger.warning("sqlite-vec load failed (semantic layer degraded): %s", exc)
        raise


def ensure_vector_schema(engine: Engine) -> None:
    """幂等创建 vec0 虚拟表；不入 Alembic（受控例外，见 WO-24 架构决定）。

    vec0 是 SQLite 虚拟表扩展，普通 alembic autogenerate 无法管理迁移，
    故由本函数在 init_sa_tables 之后幂等创建（CREATE VIRTUAL TABLE IF NOT EXISTS）。
    失败只 warning，绝不抛错。
    """
    try:
        import sqlite_vec
    except Exception as exc:  # noqa: BLE001 — 语义层降级
        logger.warning("sqlite-vec unavailable, semantic layer degraded: %s", exc)
        return
    try:
        with engine.connect() as conn:
            raw = conn.connection
            raw.enable_load_extension(True)
            sqlite_vec.load(raw)
            conn.execute(
                text(
                    f"CREATE VIRTUAL TABLE IF NOT EXISTS {_VTABLE} "
                    f"USING vec0(fact_id INTEGER PRIMARY KEY, embedding float[{_VECTOR_DIM}])"
                )
            )
            conn.commit()
    except Exception as exc:  # noqa: BLE001 — 语义层降级
        logger.warning("ensure_vector_schema failed (semantic layer degraded): %s", exc)


def embed_text(text: str) -> list[float] | None:
    """本地嵌入（fastembed BGE，384 维）。调用前必须已 desensitize；失败返回 None（降级）。"""
    global _model
    if not text or not text.strip():
        return None
    try:
        if _model is None:
            from fastembed import TextEmbedding

            _model = TextEmbedding(_EMBEDDING_MODEL)
        vector = next(_model.embed([text]))
        return [float(x) for x in vector]
    except Exception as exc:  # noqa: BLE001 — 语义层降级
        logger.warning("embed_text failed (semantic layer degraded): %s", exc)
        return None


def _vec_conn(db) -> None:
    """加载 sqlite-vec 扩展到 session 当前连接的底层 DBAPI（幂等）。"""
    _load_extension(db.connection().connection)


def _upsert(db, fact_id: int, embedding: bytes) -> None:
    """vec0 不支持 UPSERT/UPDATE：先 DELETE 再 INSERT（幂等）。"""
    db.execute(text(f"DELETE FROM {_VTABLE} WHERE fact_id = :fid"), {"fid": fact_id})
    db.execute(
        text(f"INSERT INTO {_VTABLE}(fact_id, embedding) VALUES (:fid, :emb)"),
        {"fid": fact_id, "emb": embedding},
    )


def rebuild_fact_embeddings(db) -> dict:
    """全量重建：brain_facts(valid_to IS NULL) → desensitize → embed → upsert。

    幂等：两次运行结果一致。返回 {"facts": n, "embedded": n, "failed": n}。
    任何一步失败只 warning，不抛错。
    """
    import sqlite_vec

    try:
        facts = db.query(BrainFact).filter(BrainFact.valid_to.is_(None)).all()
    except Exception as exc:  # noqa: BLE001 — 语义层降级
        logger.warning("rebuild_fact_embeddings: query failed: %s", exc)
        return {"facts": 0, "embedded": 0, "failed": 0}

    embedded = 0
    failed = 0
    try:
        _vec_conn(db)
    except Exception:  # noqa: BLE001 — 语义层降级
        return {"facts": len(facts), "embedded": 0, "failed": len(facts)}

    for fact in facts:
        try:
            safe_value = desensitize(fact.value, fact.case_id, db)
            vector = embed_text(safe_value)
            if vector is None:
                failed += 1
                continue
            _upsert(db, fact.id, sqlite_vec.serialize_float32(vector))
            embedded += 1
        except Exception as exc:  # noqa: BLE001 — 语义层降级
            logger.warning("rebuild fact %s failed: %s", fact.id, exc)
            failed += 1

    db.commit()
    return {"facts": len(facts), "embedded": embedded, "failed": failed}


def semantic_search(
    db, query: str, case_id: str | None = None, track: str = "internal", limit: int = 5
) -> list[dict]:
    """向量 top-k：query 先 desensitize → embed → vec0 查询（track/valid_to/case 过滤）。

    返回 [{fact_id, key, value, category, track, score, case_id}]（value 已 rehydrate）。
    嵌入不可用/表缺失 → 返回 []（降级），绝不抛错。
    """
    import sqlite_vec

    try:
        safe_query = desensitize(query, case_id or "", db)
        vector = embed_text(safe_query)
        if vector is None:
            return []
        blob = sqlite_vec.serialize_float32(vector)
        _vec_conn(db)
    except Exception as exc:  # noqa: BLE001 — 语义层降级
        logger.warning("semantic_search degraded: %s", exc)
        return []

    k = max(limit * 10, 50)  # vec0 先取足量候选，外层再过滤 track/case/valid
    sql = f"""
        SELECT bf.id, bf.case_id, bf.key, bf.value, bf.category, bf.track, cand.distance
        FROM brain_facts bf
        JOIN (SELECT fact_id, distance FROM {_VTABLE} WHERE embedding MATCH :q AND k = :k)
             cand ON bf.id = cand.fact_id
        WHERE bf.valid_to IS NULL AND bf.track = :track
        {("AND bf.case_id = :case_id" if case_id else "")}
        ORDER BY cand.distance ASC
        LIMIT :limit
    """
    params: dict = {"q": blob, "k": k, "track": track, "limit": limit}
    if case_id:
        params["case_id"] = case_id

    try:
        rows = db.execute(text(sql), params).fetchall()
    except Exception as exc:  # noqa: BLE001 — 语义层降级
        logger.warning("semantic_search query failed (semantic layer degraded): %s", exc)
        return []

    results: list[dict] = []
    for fact_id, fcase_id, key, value, category, ftrack, distance in rows:
        results.append(
            {
                "fact_id": fact_id,
                "case_id": fcase_id,
                "key": key,
                "value": rehydrate(value, fcase_id, db),
                "category": category,
                "track": ftrack,
                "score": float(distance),
            }
        )
    return results