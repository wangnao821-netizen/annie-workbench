"""add submission_platform_ref on cases

Revision ID: dccde7819389
Revises: 6f9c2d4a8e1b
Create Date: 2026-08-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dccde7819389"
down_revision: str | None = "6f9c2d4a8e1b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.add_column(sa.Column('submission_platform_ref', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.drop_column('submission_platform_ref')