"""申报一致性检查 Agent 测试 — 规则比对/文件解析/结论分层/红线。"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.agents.declaration_check import (
    _rule_compare,
    run_declaration_check,
)
from core.agents.evidence import evidence_lines, extract_signals
from core.ai.gateway import ApiGateway, LLMError
from core.models.orm import BrainFact, Case, CaseContextEvent
from core.pipeline.parser import ParseError, ParseResult
from server.deps import get_db
from server.main import app


@pytest.fixture(autouse=True)
def _decl_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")
    (tmp_path / "cf").mkdir(exist_ok=True)


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _make_case(test_db, case_id="DECL-1", **kwargs) -> Case:
    case = Case(id=case_id, client_name="PERSON_1", **kwargs)
    test_db.add(case)
    test_db.commit()
    return case


def _add_external_fact(test_db, case_id: str, key: str, value: str) -> None:
    fact = BrainFact(
        case_id=case_id, key=key, value=value, category="identity",
        track="external", event_id=1, valid_to=None,
    )
    test_db.add(fact)
    test_db.commit()


def _mock_parse(monkeypatch, mapping: dict[str, ParseResult]):
    def _fake(path: Path) -> ParseResult:
        if path.name in mapping:
            return mapping[path.name]
        raise ParseError(f"File not found: {path}")

    monkeypatch.setattr("core.pipeline.parser.parse_file", _fake)


def _fail_llm(monkeypatch):
    def _fail(*args, **kwargs):
        raise LLMError("test: LLM 不可用，验证回退模板")

    monkeypatch.setattr(ApiGateway, "call_llm", _fail)


class TestEvidence:
    def test_dependents_keyword(self):
        signals = extract_signals("客户家有孩子两个，抚养开销高")
        assert signals["dependents"]

    def test_no_keyword_empty(self):
        signals = extract_signals("这是一份无关的普通文本")
        assert all(not v for v in signals.values())

    def test_evidence_lines_dedup(self):
        lines = evidence_lines("孩子 孩子", "孩子")
        assert len(lines) == 1


class TestRuleCompare:
    def test_undeclared_dependents_warning(self):
        findings = _rule_compare(
            {"identity.dependents": "0"}, {"dependents": ["文件含孩子信息"]}
        )
        assert any(f["item"] == "dependents" and f["level"] == "warning" for f in findings)

    def test_undeclared_liability_warning(self):
        findings = _rule_compare(
            {}, {"liability": ["文件含贷款信息"]}
        )
        assert any(f["item"] == "liability" and f["level"] == "warning" for f in findings)

    def test_income_mismatch_warning(self):
        findings = _rule_compare(
            {"income.amount": "50000"}, {"income": ["工资 80000"]}
        )
        assert any(f["item"] == "income" and f["level"] == "warning" for f in findings)

    def test_consistent_no_findings(self):
        findings = _rule_compare(
            {"identity.dependents": "2"}, {"dependents": ["文件含孩子信息"]}
        )
        assert not any(f["level"] in ("warning", "fail") for f in findings)


class TestRunDeclaration:
    def test_no_external_profile_fail(self, test_db):
        _make_case(test_db)
        result = run_declaration_check("DECL-1", [], None, test_db)
        assert result["status"] == "fail"
        assert "暂无外线申报画像" in result["summary"]

    def test_pass_when_consistent(self, test_db, monkeypatch):
        _make_case(test_db)
        _add_external_fact(test_db, "DECL-1", "identity.dependents", "2")
        _fail_llm(monkeypatch)
        _mock_parse(monkeypatch, {"payslip.txt": ParseResult(text="工资收入，无其他信息", text_quality="high")})
        result = run_declaration_check("DECL-1", ["payslip.txt"], None, test_db)
        assert result["status"] == "pass"
        event = test_db.query(CaseContextEvent).filter_by(case_id="DECL-1").first()
        assert event.track == "internal"
        assert "申报一致性检查" in event.content

    def test_warning_with_conflict(self, test_db, monkeypatch):
        _make_case(test_db)
        _add_external_fact(test_db, "DECL-1", "identity.dependents", "0")
        _fail_llm(monkeypatch)
        _mock_parse(monkeypatch, {"payslip.txt": ParseResult(text="客户子女两名，贷款还款中", text_quality="high")})
        result = run_declaration_check("DECL-1", ["payslip.txt"], None, test_db)
        assert result["status"] == "warning"
        assert any(f["level"] == "warning" for f in result["findings"])
        assert result["draft_explanation"]

    def test_evidence_real_for_display(self, test_db, monkeypatch):
        """红线：evidence 本地展示真实值；仅 LLM 出站时脱敏，绝不在返回给前端的 findings 里替换 PERSON_。"""
        _make_case(test_db)
        _add_external_fact(test_db, "DECL-1", "identity.dependents", "0")
        _fail_llm(monkeypatch)
        _mock_parse(monkeypatch, {"payslip.txt": ParseResult(
            text="客户王芳有孩子两个，贷款还款中", text_quality="high")})
        result = run_declaration_check("DECL-1", ["payslip.txt"], None, test_db)
        assert result["status"] == "warning"
        assert any(f["item"] == "dependents" for f in result["findings"])
        assert any("王芳" in f["evidence"] for f in result["findings"])
        assert all("PERSON_" not in f["evidence"] for f in result["findings"])

    def test_all_files_unparseable(self, test_db, monkeypatch):
        _make_case(test_db)
        _add_external_fact(test_db, "DECL-1", "identity.dependents", "0")
        _mock_parse(monkeypatch, {})
        result = run_declaration_check("DECL-1", ["missing.pdf"], None, test_db)
        assert result["status"] == "unparseable"

    def test_folder_only_one_level(self, test_db, monkeypatch, tmp_path):
        _make_case(test_db)
        _add_external_fact(test_db, "DECL-1", "identity.dependents", "2")
        folder = tmp_path / "docs"
        folder.mkdir()
        (folder / "b.txt").write_text("普通文本", encoding="utf-8")
        _mock_parse(monkeypatch, {"b.txt": ParseResult(text="普通文本", text_quality="high")})
        result = run_declaration_check("DECL-1", [], str(folder), test_db)
        assert result["status"] in ("pass", "warning", "fail")

    def test_no_auto_scan(self, test_db, monkeypatch, tmp_path):
        _make_case(test_db)
        _add_external_fact(test_db, "DECL-1", "identity.dependents", "2")
        (tmp_path / "cf" / "a.txt").write_text("普通文本", encoding="utf-8")
        (tmp_path / "cf" / "outside.txt").write_text("含孩子信息", encoding="utf-8")
        calls: list[str] = []

        def _tracking(path: Path) -> ParseResult:
            calls.append(path.name)
            return ParseResult(text="普通文本", text_quality="high")

        monkeypatch.setattr("core.pipeline.parser.parse_file", _tracking)
        run_declaration_check("DECL-1", ["a.txt"], None, test_db)
        assert calls == ["a.txt"]


class TestEndpoint:
    def test_endpoint_requires_input(self, client, test_db):
        _make_case(test_db)
        resp = client.post("/api/cases/DECL-1/declaration-check", json={"files": [], "folder": None})
        assert resp.status_code == 422

    def test_endpoint_404(self, client, test_db):
        resp = client.post("/api/cases/NOPE-404/declaration-check", json={"files": ["a.txt"]})
        assert resp.status_code == 404
