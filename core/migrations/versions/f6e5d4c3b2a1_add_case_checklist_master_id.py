"""add case_checklist.master_id

Revision ID: f6e5d4c3b2a1
Revises: e5a8f2c149d3
Create Date: 2026-08-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6e5d4c3b2a1"
down_revision: str | None = "e5a8f2c149d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('case_checklist', schema=None) as batch_op:
        batch_op.add_column(sa.Column('master_id', sa.String(), nullable=True))
        batch_op.create_index(batch_op.f('ix_case_checklist_master_id'), ['master_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('case_checklist', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_case_checklist_master_id'))
        batch_op.drop_column('master_id')
