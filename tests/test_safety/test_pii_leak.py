"""Red-line tests for PiiLeakDetector — PII detection before cloud API calls.

These tests verify that all Australian-specific PII patterns are detected
before text is sent to cloud AI APIs. If any test fails, the system may
leak PII to external services.

Test data uses **synthetic values** — no real client PII is used.
Valid TFN/ABN test numbers are computed to pass checksum validation.
"""

from __future__ import annotations

import pytest

from core.pii.leak_detector import (
    PiiLeakDetector,
    PiiLeakError,
    PiiType,
)

# ---------------------------------------------------------------------------
# Test data (synthetic, not real client PII)
# ---------------------------------------------------------------------------

# TFN: 123456782 — checksum: 1*1+2*4+3*3+4*7+5*5+6*8+7*6+8*9+2*10 = 253
# 253 % 11 == 0 → valid
VALID_TFN_FORMATTED = "123 456 782"
VALID_TFN_RAW = "123456782"

# TFN: 123456780 — checksum: 1*1+2*4+3*3+4*7+5*5+6*8+7*6+8*9+0*10 = 233
# 233 % 11 == 2 → invalid
INVALID_TFN = "123 456 780"

# ABN: 51824753556 — checksum: (5-1)*10+1*1+8*3+2*5+4*7+7*9+5*11+3*13+5*15+5*17+6*19
# = 40+1+24+10+28+63+55+39+75+85+114 = 534, 534 % 89 == 0 → valid
VALID_ABN_FORMATTED = "51 824 753 556"
VALID_ABN_RAW = "51824753556"

# ABN: 11111111111 — checksum: (1-1)*10+1*1+1*3+1*5+1*7+1*9+1*11+1*13+1*15+1*17+1*19
# = 0+1+3+5+7+9+11+13+15+17+19 = 100, 100 % 89 == 11 → invalid
INVALID_ABN = "11 111 111 111"


# ---------------------------------------------------------------------------
# Mobile phone detection
# ---------------------------------------------------------------------------


class TestMobileDetection:
    """Verify Australian mobile numbers are detected."""

    @pytest.mark.safety
    @pytest.mark.parametrize(
        "text",
        [
            "Call me on 0412 345 678",
            "Call me on 0412345678",
            "Call me on 0412-345-678",
            "My number is +61 412 345 678",
            "My number is +61412345678",
        ],
    )
    def test_mobile_detected(self, text: str) -> None:
        """Mobile numbers in various formats must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan(text)
        assert any(m.type == PiiType.MOBILE for m in matches), (
            f"Mobile not detected in: {text}"
        )

    @pytest.mark.safety
    def test_mobile_assert_clean_raises(self) -> None:
        """assert_clean must raise PiiLeakError for mobile numbers."""
        detector = PiiLeakDetector()
        with pytest.raises(PiiLeakError, match="mobile"):
            detector.assert_clean("Phone: 0433 555 123")


# ---------------------------------------------------------------------------
# Landline phone detection
# ---------------------------------------------------------------------------


class TestLandlineDetection:
    """Verify Australian landline numbers are detected."""

    @pytest.mark.safety
    @pytest.mark.parametrize(
        "text",
        [
            "Office: 02 9876 5432",
            "Office: 0298765432",
            "Office: 02-9876-5432",
            "Fax: +61 2 9876 5432",
            "Fax: +61298765432",
        ],
    )
    def test_landline_detected(self, text: str) -> None:
        """Landline numbers in various formats must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan(text)
        assert any(m.type == PiiType.LANDLINE for m in matches), (
            f"Landline not detected in: {text}"
        )


# ---------------------------------------------------------------------------
# Email detection
# ---------------------------------------------------------------------------


class TestEmailDetection:
    """Verify email addresses are detected."""

    @pytest.mark.safety
    def test_email_detected(self) -> None:
        """Email addresses must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan("Contact: vera@example.com.au")
        assert any(m.type == PiiType.EMAIL for m in matches)

    @pytest.mark.safety
    def test_email_assert_clean_raises(self) -> None:
        """assert_clean must raise PiiLeakError for emails."""
        detector = PiiLeakDetector()
        with pytest.raises(PiiLeakError, match="email"):
            detector.assert_clean("Send to test.user@domain.com please")


# ---------------------------------------------------------------------------
# TFN detection
# ---------------------------------------------------------------------------


class TestTfnDetection:
    """Verify TFN detection with checksum validation."""

    @pytest.mark.safety
    def test_valid_tfn_formatted_detected(self) -> None:
        """Valid TFN with spaces must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan(f"TFN: {VALID_TFN_FORMATTED}")
        assert any(m.type == PiiType.TFN for m in matches)

    @pytest.mark.safety
    def test_valid_tfn_raw_detected(self) -> None:
        """Valid TFN without spaces must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan(f"TFN: {VALID_TFN_RAW}")
        assert any(m.type == PiiType.TFN for m in matches)

    @pytest.mark.safety
    def test_invalid_tfn_not_detected(self) -> None:
        """Invalid TFN (failed checksum) must NOT be flagged."""
        detector = PiiLeakDetector()
        matches = detector.scan(f"Number: {INVALID_TFN}")
        assert not any(m.type == PiiType.TFN for m in matches), (
            f"Invalid TFN {INVALID_TFN} should not be detected"
        )


# ---------------------------------------------------------------------------
# ABN detection
# ---------------------------------------------------------------------------


class TestAbnDetection:
    """Verify ABN detection with checksum validation."""

    @pytest.mark.safety
    def test_valid_abn_formatted_detected(self) -> None:
        """Valid ABN with spaces must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan(f"ABN: {VALID_ABN_FORMATTED}")
        assert any(m.type == PiiType.ABN for m in matches)

    @pytest.mark.safety
    def test_valid_abn_raw_detected(self) -> None:
        """Valid ABN without spaces must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan(f"ABN: {VALID_ABN_RAW}")
        assert any(m.type == PiiType.ABN for m in matches)

    @pytest.mark.safety
    def test_invalid_abn_not_detected(self) -> None:
        """Invalid ABN (failed checksum) must NOT be flagged."""
        detector = PiiLeakDetector()
        matches = detector.scan(f"Number: {INVALID_ABN}")
        assert not any(m.type == PiiType.ABN for m in matches), (
            f"Invalid ABN {INVALID_ABN} should not be detected"
        )


# ---------------------------------------------------------------------------
# BSB detection
# ---------------------------------------------------------------------------


class TestBsbDetection:
    """Verify BSB (Bank-State-Branch) detection."""

    @pytest.mark.safety
    def test_bsb_detected(self) -> None:
        """BSB in xxx-xxx format must be detected."""
        detector = PiiLeakDetector()
        matches = detector.scan("BSB: 062-001")
        assert any(m.type == PiiType.BSB for m in matches)


# ---------------------------------------------------------------------------
# MRZ detection
# ---------------------------------------------------------------------------


class TestMrzDetection:
    """Verify passport MRZ (Machine Readable Zone) detection."""

    @pytest.mark.safety
    def test_mrz_detected(self) -> None:
        """Passport MRZ line starting with P< must be detected."""
        detector = PiiLeakDetector()
        mrz_line = "P<AUSCHEN<<YINGKUN<<<<<<<<<<<<<<<<<<<<<<<"
        matches = detector.scan(mrz_line)
        assert any(m.type == PiiType.MRZ for m in matches)

    @pytest.mark.safety
    def test_mrz_assert_clean_raises(self) -> None:
        """assert_clean must raise PiiLeakError for MRZ."""
        detector = PiiLeakDetector()
        with pytest.raises(PiiLeakError, match="mrz"):
            detector.assert_clean("P<AUSCHEN<<YINGKUN<<<<<<<<<<<<<<<<<<<<<<<")


# ---------------------------------------------------------------------------
# Client name detection
# ---------------------------------------------------------------------------


class TestClientNameDetection:
    """Verify client name detection."""

    @pytest.mark.safety
    def test_full_name_detected(self) -> None:
        """Full client name must be detected."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        matches = detector.scan("Applicant: Yingkun CHEN")
        assert any(m.type == PiiType.NAME for m in matches)

    @pytest.mark.safety
    def test_given_name_detected(self) -> None:
        """Individual name parts must be detected."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        matches = detector.scan("The applicant Yingkun submitted documents")
        assert any(m.type == PiiType.NAME for m in matches)

    @pytest.mark.safety
    def test_surname_detected(self) -> None:
        """Surname must be detected."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        matches = detector.scan("Mr CHEN signed the form")
        assert any(m.type == PiiType.NAME for m in matches)

    @pytest.mark.safety
    def test_name_case_insensitive(self) -> None:
        """Name matching must be case-insensitive."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        matches = detector.scan("contact yingkun chen for details")
        assert any(m.type == PiiType.NAME for m in matches)

    @pytest.mark.safety
    def test_short_name_no_false_positive_in_word(self) -> None:
        """Short name parts must not match inside longer words (W1 fix)."""
        detector = PiiLeakDetector(client_names=["Li Chen"])
        # "Li" should NOT match inside "Liability"
        matches = detector.scan("Total Liability: $500,000")
        name_matches = [m for m in matches if m.type == PiiType.NAME]
        assert len(name_matches) == 0, (
            f"False positive: 'Li' matched inside 'Liability': {name_matches}"
        )

    @pytest.mark.safety
    def test_short_name_detected_as_standalone_word(self) -> None:
        """Short name parts must still be detected as standalone words."""
        detector = PiiLeakDetector(client_names=["Li Chen"])
        # "Li" as a standalone word should be detected
        matches = detector.scan("The applicant Li signed the form")
        name_matches = [m for m in matches if m.type == PiiType.NAME]
        assert len(name_matches) >= 1


# ---------------------------------------------------------------------------
# Desensitized text — no PII should remain
# ---------------------------------------------------------------------------


class TestDesensitizedText:
    """Verify that properly desensitized text has no PII."""

    @pytest.mark.safety
    def test_desensitized_text_passes(self) -> None:
        """Text with PII replaced by placeholders must pass assert_clean."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        clean_text = (
            "Dear [NAME_1], your loan of $500,000 has been approved. "
            "Contact us at [PHONE_1] or [EMAIL_1]. "
            "TFN: [TFN_1], ABN: [ABN_1]."
        )
        detector.assert_clean(clean_text)  # should not raise

    @pytest.mark.safety
    def test_placeholder_text_no_pii(self) -> None:
        """Text with only placeholders must have no PII matches."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        text = "[NAME_1] [PHONE_1] [EMAIL_1] [TFN_1] [ABN_1] [ADDRESS_1]"
        assert not detector.has_pii(text)

    @pytest.mark.safety
    def test_amounts_and_dates_not_pii(self) -> None:
        """Dollar amounts and dates must NOT be flagged as PII."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        text = (
            "Loan amount: $500,000.00\n"
            "Interest rate: 5.89%\n"
            "Settlement date: 2026-08-15\n"
            "Quarter: Q3 2026\n"
            "Bank: Commonwealth Bank"
        )
        assert not detector.has_pii(text)


# ---------------------------------------------------------------------------
# assert_clean and has_pii
# ---------------------------------------------------------------------------


class TestAssertClean:
    """Verify assert_clean and has_pii behavior."""

    @pytest.mark.safety
    def test_assert_clean_passes_for_clean_text(self) -> None:
        """assert_clean must not raise for clean text."""
        detector = PiiLeakDetector()
        detector.assert_clean("This is a clean text with no PII.")

    @pytest.mark.safety
    def test_assert_clean_raises_for_pii(self) -> None:
        """assert_clean must raise PiiLeakError when PII is found."""
        detector = PiiLeakDetector()
        with pytest.raises(PiiLeakError) as exc_info:
            detector.assert_clean("Call 0412 345 678 now")
        assert len(exc_info.value.matches) > 0

    @pytest.mark.safety
    def test_has_pii_true(self) -> None:
        """has_pii returns True when PII is present."""
        detector = PiiLeakDetector()
        assert detector.has_pii("Email: test@example.com")

    @pytest.mark.safety
    def test_has_pii_false(self) -> None:
        """has_pii returns False when no PII is present."""
        detector = PiiLeakDetector(client_names=["Test Client"])
        assert not detector.has_pii("The loan amount is $500,000.")

    @pytest.mark.safety
    def test_multiple_pii_detected(self) -> None:
        """Multiple PII types in one text must all be detected."""
        detector = PiiLeakDetector(client_names=["Yingkun CHEN"])
        text = (
            f"Name: Yingkun CHEN, Phone: 0412 345 678, "
            f"Email: y@example.com, TFN: {VALID_TFN_FORMATTED}"
        )
        matches = detector.scan(text)
        types_found = {m.type for m in matches}
        assert PiiType.NAME in types_found
        assert PiiType.MOBILE in types_found
        assert PiiType.EMAIL in types_found
        assert PiiType.TFN in types_found


# ---------------------------------------------------------------------------
# Match position accuracy
# ---------------------------------------------------------------------------


class TestMatchPositions:
    """Verify that match positions are accurate."""

    @pytest.mark.safety
    def test_email_position(self) -> None:
        """Match start/end positions must be correct."""
        detector = PiiLeakDetector()
        text = "Contact: test@example.com please"
        matches = detector.scan(text)
        email_match = next(m for m in matches if m.type == PiiType.EMAIL)
        assert text[email_match.start : email_match.end] == "test@example.com"
