"""add case_chat_messages parent_message_id / branch_label

Revision ID: a1b2c3d4e5f6
Revises: f6e5d4c3b2a1
Create Date: 2026-08-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f6e5d4c3b2a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('case_chat_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('parent_message_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('branch_label', sa.String(), nullable=True))
        batch_op.create_index(batch_op.f('ix_case_chat_messages_parent_message_id'), ['parent_message_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_case_chat_messages_branch_label'), ['branch_label'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('case_chat_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_case_chat_messages_branch_label'))
        batch_op.drop_index(batch_op.f('ix_case_chat_messages_parent_message_id'))
        batch_op.drop_column('branch_label')
        batch_op.drop_column('parent_message_id')