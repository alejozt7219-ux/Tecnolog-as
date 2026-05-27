"""url field to Text in price_results

Revision ID: 0003_url_to_text
Revises: 0002_add_triggered_by_admin
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = '0003_url_to_text'
down_revision = '0002_add_triggered_by_admin'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'price_results',
        'url',
        existing_type=sa.String(1000),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'price_results',
        'url',
        existing_type=sa.Text(),
        type_=sa.String(1000),
        existing_nullable=False,
    )