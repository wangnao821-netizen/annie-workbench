"""Pydantic data models for loan-assistant database tables.

These models are used for data validation and serialization.
The ORM layer is in ``shared/sa_models.py`` (SQLAlchemy).

Each model corresponds to one database table. Fields map to columns.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    """Return the current UTC timestamp."""
    return datetime.now(UTC)


class FileEvent(BaseModel):
    """A single event in a file's processing lifecycle (immutable log)."""

    event_id: str = Field(..., description="UUID hex primary key")
    file_id: str = Field(..., description="Reference to processed_files.file_id")
    event_type: str = Field(..., description="e.g. DISCOVERED, PARSED, ERROR")
    module: str = Field(..., description="Module that generated the event")
    details: str | None = None
    error: str | None = None
    timestamp: datetime = Field(default_factory=_utcnow)


class ProcessedFile(BaseModel):
    """Tracks a file through the processing pipeline."""

    file_id: str = Field(..., description="Primary key (hash or path string)")
    case_id: str
    file_path: str
    file_name: str
    file_extension: str
    file_size: int = Field(ge=0)
    status: str = Field(..., description="FileState enum value")
    document_type: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    suggested_name: str | None = None
    parse_route: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class PiiStoreEntry(BaseModel):
    """PII token mapping (Phase 1B: table created, no writes)."""

    pii_id: str
    file_id: str
    pii_type: str
    original_value: str
    desensitized_placeholder: str
    created_at: datetime = Field(default_factory=_utcnow)


class ApiCall(BaseModel):
    """Record of a cloud API invocation (Phase 1B: table created, no writes)."""

    call_id: str
    file_id: str | None = None
    provider: str
    model: str
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)
    cost_usd: float = Field(ge=0.0)
    latency_ms: int = Field(ge=0)
    success: bool
    error: str | None = None
    timestamp: datetime = Field(default_factory=_utcnow)


class ClassificationCorrection(BaseModel):
    """User correction of a classification result (Phase 1D)."""

    correction_id: str
    file_id: str
    original_type: str
    corrected_type: str
    corrected_by: str
    timestamp: datetime = Field(default_factory=_utcnow)


class AuditLogEntry(BaseModel):
    """Security / audit event (PII leaks, PathGuard denials)."""

    audit_id: str
    event_type: str
    severity: str
    details: str
    timestamp: datetime = Field(default_factory=_utcnow)


class Client(BaseModel):
    """Represents a loan applicant / client."""

    client_id: str
    full_name: str
    email: str | None = None
    phone: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)


class Case(BaseModel):
    """A loan case belonging to a client."""

    case_id: str
    client_id: str
    client_name: str
    client_email: str
    client_phone: str
    broker_name: str
    lender: str
    loan_amount: float
    property_value: float
    lvr: float
    stage: str
    is_urgent: bool
    urgent_reason: str | None = None
    gathering_progress: int
    case_type: str | None = None
    loan_purpose: str | None = None
    preferred_language: str | None = None
    residency_status: str | None = None
    case_folder_name: str
    created_at: datetime = Field(default_factory=_utcnow)


class ChecklistStatus(BaseModel):
    """Tracks document completeness for a case."""

    case_id: str
    document_type: str
    status: str = Field(
        ..., description="received | missing | expired | expiring | pending_confirm"
    )
    file_id: str | None = None
    last_checked: datetime = Field(default_factory=_utcnow)
