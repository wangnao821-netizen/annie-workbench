"""add brain facts

Revision ID: 354973fd6c37
Revises: b4e1c9d2f7a3
Create Date: 2026-08-12 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '354973fd6c37'
down_revision: Union[str, None] = 'b4e1c9d2f7a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "brain_facts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.String(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("track", sa.String(), nullable=False, server_default="internal"),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("superseded_by", sa.Integer(), nullable=True),
        sa.Column("conflict", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_to", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_brain_facts_case_id", "brain_facts", ["case_id"])


def downgrade() -> None:
    op.drop_index("ix_brain_facts_case_id", table_name="brain_facts")
    op.drop_table("brain_facts")