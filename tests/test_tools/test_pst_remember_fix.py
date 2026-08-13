"""WO-23：PST 导入 remember 接线修复 — 防止 F821 回退。"""

from __future__ import annotations

import inspect
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class TestPstRememberFix:
    def test_remember_export_exists(self) -> None:
        from core.knowledge.memory import remember

        sig = inspect.signature(remember)
        param_names = list(sig.parameters)
        assert "case_id" in param_names
        assert "content" in param_names
        assert "db" in param_names

    def test_import_pst_uses_correct_import(self) -> None:
        source = (PROJECT_ROOT / "tools" / "import_pst.py").read_text(encoding="utf-8")
        assert "from core.knowledge.memory import remember" in source
        assert "from core.memory import" not in source