"""WO-44 文件 Agent API 测试：案件文件夹浏览/预览/改名/移动/放入 + 规范命名建议。

覆盖 6 端点 × 13 用例：列表/未关联404/子目录/预览/预览404/改名/改名409/非法名422/移动/移动穿越422/放入/重复放入409/命名建议。
WO-46 追加 raw 原文预览端点用例。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.file_ops import service
from core.models.orm import Case, FileEvent
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


@pytest.fixture(autouse=True)
def _api_env(monkeypatch, tmp_path):
    client_root = tmp_path / "cf"
    client_root.mkdir()
    monkeypatch.setenv("CLIENT_FILES_ROOT", str(client_root))
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-fake-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-key")
    return client_root


@pytest.fixture
def case_env(test_db, _api_env):
    client_root = _api_env
    case_dir = client_root / "张三_CBA_001"
    (case_dir / "_Inbox").mkdir(parents=True)
    (case_dir / "Income Payslip June 2025 CBA.pdf").write_bytes(b"%PDF-1.4 fake")
    (case_dir / "ID Passport.pdf").write_bytes(b"%PDF-1.4 fake")
    case = Case(id="CASE-WO44-001", client_name="张三", broker_name="Brandon",
                stage="收集资料", folder_path="张三_CBA_001")
    test_db.add(case)
    test_db.commit()
    return case


@pytest.fixture
def case_env_unlinked(test_db, _api_env):
    case = Case(id="CASE-WO44-002", client_name="李四", broker_name="Brandon",
                stage="收集资料", folder_path=None)
    test_db.add(case)
    test_db.commit()
    return case


class TestList:
    def test_list_root_dirs_first(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files")
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_path"] == ""
        names = [i["name"] for i in data["items"]]
        assert "_Inbox" in names and "Income Payslip June 2025 CBA.pdf" in names
        assert names.index("_Inbox") == 0
        payslip = next(i for i in data["items"] if i["name"].startswith("Income Payslip"))
        assert payslip["is_dir"] is False and payslip["doc_type"] == "payslip_2"

    def test_list_unlinked_case_404(self, client, case_env_unlinked):
        resp = client.get(f"/api/cases/{case_env_unlinked.id}/folder/files")
        assert resp.status_code == 404
        assert "未关联文件夹" in resp.json()["detail"]

    def test_list_subdir(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files", params={"path": "_Inbox"})
        assert resp.status_code == 200
        assert resp.json()["current_path"] == "_Inbox"


class TestPreview:
    def test_preview_file(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/preview",
                          params={"path": "Income Payslip June 2025 CBA.pdf"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["rel_path"].endswith("Income Payslip June 2025 CBA.pdf")
        assert data["doc_type"] == "payslip_2"

    def test_preview_missing_404(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/preview",
                          params={"path": "nope.pdf"})
        assert resp.status_code == 404
        assert "文件不存在" in resp.json()["detail"]


class TestRename:
    def test_rename_success(self, client, case_env, test_db):
        resp = client.post(f"/api/cases/{case_env.id}/folder/files/rename",
                           json={"source": "ID Passport.pdf", "new_name": "Passport.pdf"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True and data["target"].endswith("Passport.pdf")
        evt = test_db.query(FileEvent).filter(FileEvent.case_id == case_env.id).first()
        assert evt is not None and evt.event_type == "folder_rename" and evt.operator == "vera"

    def test_rename_overwrite_409(self, client, case_env):
        resp = client.post(f"/api/cases/{case_env.id}/folder/files/rename",
                           json={"source": "ID Passport.pdf", "new_name": "Income Payslip June 2025 CBA.pdf"})
        assert resp.status_code == 409

    def test_rename_invalid_name_422(self, client, case_env):
        resp = client.post(f"/api/cases/{case_env.id}/folder/files/rename",
                           json={"source": "ID Passport.pdf", "new_name": "../evil.pdf"})
        assert resp.status_code == 422


class TestMove:
    def test_move_success(self, client, case_env, test_db):
        resp = client.post(f"/api/cases/{case_env.id}/folder/files/move",
                           json={"source": "ID Passport.pdf", "target_dir": "_Inbox"})
        assert resp.status_code == 200
        assert resp.json()["target"].endswith("_Inbox/ID Passport.pdf")
        evt = test_db.query(FileEvent).filter(FileEvent.event_type == "folder_move").first()
        assert evt is not None

    def test_move_traversal_422(self, client, case_env):
        resp = client.post(f"/api/cases/{case_env.id}/folder/files/move",
                           json={"source": "../outside.pdf", "target_dir": ""})
        assert resp.status_code == 422
        assert "穿越" in resp.json()["detail"]


class TestImport:
    def test_import_copies_keeps_original(self, client, case_env, _api_env):
        resp = client.post(f"/api/cases/{case_env.id}/folder/files/import",
                           files={"file": ("Statement.txt", b"hello world", "text/plain")},
                           data={"target_dir": "_Inbox"})
        assert resp.status_code == 200
        assert resp.json()["target"].endswith("_Inbox/Statement.txt")
        target = _api_env / "张三_CBA_001" / "_Inbox" / "Statement.txt"
        assert target.read_bytes() == b"hello world"

    def test_import_duplicate_409(self, client, case_env):
        payload = {"file": ("dup.txt", b"x", "text/plain")}
        first = client.post(f"/api/cases/{case_env.id}/folder/files/import", files=payload)
        assert first.status_code == 200
        second = client.post(f"/api/cases/{case_env.id}/folder/files/import", files=payload)
        assert second.status_code == 409


class TestNamingSuggest:
    def test_naming_suggest(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/naming-suggest",
                          params={"filename": "Income Payslip June 2025 CBA.pdf"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["matched"] is True and data["template_key"] == "Payslip"
        assert data["suggested"].startswith("Income Payslip")
        resp2 = client.get(f"/api/cases/{case_env.id}/folder/naming-suggest",
                           params={"filename": "Unknown Thing.txt"})
        data2 = resp2.json()
        assert data2["matched"] is False and data2["suggested"] == "Unknown Thing.txt"


class TestRaw:
    def test_raw_pdf(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "Income Payslip June 2025 CBA.pdf"})
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/pdf")
        assert "inline" in resp.headers["content-disposition"]
        assert "Income Payslip June 2025 CBA.pdf" in resp.headers["content-disposition"]
        assert resp.content == b"%PDF-1.4 fake"

    def test_raw_png_media_type(self, client, case_env, _api_env):
        case_dir = _api_env / "张三_CBA_001"
        (case_dir / "Photo.png").write_bytes(b"\x89PNG\r\n\x1a\n fake-png")
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "Photo.png"})
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/png")
        assert "Photo.png" in resp.headers["content-disposition"]
        assert resp.content == b"\x89PNG\r\n\x1a\n fake-png"

    def test_raw_txt_content_identical(self, client, case_env, _api_env):
        case_dir = _api_env / "张三_CBA_001"
        (case_dir / "note.txt").write_bytes("hello 原文内容 2026".encode())
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "note.txt"})
        assert resp.status_code == 200
        assert resp.content == "hello 原文内容 2026".encode()

    def test_raw_traversal_422(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "../outside.txt"})
        assert resp.status_code == 422
        assert "穿越" in resp.json()["detail"]

    def test_raw_out_of_bounds_422(self, client, case_env, _api_env):
        outside = _api_env / "other"
        outside.mkdir()
        (outside / "x.txt").write_bytes(b"x")
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": str(outside / "x.txt")})
        assert resp.status_code == 422
        assert "越界" in resp.json()["detail"]

    def test_raw_missing_404(self, client, case_env):
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "nope.pdf"})
        assert resp.status_code == 404
        assert "文件不存在" in resp.json()["detail"]

    def test_raw_unlinked_case_404(self, client, case_env_unlinked):
        resp = client.get(f"/api/cases/{case_env_unlinked.id}/folder/files/raw",
                          params={"path": "a.pdf"})
        assert resp.status_code == 404
        assert "未关联文件夹" in resp.json()["detail"]

    def test_raw_too_large_413(self, client, case_env, _api_env, monkeypatch):
        case_dir = _api_env / "张三_CBA_001"
        (case_dir / "big.csv").write_bytes(b"1,2,3\n" * 5)
        monkeypatch.setattr(service, "_RAW_MAX_BYTES", 1)
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "big.csv"})
        assert resp.status_code == 413
        assert "文件过大" in resp.json()["detail"]

    def test_raw_unsupported_extension_422(self, client, case_env, _api_env):
        case_dir = _api_env / "张三_CBA_001"
        (case_dir / "evil.exe").write_bytes(b"MZ")
        (case_dir / "doc.docx").write_bytes(b"PK")
        for name in ("evil.exe", "doc.docx"):
            resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                              params={"path": name})
            assert resp.status_code == 422
            assert "不支持在线原文预览" in resp.json()["detail"]

    def test_raw_cross_case_404(self, client, case_env, _api_env, test_db):
        other_dir = _api_env / "李四_NAB_002"
        other_dir.mkdir()
        (other_dir / "Other Bank Statement.pdf").write_bytes(b"%PDF-1.4 other")
        other = Case(id="CASE-WO46-OTHER", client_name="李四", broker_name="Brandon",
                     stage="收集资料", folder_path="李四_NAB_002")
        test_db.add(other)
        test_db.commit()
        resp = client.get(f"/api/cases/{case_env.id}/folder/files/raw",
                          params={"path": "Other Bank Statement.pdf"})
        assert resp.status_code == 404
        assert "文件不存在" in resp.json()["detail"]
