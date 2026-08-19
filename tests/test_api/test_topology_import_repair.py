"""WO-62 存量拓扑导入全链路修复测试。

覆盖：
1. 全字段贯通入库（电话/邮箱/雇佣/身份/估值/利率/doc_type/loan_type/onhold_reason/阶段/银行/金额）；
2. 绑定 folder_path 后即刻触发清单文件快速匹配与自动打勾（received + CaseFile 落库 + 进度）；
3. 初始 Brain Facts 沉淀（交易/房产/身份/职业）；
4. config/checklist_master.yaml 标准 UTF-8 编码校验（无 BOM、strict 解码、无替换字符）。

统一使用 tmp_path 构造虚拟案卷目录，严禁访问真实客户目录。
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.models.orm import BrainFact, Case, CaseChecklist, CaseFile
from server.deps import get_db
from server.main import app


@pytest.fixture(autouse=True)
def _force_llm_fail(monkeypatch):
    """强制 LLM 调用失败，确保清单生成走确定性规则/兜底路径。"""

    def _fail(*args, **kwargs):
        raise RuntimeError("no LLM in test")

    monkeypatch.setattr("core.ai.gateway.ApiGateway.call_llm", _fail)


def _client(test_db):
    def _get_db():
        yield test_db

    app.dependency_overrides[get_db] = _get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def _post_import(client, folder, **overrides):
    item = {
        "folder_path": str(folder),
        "client_name": "Yingkun CHEN",
        "lender": "CBA",
        "loan_amount": 650000.0,
        "property_address": "84 Louis St, Granville NSW 2142",
        "stage": "预审准备",
        "is_imported": True,
        "platform_submissions": ["Infynity"],
        "client_phone": "0400 123 456",
        "client_email": "yingkun.chen@example.com",
        "employment_type": "PAYG",
        "residency": "PR",
        "property_value": 900000.0,
        "interest_rate": 6.09,
        "doc_type": "Full Doc",
        "loan_type": "Refinance",
        "onhold_reason": "估价过低阻断，进入复议",
    }
    item.update(overrides)
    return client.post("/api/cases/topology-import/batch", json={"items": [item]})


def _facts_by_key(test_db, case_id):
    rows = (
        test_db.query(BrainFact)
        .filter(BrainFact.case_id == case_id, BrainFact.valid_to.is_(None))
        .all()
    )
    return {f.key: f for f in rows}


def test_topology_import_full_fields_persist(tmp_path, test_db):
    """存量导入全字段贯通：画像字段全部落入 Case 表对应列。"""
    folder = tmp_path / "Yingkun CHEN" / "1. Refinance - CBA - 84 Louis St"
    folder.mkdir(parents=True)

    gen = _client(test_db)
    client = next(gen)
    try:
        r = _post_import(client, folder)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert len(body["created_cases"]) == 1
        assert body["created_cases"][0]["folder_path"] == str(folder)

        case_id = body["created_cases"][0]["case_id"]
        case = test_db.query(Case).filter(Case.id == case_id).first()
        assert case is not None
        assert case.is_imported is True
        assert case.client_name == "Yingkun CHEN"
        assert case.client_phone == "0400 123 456"
        assert case.client_email == "yingkun.chen@example.com"
        assert case.employment_type == "PAYG"
        assert case.residency == "PR"
        assert case.property_value == 900000.0
        assert case.loan_amount == 650000.0
        assert case.interest_rate == "6.09"
        assert case.lender == "CBA"
        assert case.purpose == "Refinance"
        assert case.case_type == "Full Doc"
        assert case.stage == "预审准备"
        assert case.folder_path == str(folder)
        assert case.special_circumstances == "暂停原因：估价过低阻断，进入复议"
    finally:
        next(gen, None)


def test_topology_import_auto_matches_checklist(tmp_path, test_db):
    """绑定 folder_path 后即刻触发清单自动匹配：已存在文件被勾选、CaseFile 落库、进度>0。"""
    folder = tmp_path / "Yingkun CHEN" / "2. Purchase - CBA - 84 Louis St"
    folder.mkdir(parents=True)
    (folder / "ID Passport.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / "ID DL.pdf").write_bytes(b"%PDF-1.4 fake")
    (folder / ".DS_Store").write_bytes(b"junk")

    gen = _client(test_db)
    client = next(gen)
    try:
        r = _post_import(client, folder)
        assert r.status_code == 200
        case_id = r.json()["created_cases"][0]["case_id"]

        checklist = (
            test_db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
        )
        assert checklist, "导入后必须存在预选清单"

        received = [it for it in checklist if it.status == "received"]
        assert received, "绑定 folder_path 后应即刻自动勾选已存在材料"
        for it in received:
            assert it.received_file_id is not None

        files = (
            test_db.query(CaseFile)
            .filter(CaseFile.case_id == case_id)
            .all()
        )
        nas_paths = {f.nas_path for f in files}
        assert (folder / "ID Passport.pdf").as_posix() in nas_paths
        assert all(f.original_name != ".DS_Store" for f in files)

        case = test_db.query(Case).filter(Case.id == case_id).first()
        assert case.gathering_progress > 0
    finally:
        next(gen, None)


def test_topology_import_seeds_brain_facts(tmp_path, test_db):
    """存量导入沉淀初始 Brain Facts：交易/房产/身份/职业/银行/阶段。"""
    folder = tmp_path / "Yingkun CHEN" / "3. Refinance - CBA - 84 Louis St"
    folder.mkdir(parents=True)

    gen = _client(test_db)
    client = next(gen)
    try:
        r = _post_import(client, folder)
        assert r.status_code == 200
        case_id = r.json()["created_cases"][0]["case_id"]

        facts = _facts_by_key(test_db, case_id)
        assert facts.get("identity.full_name").value == "Yingkun CHEN"
        assert facts.get("identity.residency").value == "PR"
        assert facts.get("employment.type").value == "PAYG"
        assert facts.get("property.value").value == "900000.0"
        assert facts.get("property.address").value == "84 Louis St, Granville NSW 2142"
        assert facts.get("loan.amount").value == "650000.0"
        assert facts.get("loan.rate").value == "6.09"
        assert facts.get("loan.type").value == "Refinance"
        assert facts.get("bank.lender").value == "CBA"
        assert facts.get("stage.current").value == "预审准备"
        assert facts.get("special.circumstances").value == "暂停原因：估价过低阻断，进入复议"

        for fact in facts.values():
            assert fact.track == "internal"
            assert fact.event_id is not None
    finally:
        next(gen, None)


def test_checklist_master_yaml_standard_utf8():
    """config/checklist_master.yaml 必须为标准 UTF-8：无 BOM、strict 解码、无替换字符。"""
    path = Path(__file__).resolve().parent.parent.parent / "config" / "checklist_master.yaml"
    raw = path.read_bytes()
    assert raw[:3] != b"\xef\xbb\xbf", "不允许 UTF-8 BOM"
    text = raw.decode("utf-8")  # strict，非法字节会抛 UnicodeDecodeError
    assert "\ufffd" not in text, "不允许替换字符 U+FFFD"