"""tests/test_core/test_agent_flows.py — 流程包注册表测试 (WO-26)"""

import pytest

from core.agents.flows import flow_tool_whitelist, load_flows, match_flow


def test_load_flows_returns_three_flows():
    flows = load_flows()
    assert len(flows) == 3
    assert set(flows.keys()) == {"declaration_check", "calculator", "case_intake"}


def test_flows_schema_integrity():
    flows = load_flows()
    whitelist = flow_tool_whitelist()
    for key, flow in flows.items():
        assert flow["key"] == key
        assert flow["presentation"] in ("result_card", "dialog")
        assert isinstance(flow["steps"], list) and len(flow["steps"]) > 0
        for step in flow["steps"]:
            assert step["tool"] in whitelist


def test_match_flow_declaration_check():
    flow = match_flow("帮我检查一下申报一致性")
    assert flow is not None
    assert flow["key"] == "declaration_check"


def test_match_flow_calculator():
    flow = match_flow("算一下 CBA 贷款能力")
    assert flow is not None
    assert flow["key"] == "calculator"


def test_match_flow_case_intake():
    flow = match_flow("帮我建个案件")
    assert flow is not None
    assert flow["key"] == "case_intake"


def test_match_flow_no_match():
    flow = match_flow("今天天气怎么样")
    assert flow is None


def test_flow_dir_missing_fallback(monkeypatch, tmp_path):
    missing_dir = tmp_path / "non_existent_dir"
    monkeypatch.setattr("core.agents.flows.FLOW_DIR", missing_dir)
    assert load_flows() == {}
    assert match_flow("帮我建个案件") is None


def test_invalid_presentation_raises_value_error(monkeypatch, tmp_path):
    invalid_file = tmp_path / "bogus.yaml"
    invalid_file.write_text(
        """
key: bogus
name: "Bogus Flow"
triggers: ["bogus"]
presentation: bogus
steps:
  - tool: declaration_check
""",
        encoding="utf-8",
    )
    monkeypatch.setattr("core.agents.flows.FLOW_DIR", tmp_path)
    with pytest.raises(ValueError, match="invalid presentation"):
        load_flows()
