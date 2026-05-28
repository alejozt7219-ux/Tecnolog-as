"""add is_custom to stores

Revision ID: 0004_add_is_custom_to_stores
Revises: 0003_url_to_text
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_add_is_custom_to_stores"
down_revision = "0003_url_to_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stores",
        sa.Column(
            "is_custom",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("stores", "is_custom")