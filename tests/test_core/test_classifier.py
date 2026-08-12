"""文件分类测试 — 钉住 core.pipeline.classifier 的输入校验、AI 返回与降级路径。"""

from pathlib import Path
from types import SimpleNamespace

import pytest

from core.ai.gateway import ApiCallResult, LLMError, SafetyViolationError
from core.models.types import DesensitizedText
from core.pipeline.classifier import ClassificationResult, classify_and_extract

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _make_config() -> SimpleNamespace:
    """最小可用的 ConfigLoader 替身（读真实 classify.txt + 命名规则）。"""
    return SimpleNamespace(
        project_root=_PROJECT_ROOT,
        naming_rules={
            "rules": {
                "Payslip": {"template": "Income Payslip {employer} {date}.pdf"},
                "Bank Statement": {"template": "Bank Statement {bank} {last4}.pdf"},
            }
        },
    )


class _FakeGateway:
    """返回固定结果的假 ApiGateway。"""

    def __init__(self, *, payload: str = "", error: Exception | None = None) -> None:
        self.payload = payload
        self.error = error
        self.called_with: dict | None = None

    def call_llm(self, **kwargs):
        self.called_with = kwargs
        if self.error is not None:
            raise self.error
        return ApiCallResult(
            response_text=self.payload,
            prompt_tokens=0,
            completion_tokens=0,
            cost_usd=0.0,
            latency_ms=0,
        )


class TestInputValidation:
    """classify_and_extract 必须拒绝非 DesensitizedText。"""

    def test_plain_str_rejected(self):
        with pytest.raises(TypeError):
            classify_and_extract("raw text", route="email", config=_make_config())

    def test_desensitized_text_accepted(self):
        """合法输入不抛类型错误（走 LLM 失败降级不炸）。"""
        gateway = _FakeGateway(error=LLMError("no key in test"))
        result = classify_and_extract(
            DesensitizedText("payslip text"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert isinstance(result, ClassificationResult)


class TestAiClassification:
    """LLM 正常返回 JSON 时正确解析。"""

    def test_parses_document_type(self):
        payload = (
            '{"document_type": "Payslip", "confidence": 0.92, '
            '"employer": "ACME Pty Ltd", "key_date": "2026-01-15"}'
        )
        gateway = _FakeGateway(payload=payload)
        result = classify_and_extract(
            DesensitizedText("salary data"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert result.document_type == "Payslip"
        assert result.confidence == 0.92
        assert "ACME Pty Ltd" in result.suggested_name
        assert result.route_used == "email"

    def test_markdown_code_block_stripped(self):
        payload = '```json\n{"document_type": "Bank Statement", "confidence": 0.8}\n```'
        gateway = _FakeGateway(payload=payload)
        result = classify_and_extract(
            DesensitizedText("bsb statement"), route="file",
            config=_make_config(), gateway=gateway,
        )
        assert result.document_type == "Bank Statement"

    def test_source_label_defaults(self):
        gateway = _FakeGateway(payload='{"document_type": "Payslip"}')
        result = classify_and_extract(
            DesensitizedText("x"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert result.source_label == "client_original"


class TestFallback:
    """LLM 失败时走离线规则降级，不抛异常。"""

    def test_llm_error_fallback_payslip(self):
        gateway = _FakeGateway(error=LLMError("down"))
        result = classify_and_extract(
            DesensitizedText("payslip gross pay salary"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert result.document_type == "Payslip"
        assert result.route_used == "fallback"
        assert result.confidence == 0.75

    def test_llm_error_fallback_bank(self):
        gateway = _FakeGateway(error=LLMError("down"))
        result = classify_and_extract(
            DesensitizedText("bank statement bsb"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert result.document_type == "Bank Statement"

    def test_safety_violation_fallback(self):
        gateway = _FakeGateway(error=SafetyViolationError("PII leak"))
        result = classify_and_extract(
            DesensitizedText("gross pay"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert result.route_used == "fallback"

    def test_unrecognized_text_falls_to_unknown(self):
        gateway = _FakeGateway(error=LLMError("down"))
        result = classify_and_extract(
            DesensitizedText("unrecognizable random content"), route="email",
            config=_make_config(), gateway=gateway,
        )
        assert result.document_type == "Unknown"
        assert result.confidence == 0.0
