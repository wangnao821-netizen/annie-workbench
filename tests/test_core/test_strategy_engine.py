"""core/strategy/strategy.py 迁移测试。"""

from core.ai.gateway import ApiCallResult
from core.models.orm import Case
from core.models.types import DesensitizedText
from core.strategy.strategy import StrategyEngine, StrategyReport


class _FakeGateway:
    def __init__(self, fail=False):
        self._fail = fail
        self.calls = []

    def call_llm(self, text, prompt_template, system_prompt="", **kwargs):
        self.calls.append(text)
        if self._fail:
            raise RuntimeError("LLM down")
        return ApiCallResult(
            response_text="# 策略报告\n\n**Top 3 Lenders**",
            prompt_tokens=10,
            completion_tokens=5,
            cost_usd=0.0,
            latency_ms=1,
        )


class _FakeConfig:
    pass


def _make_case(test_db):
    case = Case(id="case_st_1", client_name="PERSON_1", lender="CBA", stage="收集资料")
    test_db.add(case)
    test_db.commit()
    return case


class TestGenerateStrategy:
    def test_success(self, test_db):
        case = _make_case(test_db)
        gw = _FakeGateway()
        report = StrategyEngine(test_db, gw, _FakeConfig(), pii=None).generate_strategy("case_st_1")
        assert isinstance(report, StrategyReport)
        assert "Top 3 Lenders" in report.raw_markdown
        test_db.refresh(case)
        assert case.strategy_report == report.raw_markdown

    def test_llm_failure_falls_back(self, test_db):
        case = _make_case(test_db)
        gw = _FakeGateway(fail=True)
        report = StrategyEngine(test_db, gw, _FakeConfig(), pii=None).generate_strategy("case_st_1")
        assert "离线预估版" in report.raw_markdown
        test_db.refresh(case)
        assert "离线预估版" in case.strategy_report

    def test_payload_goes_through_desensitize(self, test_db):
        _make_case(test_db)
        gw = _FakeGateway()
        StrategyEngine(test_db, gw, _FakeConfig(), pii=None).generate_strategy("case_st_1")
        assert len(gw.calls) == 1
        assert isinstance(gw.calls[0], DesensitizedText)

    def test_get_cached_strategy(self, test_db):
        _make_case(test_db)
        engine = StrategyEngine(test_db, _FakeGateway(), _FakeConfig(), pii=None)
        assert engine.get_cached_strategy("case_st_1") is None
        engine.generate_strategy("case_st_1")
        assert engine.get_cached_strategy("case_st_1") is not None
