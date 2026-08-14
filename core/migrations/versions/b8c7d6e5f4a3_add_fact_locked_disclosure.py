"""add locked_by_user / disclosure columns to brain_facts (WO-42)

Revision ID: b8c7d6e5f4a3
Revises: c3f9e7a2b1d4
Create Date: 2026-08-14 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c7d6e5f4a3"
down_revision: str | None = "c3f9e7a2b1d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "brain_facts",
        sa.Column("locked_by_user", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("brain_facts", sa.Column("disclosure", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("brain_facts", "disclosure")
    op.drop_column("brain_facts", "locked_by_user")
