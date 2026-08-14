"""AI 人格配置测试 — 加载、回退、system prompt 拼装与角色层注入（2026-08-14）。"""

from __future__ import annotations

import pytest

import core.persona as persona_mod
from core.ai.context_builder import BUDGET_ROLE, _build_role_prompt
from core.persona import build_system_prompt, get_default_key, load_persona

LEGACY_ROLE = (
    "你是澳洲贷款经纪团队的 AI 助手。你了解每个客户的具体情况和团队的历史经验。"
    "回答要具体到这个客户，不要给通用建议。"
)


class TestPersonaLoad:
    def test_default_key_is_a(self) -> None:
        assert get_default_key() == "a"

    def test_load_default_persona(self) -> None:
        p = load_persona()
        assert p["key"] == "a"
        assert p["name"] == "专业稳重型"
        assert p["role"] == "资深澳洲信贷顾问"
        assert len(p["rules"]) >= 2

    def test_humorous_persona(self) -> None:
        p = load_persona("d")
        assert p["name"] == "活泼幽默型"

    def test_unknown_key_falls_back_to_default(self) -> None:
        p = load_persona("zzz")
        assert p["key"] == "a"


class TestSystemPrompt:
    def test_prompt_contains_common_and_persona_rules(self) -> None:
        prompt = build_system_prompt()
        assert "有自己的专业观点" in prompt        # GitHub/OpenClaw 借鉴：不盲从
        assert "【人格：专业稳重型｜资深澳洲信贷顾问】" in prompt
        assert "结论先行" in prompt
        assert "客户名（银行）" in prompt          # 回复带名规则已并入公共规则

    def test_all_personas_within_role_budget(self) -> None:
        # BUDGET_ROLE 必须容纳最长的内置人格提示词，否则 assemble_context 会截断人格规则
        for key in ("a", "b", "c", "d"):
            assert len(build_system_prompt(key)) <= BUDGET_ROLE

    def test_missing_config_returns_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            persona_mod,
            "_PERSONA_PATH",
            persona_mod._PROJECT_ROOT / "config" / "no_such_persona.yaml",
        )
        assert build_system_prompt() == ""


class TestRoleInjection:
    def test_role_prompt_uses_persona(self) -> None:
        prompt = _build_role_prompt()
        assert "有自己的专业观点" in prompt
        assert "【人格：专业稳重型" in prompt

    def test_role_prompt_fallback_when_persona_fails(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(persona_mod, "_load", dict)
        assert _build_role_prompt() == LEGACY_ROLE
