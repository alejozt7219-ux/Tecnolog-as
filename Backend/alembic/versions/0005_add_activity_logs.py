"""add activity_logs table

Revision ID: 0005_add_activity_logs
Revises: 0004_add_is_custom_to_stores
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_add_activity_logs"
down_revision = "0004_add_is_custom_to_stores"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE activityeventtype AS ENUM (
                'scraping_scheduled_start', 'scraping_scheduled_end',
                'scraping_manual_start', 'scraping_manual_end',
                'user_registered', 'user_login', 'user_logout',
                'user_deleted', 'store_deleted', 'user_search'
            );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id          SERIAL PRIMARY KEY,
            event_type  activityeventtype NOT NULL,
            actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            actor_name  VARCHAR(100),
            actor_role  VARCHAR(20),
            detail      VARCHAR(500),
            query       VARCHAR(500),
            task_id     VARCHAR(255),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_activity_logs_event_type ON activity_logs (event_type)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS activity_logs"))
    op.execute(sa.text("DROP TYPE IF EXISTS activityeventtype"))
