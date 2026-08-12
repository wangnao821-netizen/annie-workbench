"""PII 脱敏/还原测试 — 钉住修复后的行为基线。

覆盖：
1. desensitize 产生稳定 token（同案件内同值 → 同 token）
2. rehydrate 正确还原
3. 金额不脱敏（AGENTS.md §五 红线）
4. 银行名不脱敏
5. PiiManager shim 的 redact_text 正确替换
6. 空值 / 边界情况
"""

import pytest
from core.pii.gateway import (
    PiiManager,
    _PII_DETECTORS,
    desensitize,
    rehydrate,
)


class TestDesensitize:
    """desensitize(text, case_id, db) 行为测试。"""

    def test_phone_replaced(self, test_db):
        """澳洲手机号被替换为 PHONE_N token。"""
        result = desensitize("Call 0412345678 now", "case_1", test_db)
        assert "0412345678" not in result
        assert "PHONE_" in result

    def test_email_replaced(self, test_db):
        """邮箱被替换为 EMAIL_N token。"""
        result = desensitize("Send to john@test.com", "case_1", test_db)
        assert "john@test.com" not in result
        assert "EMAIL_" in result

    def test_amount_not_desensitized(self, test_db):
        """金额不脱敏 — AGENTS.md §五 明确要求。"""
        result = desensitize("Loan of $850,000 approved", "case_1", test_db)
        assert "$850,000" in result, f"Amount was desensitized! Got: {result}"

    def test_lender_not_desensitized(self, test_db):
        """银行/机构名不脱敏。"""
        result = desensitize("CBA approved Westpac declined", "case_1", test_db)
        assert "CBA" in result
        assert "Westpac" in result

    def test_stable_tokens(self, test_db):
        """同一案件内同一真实值 → 始终映射同一 token。"""
        text1 = desensitize("Call 0412345678", "case_1", test_db)
        text2 = desensitize("Ring 0412345678", "case_1", test_db)
        # 提取 token
        import re
        tokens1 = re.findall(r"PHONE_\d+", text1)
        tokens2 = re.findall(r"PHONE_\d+", text2)
        assert len(tokens1) == 1
        assert len(tokens2) == 1
        assert tokens1[0] == tokens2[0], "Same phone should map to same token"

    def test_empty_text(self, test_db):
        """空文本不报错。"""
        assert desensitize("", "case_1", test_db) == ""
        assert desensitize("   ", "case_1", test_db) == "   "


class TestRehydrate:
    """rehydrate(text, case_id, db) 行为测试。"""

    def test_roundtrip(self, test_db):
        """desensitize → rehydrate 完整往返。"""
        original = "Contact 0412345678 for details"
        desensitized = desensitize(original, "case_rt", test_db)
        rehydrated = rehydrate(desensitized, "case_rt", test_db)
        assert "0412345678" in rehydrated

    def test_no_tokens_passthrough(self, test_db):
        """没有 token 的文本原样返回。"""
        text = "Hello world"
        assert rehydrate(text, "case_none", test_db) == text


class TestAmountNotInDetectors:
    """确认 amount 已从检测器列表中移除。"""

    def test_detector_types_exclude_amount(self):
        """_PII_DETECTORS 不包含 amount 类型。"""
        types = [d[0] for d in _PII_DETECTORS]
        assert "amount" not in types, (
            f"amount still in _PII_DETECTORS! Types: {types}"
        )


class TestPiiManagerShim:
    """PiiManager 兼容桥测试。"""

    def test_redact_phone(self):
        """手机号被替换为 [PHONE]。"""
        pm = PiiManager()
        result = pm.redact_text("Call 0412345678")
        assert "[PHONE]" in result
        assert "0412345678" not in result

    def test_redact_email(self):
        """邮箱被替换为 [EMAIL]。"""
        pm = PiiManager()
        result = pm.redact_text("Send to john@test.com")
        assert "[EMAIL]" in result

    def test_amount_preserved(self):
        """金额在 shim 中也不脱敏。"""
        pm = PiiManager()
        # Use chr(36) to avoid PowerShell interpolation in test output
        text = f"Loan {chr(36)}850,000"
        result = pm.redact_text(text)
        assert f"{chr(36)}850,000" in result

    def test_empty_text(self):
        """空文本不报错。"""
        pm = PiiManager()
        assert pm.redact_text("") == ""
        assert pm.redact_text(None) is None
