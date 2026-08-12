"""WO-09 一句话摘要（懒刷新 + dirty 5 路径）测试。"""

from pathlib import Path
from types import SimpleNamespace
from typing import ClassVar

import pytest

from core.ai import case_summary
from core.ai.case_summary import (
    _CACHE,
    get_case_one_liner,
    mark_case_summary_dirty,
    refresh_case_summary,
)
from core.models.orm import Case

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def _clean_cache():
    _CACHE.clear()
    yield
    _CACHE.clear()


@pytest.fixture
def _offline(monkeypatch):
    """禁用 LLM 与真实配置加载，摘要走规则回退。"""
    monkeypatch.setattr(
        "core.ai.case_summary.get_config",
        lambda: SimpleNamespace(project_root=_PROJECT_ROOT),
    )

    class _FakeGateway:
        def __init__(self, config):
            raise RuntimeError("no LLM in test")

    monkeypatch.setattr("core.ai.case_summary.ApiGateway", _FakeGateway)


def _make_case(db, case_id: str = "CASE-SUM-001", **kwargs) -> Case:
    defaults = {
        "id": case_id,
        "client_name": "PERSON_SUM",
        "lender": "CBA",
        "loan_amount": 850000,
        "stage": "收集资料",
        "purpose": "Purchase",
    }
    defaults.update(kwargs)
    case = Case(**defaults)
    db.add(case)
    db.commit()
    return case


class TestGetOneLiner:
    def test_le_50_chars_rule_fallback(self, test_db, _offline):
        _make_case(test_db)
        summary = get_case_one_liner("CASE-SUM-001", test_db)
        assert isinstance(summary, str)
        assert len(summary) <= 50, f"len={len(summary)}: {summary}"

    def test_returns_persisted_summary_without_refresh(self, test_db, monkeypatch):
        _make_case(test_db, context_summary="等 CBA 审批，清单 10/12")
        called = {"n": 0}

        def _boom(case_id, db):
            called["n"] += 1
            raise AssertionError("refresh should not be called")

        monkeypatch.setattr(case_summary, "refresh_case_summary", _boom)
        summary = get_case_one_liner("CASE-SUM-001", test_db)
        assert summary == "等 CBA 审批，清单 10/12"
        assert called["n"] == 0

    def test_missing_case_returns_empty(self, test_db, _offline):
        assert get_case_one_liner("CASE-GONE", test_db) == ""

    def test_dirty_forces_refresh(self, test_db, _offline):
        _make_case(test_db)
        first = get_case_one_liner("CASE-SUM-001", test_db)
        assert first  # 已缓存
        mark_case_summary_dirty("CASE-SUM-001", test_db)
        second = get_case_one_liner("CASE-SUM-001", test_db)
        assert len(second) <= 50
        assert "CBA" in second or "清单" in second


class TestMarkDirty:
    def test_clears_cache_and_persisted(self, test_db):
        _make_case(test_db, context_summary="旧摘要")
        _CACHE["CASE-SUM-001"] = ("旧摘要", 9999999999.0)
        mark_case_summary_dirty("CASE-SUM-001", test_db)
        assert "CASE-SUM-001" not in _CACHE
        case = test_db.query(Case).filter(Case.id == "CASE-SUM-001").first()
        assert case.context_summary is None

    def test_no_case_no_error(self, test_db):
        mark_case_summary_dirty("CASE-NOPE", test_db)  # 不应抛错


class TestRefresh:
    def test_refresh_writes_persisted_and_cache(self, test_db, _offline):
        _make_case(test_db)
        summary = refresh_case_summary("CASE-SUM-001", test_db)
        assert len(summary) <= 50
        case = test_db.query(Case).filter(Case.id == "CASE-SUM-001").first()
        assert case.context_summary == summary
        assert _CACHE.get("CASE-SUM-001") == (summary, pytest.approx(_CACHE["CASE-SUM-001"][1], abs=1))


class TestDirtyWritePaths:
    """5 条 dirty 写路径必须全部接入 mark_case_summary_dirty。"""

    _WRITE_PATHS: ClassVar[list[tuple[str, str]]] = [
        ("server/api/chat.py", "AI 对话工具执行成功"),
        ("core/inbox/matching.py", "邮件匹配归案"),
        ("server/api/files.py", "清单 confirm/revoke"),
        ("server/api/cases.py", "stage-advance"),
    ]

    @pytest.mark.parametrize("rel_path,label", _WRITE_PATHS, ids=lambda x: str(x))
    def test_write_path_wired(self, rel_path, label):
        source = (_PROJECT_ROOT / rel_path).read_text(encoding="utf-8")
        assert "mark_case_summary_dirty" in source, f"{label} ({rel_path}) 未接入"

    def test_files_confirm_and_revoke_both_wired(self):
        source = (_PROJECT_ROOT / "server/api/files.py").read_text(encoding="utf-8")
        assert source.count("mark_case_summary_dirty") >= 2