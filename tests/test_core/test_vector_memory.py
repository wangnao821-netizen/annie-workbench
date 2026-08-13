"""core/knowledge/vector.py — BrainFact 语义向量记忆测试。

覆盖（WO-24）：
1. ensure_vector_schema 幂等（重复调用不报错、表已建）
2. embed_text 返回 384 维向量
3. embed_text 空文本返回 None
4. embed_text 模型加载失败返回 None（降级不抛错）
5. rebuild 只处理 valid_to IS NULL 的有效事实
6. rebuild 幂等（两次运行结果一致）
7. semantic_search 命中相关事实排 top-1
8. semantic_search track 过滤
9. semantic_search case_id 过滤
10. vec0 表缺失 → 返回 []（降级不抛错）
11. embed 失败 → 返回 []（降级不抛错）
12. 返回的 value 已 rehydrate（无 PERSON_ 占位符）
"""

import math
from datetime import datetime

import pytest
from sqlalchemy import text

from core.knowledge import vector
from core.models.orm import BrainFact, CaseContextEvent
from core.pii.gateway import desensitize


def _bag_embed(text: str) -> list[float]:
    """确定性假嵌入：字符哈希到 384 维单位向量。

    相同字符重叠越多 → 向量越近，可验证 top-1 排序。
    """
    vec = [0.0] * 384
    for ch in str(text):
        vec[ord(ch) % 384] += 1.0
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return [0.0] * 384
    return [x / norm for x in vec]


def _event_id(db, case_id: str) -> int:
    evt = CaseContextEvent(
        case_id=case_id,
        source_type="manual_note",
        content="seed",
        track="internal",
        status="confirmed",
    )
    db.add(evt)
    db.commit()
    return evt.id


def _make_fact(db, case_id, key, value, track="internal", valid_to=None):
    f = BrainFact(
        event_id=_event_id(db, case_id),
        case_id=case_id,
        key=key,
        value=value,
        category="misc",
        track=track,
        valid_to=valid_to,
    )
    db.add(f)
    db.commit()
    return f


@pytest.fixture
def vec_db(test_db):
    """test_db + 幂等创建 vec0 表。"""
    vector.ensure_vector_schema(test_db.get_bind())
    return test_db


class TestVectorSchema:
    def test_ensure_vector_schema_idempotent(self, vec_db):
        """重复调用不抛错，且 vec0 表存在。"""
        vector.ensure_vector_schema(vec_db.get_bind())  # 第二次调用
        row = vec_db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='fact_embeddings'")
        ).fetchone()
        assert row is not None

    def test_embed_text_returns_384_dim(self, monkeypatch):
        """embed_text 返回 384 维浮点向量。"""
        class _FakeModel:
            def embed(self, texts):
                yield [0.1] * 384

        monkeypatch.setattr(vector, "_model", _FakeModel())
        vec = vector.embed_text("hello world")
        assert vec is not None
        assert len(vec) == 384
        assert all(isinstance(x, float) for x in vec)

    def test_embed_text_empty_returns_none(self):
        """空文本/纯空白不嵌入，返回 None。"""
        assert vector.embed_text("") is None
        assert vector.embed_text("   ") is None

    def test_embed_text_load_failure_returns_none(self, monkeypatch):
        """模型加载失败 → 返回 None（降级不抛错）。"""
        class _RaisingLoader:
            def __init__(self, *a, **k):
                raise RuntimeError("model unavailable")

        monkeypatch.setattr(vector, "_model", None)
        monkeypatch.setattr("fastembed.TextEmbedding", _RaisingLoader)
        assert vector.embed_text("anything") is None


class TestRebuild:
    def test_rebuild_skips_invalidated(self, vec_db, monkeypatch):
        """只处理 valid_to IS NULL 的有效事实。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        _make_fact(vec_db, "C1", "income", "客户收入 8500")
        _make_fact(vec_db, "C1", "hobby", "客户喜欢墨尔本")
        _make_fact(vec_db, "C2", "old", "已失效事实", valid_to=datetime(2020, 1, 1))  # noqa: DTZ001 — 与 DB naive UTC 对齐

        result = vector.rebuild_fact_embeddings(vec_db)
        assert result["facts"] == 2
        assert result["embedded"] == 2
        assert result["failed"] == 0

    def test_rebuild_idempotent(self, vec_db, monkeypatch):
        """两次运行结果一致。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        _make_fact(vec_db, "C1", "income", "客户收入 8500")
        _make_fact(vec_db, "C1", "hobby", "客户喜欢墨尔本")

        first = vector.rebuild_fact_embeddings(vec_db)
        second = vector.rebuild_fact_embeddings(vec_db)
        assert first == second == {"facts": 2, "embedded": 2, "failed": 0}


class TestSemanticSearch:
    def test_ranks_relevant_top(self, vec_db, monkeypatch):
        """相关事实命中 top-1。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        _make_fact(vec_db, "C1", "income", "客户收入 8500")
        _make_fact(vec_db, "C1", "hobby", "客户喜欢墨尔本")
        vector.rebuild_fact_embeddings(vec_db)

        hits = vector.semantic_search(vec_db, "收入 8500", case_id="C1")
        assert hits
        assert hits[0]["key"] == "income"

    def test_track_filter(self, vec_db, monkeypatch):
        """track=internal 只返回 internal 事实。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        _make_fact(vec_db, "C1", "income", "客户收入 8500", track="internal")
        _make_fact(vec_db, "C1", "debt", "客户负债 3000", track="external")
        vector.rebuild_fact_embeddings(vec_db)

        internal = vector.semantic_search(vec_db, "客户", track="internal")
        external = vector.semantic_search(vec_db, "客户", track="external")
        assert all(h["track"] == "internal" for h in internal)
        assert all(h["track"] == "external" for h in external)
        assert {h["key"] for h in internal} == {"income"}
        assert {h["key"] for h in external} == {"debt"}

    def test_case_filter(self, vec_db, monkeypatch):
        """case_id 过滤只返回该案件事实。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        _make_fact(vec_db, "C1", "income", "客户收入 8500")
        _make_fact(vec_db, "C2", "income", "客户收入 8500")
        vector.rebuild_fact_embeddings(vec_db)

        hits = vector.semantic_search(vec_db, "客户收入", case_id="C1")
        assert hits
        assert all(h["case_id"] == "C1" for h in hits)

    def test_table_missing_returns_empty(self, vec_db, monkeypatch):
        """vec0 表缺失 → 返回 []（降级不抛错）。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        _make_fact(vec_db, "C1", "income", "客户收入 8500")
        vector.rebuild_fact_embeddings(vec_db)
        vec_db.execute(text("DROP TABLE fact_embeddings"))
        vec_db.commit()

        assert vector.semantic_search(vec_db, "客户收入", case_id="C1") == []

    def test_embed_failure_returns_empty(self, vec_db, monkeypatch):
        """embed 失败 → 返回 []（降级不抛错）。"""
        monkeypatch.setattr(vector, "embed_text", lambda text: None)
        _make_fact(vec_db, "C1", "income", "客户收入 8500")
        vector.rebuild_fact_embeddings(vec_db)

        assert vector.semantic_search(vec_db, "客户收入", case_id="C1") == []

    def test_results_rehydrated(self, vec_db, monkeypatch):
        """返回的 value 已 rehydrate，无 PERSON_ 占位符。"""
        monkeypatch.setattr(vector, "embed_text", _bag_embed)
        desensitize("张三", "C1", vec_db)  # 建立 PERSON_1 -> 张三 映射
        _make_fact(vec_db, "C1", "income", "PERSON_1 收入 8500")
        vector.rebuild_fact_embeddings(vec_db)

        hits = vector.semantic_search(vec_db, "收入", case_id="C1")
        assert hits
        assert "PERSON_" not in hits[0]["value"]
        assert "张三" in hits[0]["value"]