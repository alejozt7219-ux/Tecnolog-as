"""add activity_logs table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

ACTIVITY_EVENT_TYPES = [
    "scraping_scheduled_start",
    "scraping_scheduled_end",
    "scraping_manual_start",
    "scraping_manual_end",
    "user_registered",
    "user_login",
    "user_logout",
    "user_deleted",
    "store_deleted",
    "user_search",
]


def upgrade() -> None:
    op.execute(
        sa.text(
            "CREATE TYPE activityeventtype AS ENUM ("
            + ", ".join(f"'{v}'" for v in ACTIVITY_EVENT_TYPES)
            + ")"
        )
    )
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "event_type",
            sa.Enum(*ACTIVITY_EVENT_TYPES, name="activityeventtype", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "actor_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("actor_role", sa.String(20), nullable=True),
        sa.Column("detail", sa.String(500), nullable=True),
        sa.Column("query", sa.String(500), nullable=True),
        sa.Column("task_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("activity_logs")
    op.execute("DROP TYPE activityeventtype")
