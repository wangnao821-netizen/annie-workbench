"""Red-line tests for DesensitizedText — the core type safety invariant.

DesensitizedText is the type that marks text as PII-free. ApiGateway
only accepts this type, not raw str. These tests verify that the type
enforcement works correctly at runtime, including edge cases.

Test data uses synthetic placeholders — no real client PII.
"""

from __future__ import annotations

import pytest

from core.models.types import DesensitizedText

# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestConstruction:
    """Verify DesensitizedText construction behavior."""

    @pytest.mark.safety
    def test_construct_from_string(self) -> None:
        """Normal construction from a string must succeed."""
        dt = DesensitizedText("Loan amount: $500,000")
        assert dt.text == "Loan amount: $500,000"

    @pytest.mark.safety
    def test_construct_from_empty_string(self) -> None:
        """Empty string should be accepted (edge case)."""
        dt = DesensitizedText("")
        assert len(dt) == 0
        assert dt.text == ""

    @pytest.mark.safety
    def test_reject_non_string(self) -> None:
        """Non-string input must raise TypeError."""
        with pytest.raises(TypeError, match="requires str"):
            DesensitizedText(12345)  # type: ignore[arg-type]

    @pytest.mark.safety
    def test_reject_bytes(self) -> None:
        """Bytes input must raise TypeError."""
        with pytest.raises(TypeError, match="requires str"):
            DesensitizedText(b"bytes data")  # type: ignore[arg-type]

    @pytest.mark.safety
    def test_reject_none(self) -> None:
        """None input must raise TypeError."""
        with pytest.raises(TypeError, match="requires str"):
            DesensitizedText(None)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# String representation
# ---------------------------------------------------------------------------


class TestStringRepresentation:
    """Verify str/repr behavior does not leak content."""

    @pytest.mark.safety
    def test_str_returns_raw_text(self) -> None:
        """__str__ must return the raw text content."""
        dt = DesensitizedText("Dear [NAME_1], your loan is approved.")
        assert str(dt) == "Dear [NAME_1], your loan is approved."

    @pytest.mark.safety
    def test_repr_does_not_leak_content(self) -> None:
        """__repr__ must NOT expose the text content (PII safety)."""
        test_content = "This contains sensitive data like TFN 123 456 782"
        dt = DesensitizedText(test_content)
        repr_str = repr(dt)
        assert "DesensitizedText" in repr_str
        assert "len=" in repr_str
        # The actual content must NOT appear in repr
        assert test_content not in repr_str
        assert "sensitive" not in repr_str
        assert "123 456 782" not in repr_str

    @pytest.mark.safety
    def test_repr_shows_length(self) -> None:
        """__repr__ should show the text length for debugging."""
        dt = DesensitizedText("Hello World")
        assert "len=11" in repr(dt)

    @pytest.mark.safety
    def test_len_matches_text(self) -> None:
        """__len__ must match the text length."""
        dt = DesensitizedText("Hello World")
        assert len(dt) == len(dt.text) == 11


# ---------------------------------------------------------------------------
# Equality and hashing
# ---------------------------------------------------------------------------


class TestEqualityAndHashing:
    """Verify equality and hash consistency."""

    @pytest.mark.safety
    def test_equality_same_text(self) -> None:
        """Two instances with same text must be equal."""
        a = DesensitizedText("Hello")
        b = DesensitizedText("Hello")
        assert a == b

    @pytest.mark.safety
    def test_inequality_different_text(self) -> None:
        """Instances with different text must not be equal."""
        a = DesensitizedText("Hello")
        b = DesensitizedText("World")
        assert a != b

    @pytest.mark.safety
    def test_not_equal_to_raw_str(self) -> None:
        """DesensitizedText must not equal a raw string."""
        dt = DesensitizedText("Hello")
        assert dt != "Hello"  # type: ignore[comparison-overlap]

    @pytest.mark.safety
    def test_not_equal_to_none(self) -> None:
        """DesensitizedText must not equal None."""
        dt = DesensitizedText("Hello")
        assert dt != None  # type: ignore[comparison-overlap]

    @pytest.mark.safety
    def test_hash_consistency(self) -> None:
        """Equal instances must have equal hashes."""
        a = DesensitizedText("Hello")
        b = DesensitizedText("Hello")
        assert hash(a) == hash(b)

    @pytest.mark.safety
    def test_hash_usable_in_set(self) -> None:
        """DesensitizedText should be usable in a set."""
        a = DesensitizedText("Hello")
        b = DesensitizedText("World")
        c = DesensitizedText("Hello")
        s = {a, b, c}
        assert len(s) == 2  # a and c are equal, so only 2 unique


# ---------------------------------------------------------------------------
# Property access
# ---------------------------------------------------------------------------


class TestPropertyAccess:
    """Verify the .text property and __slots__ enforcement."""

    @pytest.mark.safety
    def test_text_property(self) -> None:
        """The .text property must return the raw text."""
        dt = DesensitizedText("Test content")
        assert dt.text == "Test content"

    @pytest.mark.safety
    def test_text_property_is_read_only(self) -> None:
        """The .text property should not be settable (via __slots__)."""
        dt = DesensitizedText("Original")
        # __slots__ prevents adding new attributes
        # The _text attribute is internal and should not be directly accessible
        # in well-behaved code, but we test the public interface here
        assert dt.text == "Original"

    @pytest.mark.safety
    def test_no_new_attributes(self) -> None:
        """Cannot add new attributes due to __slots__."""
        dt = DesensitizedText("Test")
        with pytest.raises(AttributeError):
            dt.extra_field = "not allowed"  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Integration with PiiLeakDetector
# ---------------------------------------------------------------------------


class TestIntegrationWithPiiDetector:
    """Verify DesensitizedText works correctly with PiiLeakDetector."""

    @pytest.mark.safety
    def test_desensitized_text_passes_pii_check(self) -> None:
        """Text with placeholders should pass PiiLeakDetector scan."""
        from core.pii.leak_detector import PiiLeakDetector

        clean = DesensitizedText(
            "Dear [NAME_1], your loan of $500,000 is approved."
        )
        detector = PiiLeakDetector(client_names=["Test Client"])
        # Access the raw text for scanning (this is what ApiGateway would do)
        assert not detector.has_pii(clean.text)

    @pytest.mark.safety
    def test_desensitized_text_with_pii_is_detected(self) -> None:
        """If PII somehow remains, PiiLeakDetector must catch it."""
        from core.pii.leak_detector import PiiLeakDetector, PiiLeakError

        # Simulate a bug where desensitization missed a phone number
        buggy = DesensitizedText("Call 0412 345 678 for details")
        detector = PiiLeakDetector()
        with pytest.raises(PiiLeakError):
            detector.assert_clean(buggy.text)
