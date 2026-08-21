"""add occurred_at to case_context_events

Revision ID: g7h8i9j0k1l2
Revises: b8c7d6e5f4a3
Create Date: 2026-08-21 15:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'b8c7d6e5f4a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('occurred_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.drop_column('occurred_at')
