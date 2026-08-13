"""Skill Package Manifest Pydantic Schema and Validation (WO-28)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from core.agents.flows import flow_tool_whitelist

SkillCategory = Literal["agent", "tool", "flow", "knowledge"]
SkillPresentation = Literal["result_card", "dialog", "notification"]
SkillPermission = Literal["read_only", "draft", "system_config"]
SkillStatus = Literal["draft", "active", "deprecated"]

_FORBIDDEN_ASSET_TERMS = frozenset({
    "python", "script", "code", "bash", "sh", "exec", "eval", "bin",
    ".py", ".sh", ".exe", ".bat", ".cmd", ".ps1"
})
_FORBIDDEN_ASSET_KEYS = frozenset({"exec", "script", "code", "eval", "command", "binary"})


class StepSpec(BaseModel):
    """Manifest step specification."""
    tool: str
    params: dict[str, Any] = Field(default_factory=dict)
    output: str | None = None

    @field_validator("tool")
    @classmethod
    def validate_tool_whitelist(cls, v: str) -> str:
        whitelist = flow_tool_whitelist()
        if v not in whitelist:
            raise ValueError(f"Tool '{v}' is not in whitelist: {sorted(whitelist)}")
        return v


class AssetSpec(BaseModel):
    """Manifest asset specification (strictly non-executable data)."""
    key: str
    type: str = "prompt"  # prompt / email_template / checklist / text / data
    content: str = ""
    extra: dict[str, Any] = Field(default_factory=dict)

    @field_validator("type", "content")
    @classmethod
    def validate_non_executable(cls, v: str) -> str:
        val_lower = str(v).lower()
        for forbidden in _FORBIDDEN_ASSET_TERMS:
            if forbidden in val_lower:
                raise ValueError(f"Asset field contains forbidden executable token '{forbidden}'")
        return v


class SkillManifest(BaseModel):
    """Skill Package Manifest Model (Super-set of flow package)."""
    key: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    description: str = ""
    version: str = "1.0.0"
    category: SkillCategory = "flow"
    triggers: list[str] = Field(default_factory=list)
    presentation: SkillPresentation = "result_card"
    permission: SkillPermission = "draft"
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    steps: list[dict[str, Any]] = Field(default_factory=list)
    assets: list[dict[str, Any]] = Field(default_factory=list)
    confirm_required: bool = True
    status: SkillStatus = "draft"
    author: str = "vera"

    @field_validator("steps")
    @classmethod
    def check_steps(cls, steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for idx, step in enumerate(steps):
            if not isinstance(step, dict):
                raise TypeError(f"Step [{idx}] must be a dictionary")
            tool = step.get("tool")
            if not tool or not isinstance(tool, str):
                raise TypeError(f"Step [{idx}] missing valid 'tool' string")
            StepSpec.validate_tool_whitelist(tool)
        return steps

    @field_validator("assets")
    @classmethod
    def check_assets_no_code(cls, assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for idx, asset in enumerate(assets):
            if not isinstance(asset, dict):
                raise TypeError(f"Asset [{idx}] must be a dictionary")
            for key, val in asset.items():
                if key in _FORBIDDEN_ASSET_KEYS:
                    raise ValueError(f"Asset [{idx}] contains forbidden key '{key}'")
                val_str = str(val).lower()
                for forbidden in _FORBIDDEN_ASSET_TERMS:
                    if forbidden in val_str:
                        raise ValueError(f"Asset [{idx}] field '{key}' contains forbidden executable token '{forbidden}'")
        return assets


def validate_manifest(data: dict[str, Any]) -> SkillManifest:
    """Validate raw dictionary data against SkillManifest schema."""
    return SkillManifest.model_validate(data)
