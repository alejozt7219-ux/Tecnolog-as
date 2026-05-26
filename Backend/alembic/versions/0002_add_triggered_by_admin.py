"""add triggered_by_admin to search_history

Revision ID: 0002_add_triggered_by_admin
Revises: 0001_initial
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_add_triggered_by_admin'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'search_history',
        sa.Column(
            'triggered_by_admin',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        )
    )


def downgrade() -> None:
    op.drop_column('search_history', 'triggered_by_admin')