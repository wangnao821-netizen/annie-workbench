"""add agent_states and bank_platform_states

Revision ID: e5a8f2c149d3
Revises: dccde7819389
Create Date: 2026-08-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a8f2c149d3"
down_revision: str | None = "dccde7819389"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_states",
        sa.Column("agent_key", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("config", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("agent_key"),
    )
    op.create_table(
        "bank_platform_states",
        sa.Column("bank_key", sa.String(), nullable=False),
        sa.Column("platforms", sa.Text(), nullable=False),
        sa.Column("vera_confirmed", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("bank_key"),
    )


def downgrade() -> None:
    op.drop_table("bank_platform_states")
    op.drop_table("agent_states")
