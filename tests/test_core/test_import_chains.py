"""冒烟测试 — 验证关键模块的 import 链路完整（NameError 防回归）。

覆盖：
1. matching.py: detect_urgency, is_muted, extract_lead_from_email, create_inbox_action, record_event
2. watcher.py: is_email_file, PathGuard, FileState
3. processing_center.py: classify_and_extract, extract_business_fields
4. drafts/generator.py: assemble_context
5. escalation/service.py: CaseEventBus, CaseEvent, assemble_context
6. state_machine.py: needs_conversion, convert_to_preview_pdf
7. onboarding.py: generate_or_match_client_id, archive imports
"""

import importlib
import sys

import pytest


# 每个 tuple: (module_path, expected_symbol_or_subimport)
IMPORT_CHAINS = [
    # matching.py 内的 lazy import
    ("core.inbox.urgency", "detect_urgency"),
    ("core.inbox.mute", "is_muted"),
    ("core.inbox.extractor", "extract_lead_from_email"),
    ("core.inbox.action_factory", "create_inbox_action"),
    ("core.events.timeline", "record_event"),
    # watcher.py
    ("core.pipeline.email_parser", "is_email_file"),
    ("core.security.path_guard", "PathGuard"),
    ("core.pipeline.state", "FileState"),
    # processing_center.py
    ("core.pipeline.classifier", "classify_and_extract"),
    ("core.pipeline.classifier", "ClassificationResult"),
    ("core.pipeline.extractor", "extract_business_fields"),
    # drafts + escalation
    ("core.ai.context_builder", "assemble_context"),
    ("core.ai.context_builder", "prefill_case_brain_from_text"),
    ("core.events.bus", "CaseEventBus"),
    ("core.events.bus", "CaseEvent"),
    # state_machine
    ("core.pipeline.preview", "needs_conversion"),
    ("core.pipeline.preview", "convert_to_preview_pdf"),
    # onboarding
    ("core.case_creation", "generate_or_match_client_id"),
    ("core.pipeline.archive", "generate_suggested_name"),
    ("core.pipeline.archive", "get_target_directory"),
]


class TestImportChains:
    """验证所有修复的 import 链路不会 NameError。"""

    @pytest.mark.parametrize("module_path,symbol", IMPORT_CHAINS)
    def test_symbol_importable(self, module_path: str, symbol: str):
        """每个 symbol 都能成功 import。"""
        mod = importlib.import_module(module_path)
        assert hasattr(mod, symbol), (
            f"{module_path}.{symbol} not found! "
            f"Available: {[s for s in dir(mod) if not s.startswith('_')]}"
        )


class TestModuleLoadClean:
    """验证大模块自身能干净加载（无 ImportError）。"""

    MODULES = [
        "core.pipeline.watcher",
        "core.inbox.matching",
        "core.drafts.generator",
        "core.escalation.service",
        "core.pipeline.processing_center",
        "core.pipeline.state_machine",
        "core.case_creation",
        "core.pipeline.onboarding",
    ]

    @pytest.mark.parametrize("module_path", MODULES)
    def test_module_loads(self, module_path: str):
        """模块加载不抛 ImportError。"""
        mod = importlib.import_module(module_path)
        assert mod is not None
