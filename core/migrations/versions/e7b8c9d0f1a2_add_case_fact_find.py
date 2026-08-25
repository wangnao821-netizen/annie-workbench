"""add case_fact_find table (WO-77)

Revision ID: e7b8c9d0f1a2
Revises: a4b5c6d7e8f9
Create Date: 2026-08-25 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7b8c9d0f1a2"
down_revision: str | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "case_fact_find",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("case_id", sa.String(), nullable=False),
        sa.Column("section", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("case_fact_find", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_case_fact_find_case_id"), ["case_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("case_fact_find", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_case_fact_find_case_id"))
    op.drop_table("case_fact_find")
