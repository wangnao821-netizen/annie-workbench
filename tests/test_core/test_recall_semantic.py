"""core/knowledge/recall.py — 语义召回集成与优先级排序测试（WO-25）。

覆盖：
1. 语义命中以 [语义] 前缀追加到输出
2. 语义层失败 → 回退 LIKE 既有路径，不抛错
3. 无 LIKE 结果但有语义命中 → 仍返回语义行
4. 全空 → 返回空字符串
5. 排序：LIKE(确认) > 语义 > Mem0
6. Mem0 失败不阻断（被 except 吞掉）
"""

import pytest

import core.knowledge.recall as recall_mod
from core.knowledge import vector
from core.knowledge.recall import recall_for_context
from core.models.orm import Case, KnowledgeEntry


@pytest.fixture
def case_entry(test_db):
    test_db.add(Case(id="recall_c1", client_name="张三"))
    entry = KnowledgeEntry(
        id="ke1",
        layer="case",
        case_id="recall_c1",
        content="客户收入 8500",
        source="manual",
        vera_confirmed=True,
    )
    test_db.add(entry)
    test_db.commit()
    return entry


def _semantic_hit(key="income", value="客户收入 8500"):
    return [
        {
            "fact_id": 1,
            "case_id": "recall_c1",
            "key": key,
            "value": value,
            "category": "income",
            "track": "internal",
            "score": 0.5,
        }
    ]


class TestSemanticLayer:
    def test_semantic_hit_appended(self, test_db, monkeypatch):
        """语义命中以 [语义] 前缀追加。"""
        monkeypatch.setattr(vector, "semantic_search", lambda db, q, **kw: _semantic_hit())
        out = recall_for_context("recall_c1", "收入", test_db)
        assert "[语义] income: 客户收入 8500" in out

    def test_semantic_failure_falls_back_to_like(self, test_db, case_entry, monkeypatch):
        """语义层抛错 → 回退 LIKE，不抛错，仍有结果。"""
        def _boom(db, q, **kw):
            raise RuntimeError("vec unavailable")

        monkeypatch.setattr(vector, "semantic_search", _boom)
        out = recall_for_context("recall_c1", "8500", test_db)
        assert "客户收入 8500" in out
        assert "[语义]" not in out

    def test_only_semantic_when_no_like(self, test_db, monkeypatch):
        """无 LIKE 结果但语义命中 → 仍返回语义行。"""
        monkeypatch.setattr(vector, "semantic_search", lambda db, q, **kw: _semantic_hit())
        out = recall_for_context("recall_no_like", "收入", test_db)
        assert "[语义] income: 客户收入 8500" in out

    def test_all_empty_returns_empty(self, test_db, monkeypatch):
        """无 LIKE、无语义、无 Mem0 → 返回空串。"""
        monkeypatch.setattr(vector, "semantic_search", lambda db, q, **kw: [])
        monkeypatch.setattr(recall_mod, "recall", lambda c, q, d: "", raising=False)
        assert recall_for_context("recall_empty", "不存在", test_db) == ""

    def test_mem0_failure_does_not_block(self, test_db, case_entry, monkeypatch):
        """Mem0 抛错被吞掉，LIKE + 语义结果仍返回。"""
        monkeypatch.setattr(vector, "semantic_search", lambda db, q, **kw: _semantic_hit())
        monkeypatch.setattr(
            recall_mod, "recall",
            lambda c, q, d: (_ for _ in ()).throw(RuntimeError("mem0 down")),
            raising=False,
        )
        out = recall_for_context("recall_c1", "8500", test_db)
        assert "[语义]" in out
        assert "客户收入 8500" in out


class TestOrdering:
    def test_order_like_then_semantic_then_mem0(self, test_db, case_entry, monkeypatch):
        """LIKE(确认,1.2) > 语义(0.9) > Mem0(0.5) 的顺序。"""
        monkeypatch.setattr(vector, "semantic_search", lambda db, q, **kw: _semantic_hit(value="语义命中 8500"))
        monkeypatch.setattr(recall_mod, "recall", lambda c, q, d: "Mem0 记忆一行", raising=False)

        out = recall_for_context("recall_c1", "8500", test_db)
        lines = [ln for ln in out.split("\n") if ln.strip()]
        assert len(lines) == 3

        like_idx = next(i for i, ln in enumerate(lines) if "客户收入 8500" in ln)
        sem_idx = next(i for i, ln in enumerate(lines) if "[语义]" in ln)
        mem_idx = next(i for i, ln in enumerate(lines) if "Mem0 记忆" in ln)
        assert like_idx < sem_idx < mem_idx