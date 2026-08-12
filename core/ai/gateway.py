"""API Gateway for connecting to LLMs securely.

This module provides the ApiGateway class which standardizes calls to AI models,
enforces PII leak detection as a final safety measure, manages retries and 
timeouts, reports token usage and cost, and supports automatic fallback to a
secondary provider when the primary fails.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    OpenAI,
    RateLimitError,
)

from core.config import ConfigLoader
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.leak_detector import PiiLeakDetector

logger = get_logger(__name__)


@dataclass
class ApiCallResult:
    """Standardized result of an LLM API call."""
    response_text: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    latency_ms: int
    provider_used: str = ""
    tool_calls: list[dict] | None = None    # 新增：LLM 返回的 function calls
    prompt_cache_hit_tokens: int = 0        # 新增：DeepSeek 缓存命中输入 token
    prompt_cache_miss_tokens: int = 0       # 新增：未命中输入 token


_USAGE = {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0}


def get_usage_stats() -> dict:
    """返回自服务启动以来的 AI 调用统计（内存累计）。"""
    return dict(_USAGE)


class SafetyViolationError(Exception):
    """Raised when the payload fails PII leak detection."""


class LLMError(Exception):
    """Raised when the LLM call fails after all retries on all providers."""


class ApiGateway:
    """Safe, resilient wrapper for external LLM inference with fallback support.

    The gateway tries the primary provider first. If it fails with a
    retriable error (connection, timeout, rate limit), it automatically
    switches to the fallback provider (if configured). Authentication
    errors are NOT retried — they indicate a misconfiguration.
    """

    # Errors that warrant trying the fallback provider
    _RETRIABLE_ERRORS = (APIConnectionError, APITimeoutError, RateLimitError)

    def __init__(self, config: ConfigLoader) -> None:
        self._config = config
        self._ai_settings = config.settings.ai
        self._detector = PiiLeakDetector()

        # Build clients for each configured provider
        self._primary_client, self._primary_model, self._primary_name = (
            self._build_client(self._ai_settings.primary)
        )
        self._fallback_client = None
        self._fallback_model = ""
        self._fallback_name = ""

        if self._ai_settings.fallback:
            try:
                self._fallback_client, self._fallback_model, self._fallback_name = (
                    self._build_client(self._ai_settings.fallback)
                )
                logger.info(
                    "Fallback provider configured: %s (%s)",
                    self._fallback_name, self._fallback_model,
                )
            except ValueError as e:
                # Fallback key missing — not fatal, just no fallback available
                logger.warning("Fallback provider unavailable: %s", e)

        self._providers: dict[str, tuple] = {
            self._primary_name: (self._primary_client, self._primary_model, self._primary_name),
        }
        if self._fallback_client:
            self._providers[self._fallback_name] = (
                self._fallback_client, self._fallback_model, self._fallback_name,
            )

    def _build_client(self, provider_config) -> tuple[OpenAI, str, str]:
        """Create an OpenAI-compatible client for a provider config.

        Returns:
            Tuple of (client, model_name, provider_name).

        Raises:
            ValueError: If the API key env var is not set.
        """
        api_key = os.getenv(provider_config.api_key_env, "")
        if not api_key:
            raise ValueError(f"Missing API key: {provider_config.api_key_env}")

        # Allow base_url override from environment variables for proxy/mirror connections without VPN
        base_url = provider_config.base_url
        if provider_config.provider == "gemini":
            env_base = os.getenv("GEMINI_API_BASE") or os.getenv("GEMINI_BASE_URL")
            if env_base:
                base_url = env_base
        elif provider_config.provider == "deepseek":
            env_base = os.getenv("DEEPSEEK_API_BASE") or os.getenv("DEEPSEEK_BASE_URL")
            if env_base:
                base_url = env_base

        client_kwargs: dict = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url

        client = OpenAI(
            **client_kwargs,
            max_retries=self._ai_settings.max_retries,
            timeout=self._ai_settings.timeout_seconds,
        )
        return client, provider_config.model, provider_config.provider

    def call_llm(
        self,
        text: DesensitizedText,
        prompt_template: str,
        system_prompt: str = "You are a helpful assistant.",
        tools: list[dict] | None = None,        # <-- 新增
        tool_choice: str | None = None,          # <-- 新增 "auto" | "none" | "required"
        prefer_provider: str | None = None,      # 新增：模型路由（#10）优先 provider
    ) -> ApiCallResult:
        """Call the LLM with strict safety checks and automatic fallback.

        Tries the primary provider first. On retriable failures (connection,
        timeout, rate limit), automatically falls back to the secondary
        provider if configured.

        Args:
            text: The heavily redacted text payload. Must be a DesensitizedText instance.
            prompt_template: The instruction prompt.
            system_prompt: Optional tailored system instructions.
            tools: Optional OpenAI-compatible function calling tool schemas.
            tool_choice: Optional "auto"/"none"/"required" (defaults to "auto" when tools given).

        Returns:
            An ApiCallResult mapping the response and metadata.

        Raises:
            SafetyViolationError: If final payload contains PII.
            LLMError: If all providers fail.
            TypeError: If text is not DesensitizedText.
        """
        # Ensure it is explicitly typed content
        if not isinstance(text, DesensitizedText):
            raise TypeError("ApiGateway requires DesensitizedText object.")

        full_prompt = f"{prompt_template}\n\n{text}"

        # FINAL SAFETY CHECK
        try:
            self._detector.assert_clean(full_prompt)
        except Exception as e:
            logger.critical("Safety leak detected before API transmission! details=%s", e)
            raise SafetyViolationError("Payload contains PII") from e

        # Try primary, then fallback on retriable errors
        providers = self._ordered_providers(prefer_provider)

        last_error: Exception | None = None
        for client, model, provider_name in providers:
            try:
                result = self._do_call(
                    client, model, provider_name, full_prompt, system_prompt, tools, tool_choice
                )
                _USAGE["calls"] += 1
                _USAGE["prompt_tokens"] += result.prompt_tokens or 0
                _USAGE["completion_tokens"] += result.completion_tokens or 0
                _USAGE["cost_usd"] += result.cost_usd or 0.0
                return result
            except AuthenticationError as e:
                # Auth errors are NOT retriable — bad key is bad key
                logger.error("Authentication failed for %s: %s", provider_name, e)
                raise LLMError(f"Authentication failed for {provider_name}: {e}") from e
            except self._RETRIABLE_ERRORS as e:
                logger.warning(
                    "Provider %s failed (retriable): %s. %s",
                    provider_name, e,
                    "Trying fallback..." if self._fallback_client and provider_name == self._primary_name else "No fallback available.",
                )
                last_error = e
                continue
            except Exception as e:  # noqa: BLE001 — provider 失败进入下一个 fallback
                logger.error("Unexpected error from %s: %s", provider_name, e)
                last_error = e
                continue

        raise LLMError(f"All providers failed. Last error: {last_error}") from last_error

    def _ordered_providers(self, prefer_provider: str | None) -> list[tuple]:
        """模型路由（#10）：prefer 的 provider 排最前，其余按原序作 fallback。"""
        if not prefer_provider or prefer_provider not in self._providers:
            return list(self._providers.values())
        preferred = self._providers[prefer_provider]
        others = [v for k, v in self._providers.items() if k != prefer_provider]
        return [preferred, *others]

    def _do_call(
        self,
        client: OpenAI,
        model: str,
        provider_name: str,
        full_prompt: str,
        system_prompt: str,
        tools: list[dict] | None = None,
        tool_choice: str | None = None,
    ) -> ApiCallResult:
        """Execute a single API call to a specific provider."""
        start_time = time.time()

        kwargs: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_prompt},
            ],
            "temperature": 0.0,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = tool_choice or "auto"

        response = client.chat.completions.create(**kwargs)

        latency_ms = int((time.time() - start_time) * 1000)

        choice = response.choices[0]
        usage = response.usage

        # Default usage if none provided by API
        p_tokens = usage.prompt_tokens if usage else 0
        c_tokens = usage.completion_tokens if usage else 0

        p_cache_hit = int(getattr(usage, "prompt_cache_hit_tokens", 0) or 0)
        p_cache_miss = int(getattr(usage, "prompt_cache_miss_tokens", 0) or 0)

        # Simple cost estimation (approximate tier pricing)
        # Gemini Flash: ~$0.075/1M input, ~$0.30/1M output
        # DeepSeek V4: ~$0.14/1M input, ~$0.28/1M output
        cost_usd = (p_tokens * 0.0001 / 1000) + (c_tokens * 0.0002 / 1000)

        # Parse native function calls if present
        raw_tool_calls = choice.message.tool_calls
        parsed_calls = None
        if raw_tool_calls:
            parsed_calls = []
            for tc in raw_tool_calls:
                try:
                    parsed_args = json.loads(tc.function.arguments)
                except (TypeError, ValueError):
                    parsed_args = {}
                parsed_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": parsed_args,
                })

        response_text = str(choice.message.content or "")

        logger.info(
            "API call success: provider=%s model=%s latency=%dms tokens=%d+%d tool_calls=%s",
            provider_name, model, latency_ms, p_tokens, c_tokens,
            len(parsed_calls) if parsed_calls else 0,
        )

        return ApiCallResult(
            response_text=response_text,
            prompt_tokens=p_tokens,
            completion_tokens=c_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            provider_used=provider_name,
            tool_calls=parsed_calls,
            prompt_cache_hit_tokens=p_cache_hit,
            prompt_cache_miss_tokens=p_cache_miss,
        )
