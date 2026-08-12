"""Core type definitions for loan-assistant.

This module defines type constraints that enforce safety invariants
at both compile time (mypy) and runtime:

- ``DesensitizedText``: Marks text as PII-free. ``ApiGateway`` only accepts
  this type, not raw ``str``, ensuring no PII leaks to cloud APIs.

The type system creates a "taint" flow: raw text goes through the PII
desensitization pipeline (Phase 1C), which outputs ``DesensitizedText``.
Only ``DesensitizedText`` may be passed to ``ApiGateway.send()``. Any
attempt to pass raw ``str`` is caught by mypy at compile time and by
``isinstance`` at runtime.
"""

from __future__ import annotations


class DesensitizedText:
    """Text that has been through the PII desensitization pipeline.

    This type enforces a critical safety invariant: only text wrapped
    in ``DesensitizedText`` may be sent to cloud AI APIs. Raw ``str``
    values are rejected by ``ApiGateway`` at both compile time (mypy)
    and runtime (``isinstance`` check).

    Only the PII desensitization pipeline (``shared/pii_manager.py``,
    Phase 1C) should create instances of this class. Other code should
    consume ``DesensitizedText`` values produced by the pipeline.

    The ``__repr__`` method intentionally does not expose the text
    content, preventing accidental PII leakage in log output.

    Examples:
        >>> # In the desensitization pipeline (Phase 1C):
        >>> clean = DesensitizedText("Dear [NAME_1], your loan of $500,000...")
        >>> # In ApiGateway (Phase 1C):
        >>> def send(text: DesensitizedText) -> str:
        ...     assert isinstance(text, DesensitizedText)
        ...     return f"Sending {len(text)} chars"
    """

    __slots__ = ("_text",)

    def __init__(self, text: str) -> None:
        """Initialize DesensitizedText with desensitized content.

        Args:
            text: The desensitized text string (PII replaced with
                placeholders like ``[NAME_1]``, ``[PHONE_1]``, etc.).

        Raises:
            TypeError: If ``text`` is not a string.
        """
        if not isinstance(text, str):
            raise TypeError(
                f"DesensitizedText requires str, got {type(text).__name__}"
            )
        self._text = text

    def __str__(self) -> str:
        """Return the raw text content."""
        return self._text

    def __len__(self) -> int:
        """Return the length of the text content."""
        return len(self._text)

    def __repr__(self) -> str:
        """Return a safe representation that does not expose text content."""
        return f"DesensitizedText(len={len(self._text)})"

    def __eq__(self, other: object) -> bool:
        """Compare equality with another DesensitizedText."""
        if isinstance(other, DesensitizedText):
            return self._text == other._text
        return NotImplemented

    def __hash__(self) -> int:
        """Return hash of the text content."""
        return hash(self._text)

    @property
    def text(self) -> str:
        """Return the raw text content."""
        return self._text
