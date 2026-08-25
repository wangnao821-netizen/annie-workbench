"""add checklist phase/deadline/source_ref/item_kind columns (WO-74)

Revision ID: a4b5c6d7e8f9
Revises: g7h8i9j0k1l2
Create Date: 2026-08-25 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "g7h8i9j0k1l2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "case_checklist",
        sa.Column("phase", sa.String(), nullable=False, server_default="initial"),
    )
    op.add_column("case_checklist", sa.Column("deadline", sa.DateTime(), nullable=True))
    op.add_column("case_checklist", sa.Column("source_ref", sa.String(), nullable=True))
    op.add_column(
        "case_checklist",
        sa.Column("item_kind", sa.String(), nullable=False, server_default="document"),
    )


def downgrade() -> None:
    op.drop_column("case_checklist", "item_kind")
    op.drop_column("case_checklist", "source_ref")
    op.drop_column("case_checklist", "deadline")
    op.drop_column("case_checklist", "phase")
