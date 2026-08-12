"""add ai usage log

Revision ID: 6f9c2d4a8e1b
Revises: 354973fd6c37
Create Date: 2026-08-12 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f9c2d4a8e1b'
down_revision: Union[str, None] = '354973fd6c37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.String(), nullable=True),
        sa.Column("scope", sa.String(), nullable=False, server_default="case"),
        sa.Column("track", sa.String(), nullable=False, server_default="internal"),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_cache_hit_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_cache_miss_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("layer_names", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ai_usage_log_case_id", "ai_usage_log", ["case_id"])
    op.create_index("ix_ai_usage_log_created_at", "ai_usage_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_log_created_at", table_name="ai_usage_log")
    op.drop_index("ix_ai_usage_log_case_id", table_name="ai_usage_log")
    op.drop_table("ai_usage_log")