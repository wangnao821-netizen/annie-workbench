"""WO-15 BrainFact — 规则锚定 / 词表 / LLM 提取 / 幂等同步 测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from core.ai.gateway import ApiCallResult
from core.facts.anchors import amount_tokens, extract_rule_facts
from core.facts.extract import (
    _load_schema_keys,
    extract_facts_from_text,
    sync_brain_facts,
)
from core.models.orm import BrainFact, Case, CaseContextEvent
from server.deps import get_db
from server.main import app

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture(autouse=True)
def _facts_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path / "cf"))
    monkeypatch.setenv("ENV", "development")


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _add_event(db, case_id: str, content: str, status: str = "confirmed", track: str = "internal") -> CaseContextEvent:
    row = CaseContextEvent(
        case_id=case_id, source_type="manual_note", content=content, track=track, status=status
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestRuleAnchors:
    def test_bank_and_stage_detected(self):
        facts = extract_rule_facts("客户从 CBA 转到 ANZ，递交中")
        keys = {f["key"] for f in facts}
        assert "bank.lender" in keys
        assert "stage.current" in keys
        assert facts[0]["anchor"] == "rule"

    def test_non_bank_text_no_false_positive(self):
        assert extract_rule_facts("客户想了解自住贷款资讯") == []

    def test_amount_tokens_returned(self):
        tokens = amount_tokens("房价 120万，贷款 850,000")
        assert tokens
        assert any("120" in t for t in tokens)


class TestFactSchema:
    def _data(self):
        return yaml.safe_load((_PROJECT_ROOT / "config" / "fact_schema.yaml").read_text(encoding="utf-8"))

    def test_schema_has_42_unique_keys(self):
        keys = [f"{c}.{k}" for c, v in self._data()["categories"].items() for k in v]
        assert len(keys) == 42
        assert len(set(keys)) == 42

    def test_anchor_values_valid(self):
        anchors = {v[k]["anchor"] for c, v in self._data()["categories"].items() for k in v}
        assert anchors <= {"rule", "llm", "llm+rule"}


class _FakeGateway:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text

    def call_llm(self, **kwargs):
        return ApiCallResult(
            response_text=self._response_text, prompt_tokens=0, completion_tokens=0, cost_usd=0.0, latency_ms=0
        )


class _BrokenGateway:
    def __init__(self, config):
        pass

    def call_llm(self, **kwargs):
        raise RuntimeError("llm down")


class TestExtract:
    def test_llm_failure_falls_back_empty(self, monkeypatch, test_db):
        monkeypatch.setattr("core.facts.extract.ApiGateway", _BrokenGateway)
        facts = extract_facts_from_text("客户收入 8500", "C-1", test_db, _load_schema_keys())
        assert facts == []

    def test_out_of_schema_key_becomes_unclassified(self, monkeypatch, test_db):
        resp = json.dumps([{"key": "unclassified", "value": "客户喜欢墨尔本北区"}])
        monkeypatch.setattr("core.facts.extract.ApiGateway", lambda cfg: _FakeGateway(resp))
        facts = extract_facts_from_text("客户喜欢墨尔本北区", "C-1", test_db, _load_schema_keys())
        assert facts[0]["key"] == "unclassified"

    def test_schema_keys_whitelist_enforced(self, monkeypatch, test_db):
        resp = json.dumps([{"key": "hobby.piano", "value": "弹琴"}])
        monkeypatch.setattr("core.facts.extract.ApiGateway", lambda cfg: _FakeGateway(resp))
        facts = extract_facts_from_text("客户弹琴", "C-1", test_db, _load_schema_keys())
        assert facts == []


class TestSync:
    def test_sync_from_confirmed_event_creates_fact(self, test_db):
        test_db.add(Case(id="BF-1", client_name="张三"))
        test_db.commit()
        _add_event(test_db, "BF-1", "客户在 CBA 申请，递交中")
        written = sync_brain_facts("BF-1", test_db)
        assert written >= 1
        keys = {f.key for f in test_db.query(BrainFact).filter(BrainFact.case_id == "BF-1").all()}
        assert {"bank.lender", "stage.current"} <= keys

    def test_sync_idempotent(self, test_db):
        test_db.add(Case(id="BF-2", client_name="李四"))
        test_db.commit()
        _add_event(test_db, "BF-2", "客户在 NAB 建档")
        sync_brain_facts("BF-2", test_db)
        count1 = test_db.query(BrainFact).filter(BrainFact.case_id == "BF-2").count()
        written2 = sync_brain_facts("BF-2", test_db)
        count2 = test_db.query(BrainFact).filter(BrainFact.case_id == "BF-2").count()
        assert count1 == count2
        assert written2 == 0

    def test_pending_event_not_included(self, test_db):
        test_db.add(Case(id="BF-3", client_name="王五"))
        test_db.commit()
        _add_event(test_db, "BF-3", "客户在 ANZ 递交", status="pending")
        written = sync_brain_facts("BF-3", test_db)
        assert written == 0
        assert test_db.query(BrainFact).filter(BrainFact.case_id == "BF-3").count() == 0

    def test_conflict_supersedes_old_fact(self, test_db):
        test_db.add(Case(id="BF-4", client_name="赵六"))
        test_db.commit()
        _add_event(test_db, "BF-4", "客户银行是 CBA")
        _add_event(test_db, "BF-4", "客户银行改为 ANZ")
        sync_brain_facts("BF-4", test_db)
        rows = test_db.query(BrainFact).filter(BrainFact.case_id == "BF-4", BrainFact.key == "bank.lender").all()
        assert len(rows) == 2
        old = next(r for r in rows if r.value == "CBA")
        new = next(r for r in rows if r.value == "ANZ")
        assert old.superseded_by == new.id
        assert old.conflict is True
        assert old.valid_to is not None
        assert new.valid_to is None

    def test_superseded_event_invalidates_facts(self, test_db):
        test_db.add(Case(id="BF-5", client_name="孙七"))
        test_db.commit()
        evt = _add_event(test_db, "BF-5", "客户在 Westpac 收集资料")
        sync_brain_facts("BF-5", test_db)
        fact = test_db.query(BrainFact).filter(BrainFact.case_id == "BF-5", BrainFact.event_id == evt.id).first()
        assert fact.valid_to is None
        evt.status = "superseded"; test_db.commit()
        written = sync_brain_facts("BF-5", test_db)
        assert written >= 1
        test_db.refresh(fact)
        assert fact.valid_to is not None

    def test_sync_endpoint_and_list(self, client, test_db):
        test_db.add(Case(id="BF-6", client_name="周八"))
        test_db.commit()
        _add_event(test_db, "BF-6", "客户从 ANZ 递交中", track="internal")
        _add_event(test_db, "BF-6", "已递交至 NAB", track="external")

        resp = client.post("/api/cases/BF-6/facts/sync")
        assert resp.status_code == 200
        assert resp.json()["written"] >= 1

        listing = client.get("/api/cases/BF-6/facts")
        assert listing.status_code == 200
        keys = {f["key"] for f in listing.json()}
        assert {"bank.lender", "stage.current"} <= keys

        ext = client.get("/api/cases/BF-6/facts", params={"track": "external"})
        assert ext.status_code == 200
        assert all(f["track"] == "external" for f in ext.json())
        assert any(f["value"] == "NAB" for f in ext.json())

        assert client.get("/api/cases/NO-SUCH/facts").status_code == 404
        assert client.post("/api/cases/NO-SUCH/facts/sync").status_code == 404