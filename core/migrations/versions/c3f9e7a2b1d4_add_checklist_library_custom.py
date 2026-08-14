"""add checklist_library_custom table (WO-43)

Revision ID: c3f9e7a2b1d4
Revises: d7a8b9c0e1f2
Create Date: 2026-08-14 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f9e7a2b1d4"
down_revision: str | None = "d7a8b9c0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "checklist_library_custom",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name_zh", sa.String(), nullable=False),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("applicable_when", sa.JSON(), nullable=True),
        sa.Column("bank_specific", sa.String(), nullable=True),
        sa.Column("source_case_id", sa.String(), nullable=True),
        sa.Column("use_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("checklist_library_custom")
