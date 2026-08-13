"""tests/test_core/test_folder_discovery.py — 新文件自动发现（WO-31）"""

from pathlib import Path

import pytest

import core.config
from core.case_folder.discovery import revoke_folder_file_match, scan_case_folders
from core.checklist.reverse_match import _load_master
from core.events.sse import sse_manager
from core.models.orm import Case, CaseChecklist, CaseFile


def _payslip_master_id() -> str:
    for it in _load_master():
        aliases = [str(a).lower() for a in (it.get("aliases") or [])]
        if any("payslip" in a for a in aliases):
            return str(it["id"])
    raise AssertionError("master 清单缺少 payslip 项")


@pytest.fixture(autouse=True)
def _disc_env(monkeypatch, tmp_path):
    cf = tmp_path / "cf"
    cf.mkdir(exist_ok=True)
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(cf))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    core.config._cached_config = None


def _enable_discovery() -> None:
    core.config.get_config().settings.case_folder.auto_discover.enabled = True


def _make_case(db, cid: str, with_folder: bool = True) -> Case:
    case = Case(id=cid, client_name=f"Case {cid}", broker_name="Brandon")
    if with_folder:
        case.folder_path = f"Brandon/Client/{cid}"
        (Path(core.config.get_config().client_files_root) / case.folder_path).mkdir(parents=True, exist_ok=True)
    db.add(case)
    mid = _payslip_master_id()
    db.add(CaseChecklist(case_id=cid, item_name="Payslip", category="income",
                         is_required=True, status="pending", master_id=mid))
    db.commit()
    return case


def test_scan_discovers_new_file(test_db):
    _enable_discovery()
    _make_case(test_db, "c_disc")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_disc/Payslip_Jul.pdf").write_text("x", encoding="utf-8")
    events = scan_case_folders(test_db)
    assert len(events) == 1
    assert events[0]["original_name"] == "Payslip_Jul.pdf"
    assert events[0]["doc_type"] == _payslip_master_id()
    assert events[0]["confidence"] >= 0.9
    row = test_db.query(CaseFile).filter(CaseFile.case_id == "c_disc").first()
    assert row is not None and row.status == "discovered"


def test_dedup_no_repeat(test_db):
    _enable_discovery()
    _make_case(test_db, "c_dedup")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_dedup/Payslip_Jul.pdf").write_text("x", encoding="utf-8")
    assert len(scan_case_folders(test_db)) == 1
    assert scan_case_folders(test_db) == []


def test_high_confidence_auto_match(test_db):
    _enable_discovery()
    _make_case(test_db, "c_match")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_match/Payslip_Jul.pdf").write_text("x", encoding="utf-8")
    events = scan_case_folders(test_db)
    assert len(events[0]["matched"]) == 1
    item = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "c_match").first()
    assert item.status == "received"
    assert item.received_file_ids == [events[0]["file_id"]]


def test_low_confidence_no_auto_match(test_db):
    _enable_discovery()
    _make_case(test_db, "c_low")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_low/random_notes_2026.pdf").write_text("x", encoding="utf-8")
    events = scan_case_folders(test_db)
    assert events[0]["doc_type"] is None
    assert events[0]["matched"] == []
    item = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "c_low").first()
    assert item.status == "pending"


def test_revoke_restores(test_db):
    _enable_discovery()
    _make_case(test_db, "c_rev")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_rev/Payslip_Jul.pdf").write_text("x", encoding="utf-8")
    events = scan_case_folders(test_db)
    file_id = events[0]["file_id"]
    assert revoke_folder_file_match(test_db, "c_rev", file_id) == 1
    item = test_db.query(CaseChecklist).filter(CaseChecklist.case_id == "c_rev").first()
    assert item.status == "pending"
    assert item.received_file_ids == []


def test_case_without_folder_skipped(test_db):
    _enable_discovery()
    _make_case(test_db, "c_nof", with_folder=False)
    assert scan_case_folders(test_db) == []


def test_disabled_no_scan(test_db):
    _make_case(test_db, "c_off")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_off/Payslip_Jul.pdf").write_text("x", encoding="utf-8")
    assert scan_case_folders(test_db) == []


def test_sse_published(test_db, monkeypatch):
    _enable_discovery()
    _make_case(test_db, "c_sse")
    root = core.config.get_config().client_files_root
    (root / "Brandon/Client/c_sse/Payslip_Jul.pdf").write_text("x", encoding="utf-8")
    captured: list[tuple] = []
    monkeypatch.setattr(sse_manager, "publish", lambda event_type, data: captured.append((event_type, data)))
    scan_case_folders(test_db)
    assert captured and captured[0][0] == "file_discovered"
    assert captured[0][1]["original_name"] == "Payslip_Jul.pdf"