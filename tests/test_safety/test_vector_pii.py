"""语义向量层 PII 红线测试（WO-24 + AGENTS.md §五）。

红线：
1. 嵌入输入必先 desensitize（pii_map 永不出内网）
2. 检索结果 value 已 rehydrate（无 PERSON_/PHONE_ 占位符）
3. 嵌入只用本地 ONNX（fastembed BGE），绝不调外部 embedding API

覆盖：
- rebuild_fact_embeddings：embed 收到的必须是脱敏后文本
- semantic_search：query 脱敏后才进 embed，返回 value 已还原
- 模型常量指向本地 BGE，不使用任何外部 API
"""

import pytest

from core.knowledge import vector
from core.models.orm import BrainFact, CaseContextEvent
from core.pii.gateway import desensitize


def _fake_embed_384(text: str) -> list[float]:
    """固定 384 维向量（仅验证流程，不验证排序）。"""
    return [0.01] * 384


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


@pytest.fixture
def vec_db(test_db):
    vector.ensure_vector_schema(test_db.get_bind())
    return test_db


class TestEmbedInputDesensitized:
    def test_rebuild_embeds_desensitized_value(self, vec_db, monkeypatch):
        """rebuild 时 embed 收到的必须是脱敏后文本（张三→PERSON_1）。"""
        seen = {}

        def _capturing_embed(text):
            seen["input"] = text
            return _fake_embed_384(text)

        monkeypatch.setattr(vector, "embed_text", _capturing_embed)
        evt_id = _event_id(vec_db, "C1")
        vec_db.add(
            BrainFact(
                event_id=evt_id,
                case_id="C1",
                key="income",
                value="客户 张三 收入 8500",
                category="income",
                track="internal",
            )
        )
        vec_db.commit()

        vector.rebuild_fact_embeddings(vec_db)

        assert seen["input"] is not None
        assert "张三" not in seen["input"]
        assert "PERSON_" in seen["input"]

    def test_search_query_desensitized_before_embed(self, vec_db, monkeypatch):
        """semantic_search 的 query 脱敏后才进 embed（手机号→PHONE_）。"""
        seen = {}

        def _capturing_embed(text):
            seen["input"] = text
            return _fake_embed_384(text)

        monkeypatch.setattr(vector, "embed_text", _capturing_embed)

        vector.semantic_search(vec_db, "联系 0412345678", case_id="C1")

        assert seen["input"] is not None
        assert "0412345678" not in seen["input"]
        assert "PHONE_" in seen["input"]

    def test_result_value_rehydrated(self, vec_db, monkeypatch):
        """检索结果 value 已还原：无占位符、有真实姓名。"""
        monkeypatch.setattr(vector, "embed_text", _fake_embed_384)
        desensitize("张三", "C2", vec_db)  # 建立 PERSON_1 -> 张三 映射
        evt_id = _event_id(vec_db, "C2")
        vec_db.add(
            BrainFact(
                event_id=evt_id,
                case_id="C2",
                key="income",
                value="客户 PERSON_1 收入 8500",
                category="income",
                track="internal",
            )
        )
        vec_db.commit()
        vector.rebuild_fact_embeddings(vec_db)

        hits = vector.semantic_search(vec_db, "张三", case_id="C2")
        assert hits
        value = hits[0]["value"]
        assert "PERSON_" not in value
        assert "张三" in value


class TestLocalEmbeddingOnly:
    def test_embedding_model_is_local_bge(self):
        """嵌入模型必须是本地 BGE（非外部 API）。"""
        assert vector._EMBEDDING_MODEL == "BAAI/bge-small-en-v1.5"

    def test_embed_text_uses_fastembed_local(self, monkeypatch):
        """embed_text 只走 fastembed（本地 ONNX），不触碰外部 API。"""
        called = {}

        class _FakeModel:
            def embed(self, texts):
                called["model"] = "fastembed"
                yield [0.01] * 384

        monkeypatch.setattr(vector, "_model", _FakeModel())
        vec = vector.embed_text("脱敏后文本")
        assert vec is not None
        assert len(vec) == 384
        assert called.get("model") == "fastembed"