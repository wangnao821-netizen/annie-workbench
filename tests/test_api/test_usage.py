"""用量端点测试 — /api/analytics/usage 聚合（#8：token/费用/延迟/缓存命中率）。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.analytics.bucketing import buckets_since
from core.models.orm import AiUsageLog, CaseContextEvent
from server.deps import get_db
from server.main import app


@pytest.fixture
def client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _n(dt):
    return dt.replace(tzinfo=None)


def _log(db, created_at, hit=0, miss=0, prompt=100, compl=50, cost=0.001, latency=300):
    db.add(AiUsageLog(
        case_id="U1",
        scope="case",
        track="internal",
        provider="deepseek",
        model="deepseek-v4-flash",
        prompt_tokens=prompt,
        completion_tokens=compl,
        prompt_cache_hit_tokens=hit,
        prompt_cache_miss_tokens=miss,
        cost_usd=cost,
        latency_ms=latency,
        layer_names='["role","case_brain"]',
        created_at=_n(created_at),
    ))


class TestUsageEndpoint:
    def test_empty_usage(self, client):
        resp = client.get("/api/analytics/usage")
        assert resp.status_code == 200
        body = resp.json()
        for period in (body["current"], body["previous"]):
            assert period["calls"] == 0
            assert period["prompt_tokens"] == 0
            assert period["completion_tokens"] == 0
            assert period["prompt_cache_hit_tokens"] == 0
            assert period["prompt_cache_miss_tokens"] == 0
            assert period["cache_hit_rate"] is None
            assert period["cost_usd"] == 0.0
            assert period["avg_latency_ms"] is None
            assert period["corrected_count"] == 0

    def test_usage_aggregation(self, client, test_db):
        prev, cur = buckets_since("day", 2)
        _log(test_db, cur[0], hit=80, miss=20, prompt=200, compl=100, cost=0.0015, latency=500)
        _log(test_db, prev[0], hit=0, miss=0, prompt=60, compl=30, cost=0.0005, latency=250)
        test_db.add(CaseContextEvent(
            case_id="C1", source_type="manual_note", content="x",
            status="superseded", created_at=_n(cur[0]),
        ))
        test_db.commit()

        body = client.get("/api/analytics/usage", params={"granularity": "day"}).json()
        cur_p, prev_p = body["current"], body["previous"]
        assert cur_p["calls"] == 1
        assert cur_p["prompt_tokens"] == 200
        assert cur_p["completion_tokens"] == 100
        assert cur_p["prompt_cache_hit_tokens"] == 80
        assert cur_p["prompt_cache_miss_tokens"] == 20
        assert cur_p["cache_hit_rate"] == 0.8
        assert cur_p["cost_usd"] == 0.0015
        assert cur_p["avg_latency_ms"] == 500.0
        assert cur_p["corrected_count"] == 1
        assert prev_p["calls"] == 1
        assert prev_p["prompt_tokens"] == 60
        assert prev_p["cache_hit_rate"] is None
        assert prev_p["corrected_count"] == 0

    def test_invalid_granularity(self, client):
        assert client.get("/api/analytics/usage", params={"granularity": "year"}).status_code == 422
