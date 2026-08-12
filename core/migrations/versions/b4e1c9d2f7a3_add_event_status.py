"""add event status columns

Revision ID: b4e1c9d2f7a3
Revises: f49cf1c11b02
Create Date: 2026-08-12 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4e1c9d2f7a3'
down_revision: Union[str, None] = 'f49cf1c11b02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # status 的 server_default='confirmed'：SQLite batch 重建时，历史行一律视为已确认
    # （#6 语义：账本已有事实视为已确认）
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(length=20), nullable=False, server_default='confirmed'))
        batch_op.add_column(sa.Column('superseded_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('supersede_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('case_context_events', schema=None) as batch_op:
        batch_op.drop_column('supersede_reason')
        batch_op.drop_column('superseded_by')
        batch_op.drop_column('status')
