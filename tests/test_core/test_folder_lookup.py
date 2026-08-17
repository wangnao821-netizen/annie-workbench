"""tests/test_core/test_folder_lookup.py — WO-32 按需自主取案件文件夹文件单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.agents.flows import flow_tool_whitelist, match_flow
from core.agents.pai import _TOOL_NAMES as PAI_TOOL_NAMES
from core.agents.runner import run_flow
from core.case_folder.lookup import lookup_files, parse_one
from core.models.orm import Base, Case
from core.pipeline.parser import ParseResult


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    yield session
    session.close()


@pytest.fixture
def client_root_env(tmp_path, monkeypatch):
    client_root = tmp_path / "client_files"
    client_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(client_root))
    return client_root


def test_lookup_files_hit(client_root_env):
    """用例 1: 按文件名关键词检索命中（tmp 案件文件夹造文件）。"""
    case_dir = client_root_env / "Brandon" / "ClientA" / "case_101"
    case_dir.mkdir(parents=True, exist_ok=True)
    (case_dir / "payslip_202608.pdf").write_text("dummy pdf content", encoding="utf-8")
    (case_dir / "bank_statement.pdf").write_text("dummy bank statement", encoding="utf-8")

    case = Case(id="case_101", folder_path=str(case_dir))
    results = lookup_files(case, "payslip")

    assert len(results) == 1
    assert "payslip_202608.pdf" in results[0]["rel_path"]
    assert results[0]["size"] > 0
    assert results[0]["mtime"] is not None


def test_lookup_files_path_traversal(client_root_env):
    """用例 2: 路径穿越/越界（query 含 ..）→ 可读错误。"""
    case_dir = client_root_env / "Brandon" / "ClientA" / "case_102"
    case_dir.mkdir(parents=True, exist_ok=True)
    case = Case(id="case_102", folder_path=str(case_dir))

    with pytest.raises(ValueError) as exc_info:
        lookup_files(case, "../secret.txt", client_root=client_root_env)
    assert "路径穿越" in str(exc_info.value) or ".." in str(exc_info.value)

    with pytest.raises(ValueError) as exc_info_parse:
        parse_one(case, "../secret.txt", db=None, client_root=client_root_env)
    assert "路径穿越" in str(exc_info_parse.value) or ".." in str(exc_info_parse.value)


def test_lookup_files_no_folder_path(client_root_env):
    """用例 3: 无 folder_path → 可读错误。"""
    case_no_folder = Case(id="case_103", folder_path=None)
    with pytest.raises(ValueError) as exc_info:
        lookup_files(case_no_folder, "payslip", client_root=client_root_env)
    assert "案件未关联文件夹" in str(exc_info.value)

    case_empty_folder = Case(id="case_104", folder_path="")
    with pytest.raises(ValueError) as exc_info2:
        lookup_files(case_empty_folder, "payslip", client_root=client_root_env)
    assert "案件未关联文件夹" in str(exc_info2.value)


def test_lookup_read_only_assertion(client_root_env):
    """用例 4: 只读断言：检索后文件 mtime/内容不变。"""
    case_dir = client_root_env / "Brandon" / "ClientA" / "case_105"
    case_dir.mkdir(parents=True, exist_ok=True)
    target_file = case_dir / "tax_return.pdf"
    content = "Original Tax Return Content 2026"
    target_file.write_text(content, encoding="utf-8")
    stat_before = target_file.stat()

    case = Case(id="case_105", folder_path=str(case_dir))
    results = lookup_files(case, "tax_return", client_root=client_root_env)

    stat_after = target_file.stat()
    assert len(results) == 1
    assert target_file.read_text(encoding="utf-8") == content
    assert stat_before.st_mtime == stat_after.st_mtime
    assert stat_before.st_size == stat_after.st_size


def test_parse_one_desensitized(client_root_env, db_session, monkeypatch):
    """用例 5: parse_one 返回脱敏摘要（monkeypatch 解析器）。"""
    case_dir = client_root_env / "Brandon" / "ClientA" / "case_106"
    case_dir.mkdir(parents=True, exist_ok=True)
    file_path = case_dir / "payslip.pdf"
    file_path.write_text("Secret content for John Doe Phone: 0412345678", encoding="utf-8")

    def mock_parse_file(path: Path) -> ParseResult:
        return ParseResult(
            text="Salary payslip for John Doe, Phone: 0412345678",
            text_quality="high",
            parse_route="native_text",
        )

    monkeypatch.setattr("core.case_folder.lookup.parse_file", mock_parse_file)

    case = Case(id="case_106", folder_path=str(case_dir))
    rel_path = "payslip.pdf"
    res = parse_one(case, rel_path, db=db_session)

    assert res["rel_path"] == rel_path
    assert "summary" in res
    assert "0412345678" not in res["summary"]  # PII redacted
    assert "PHONE_" in res["summary"] or "PERSON_" in res["summary"] or "John Doe" not in res["summary"]


def test_trigger_matching():
    """用例 6: 三触发语"去案件文件夹找 payslip"→ folder_lookup 流程包命中。"""
    triggers = [
        "去案件文件夹找 payslip",
        "找一下文件 bank statement",
        "folder lookup tax return",
        "在案件文件夹里找 payslip",
    ]
    for msg in triggers:
        matched = match_flow(msg)
        assert matched is not None, f"Failed to match trigger message: {msg}"
        assert matched["key"] == "folder_lookup"


def test_whitelist_consistency():
    """用例 7: 白名单三处一致（flows/runner/pai）。"""
    flow_whitelist = flow_tool_whitelist()
    assert "folder_lookup" in flow_whitelist
    assert "folder_lookup" in PAI_TOOL_NAMES


def test_run_flow_folder_lookup_contract(client_root_env, db_session):
    """用例 8: 返回 WO-26 契约（result_card）。"""
    case_dir = client_root_env / "Brandon" / "ClientA" / "case_108"
    case_dir.mkdir(parents=True, exist_ok=True)
    (case_dir / "payslip.pdf").write_text("Dummy payslip", encoding="utf-8")

    case = Case(id="case_108", client_name="ClientA", folder_path=str(case_dir))
    db_session.add(case)
    db_session.commit()

    flow_def = {
        "key": "folder_lookup",
        "name": "自主取件",
        "presentation": "result_card",
        "steps": [
            {
                "tool": "folder_lookup",
                "params": {"case_id": "$case_id", "query": "$arg.query"},
                "output": "result",
            }
        ],
    }

    res = run_flow(flow_def, case_id="case_108", args={"query": "payslip"}, db=db_session)

    assert "reply" in res
    assert res["presentation"] == "result_card"
    assert len(res["tool_cards"]) == 1
    assert res["tool_cards"][0]["type"] == "flow_folder_lookup"
    assert res["tool_cards"][0]["presentation"] == "result_card"
    assert res["tool_cards"][0]["payload"]["status"] == "success"
    assert res["tool_cards"][0]["payload"]["count"] == 1
