"""Pipeline state machine for file processing lifecycle.

Defines the legal states a file can be in and the valid transitions
between them. Any illegal transition raises ``InvalidTransitionError``.

State diagram::

    DISCOVERED ──┬──▸ PARSED ──┬──▸ EXTRACTED ──▸ ANALYZED ──▸ REPORTED
                 │             │
                 ├──▸ SKIPPED  ├──▸ NEEDS_MANUAL_REVIEW
                 │             │
                 └──▸ FAILED   └──▸ FAILED
                      │
                      └──▸ DISCOVERED  (retry)
"""

from __future__ import annotations

from enum import Enum

from core.logger import get_logger

logger = get_logger(__name__)


class FileState(Enum):
    """Possible states of a file in the processing pipeline."""

    DISCOVERED = "DISCOVERED"
    PARSED = "PARSED"
    EXTRACTED = "EXTRACTED"
    ANALYZED = "ANALYZED"
    REPORTED = "REPORTED"
    FAILED = "FAILED"
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"
    SKIPPED = "SKIPPED"


# Legal state transitions — keys are the *current* state, values are
# the set of states that the file may move to.
VALID_TRANSITIONS: dict[FileState, set[FileState]] = {
    FileState.DISCOVERED: {
        FileState.PARSED,
        FileState.SKIPPED,
        FileState.FAILED,
    },
    FileState.PARSED: {
        FileState.EXTRACTED,
        FileState.NEEDS_MANUAL_REVIEW,
        FileState.FAILED,
    },
    FileState.EXTRACTED: {
        FileState.ANALYZED,
        FileState.FAILED,
    },
    FileState.ANALYZED: {
        FileState.REPORTED,
        FileState.FAILED,
    },
    # FAILED may be retried — goes back to DISCOVERED.
    FileState.FAILED: {FileState.DISCOVERED},
    # Terminal states — no further transitions allowed.
    FileState.REPORTED: set(),
    FileState.SKIPPED: set(),
    FileState.NEEDS_MANUAL_REVIEW: set(),
}


class InvalidTransitionError(Exception):
    """Raised when an illegal state transition is attempted."""


def transition(current: FileState, target: FileState) -> FileState:
    """Validate and execute a state transition.

    Args:
        current: The file's current state.
        target: The desired next state.

    Returns:
        The new ``FileState`` (equal to *target*) on success.

    Raises:
        InvalidTransitionError: If the transition is not allowed.
    """
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError(
            f"Cannot transition from {current.value} to {target.value}"
        )
    logger.debug("State transition: %s → %s", current.value, target.value)
    return target


def is_terminal(state: FileState) -> bool:
    """Return ``True`` if *state* is a terminal (final) state.

    Terminal states: REPORTED, SKIPPED, NEEDS_MANUAL_REVIEW.
    """
    return state in {
        FileState.REPORTED,
        FileState.SKIPPED,
        FileState.NEEDS_MANUAL_REVIEW,
    }


def can_retry(state: FileState) -> bool:
    """Return ``True`` if *state* allows retry (FAILED → DISCOVERED)."""
    return state == FileState.FAILED
