"""initial — create all tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── users ──────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'analyst', name='userrole'), nullable=False, server_default='analyst'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_id',    'users', ['id'])

    # ── stores ─────────────────────────────────────────
    op.create_table(
        'stores',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('base_url', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_stores_name', 'stores', ['name'], unique=True)

    # ── products ───────────────────────────────────────
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(500), nullable=False),
        sa.Column('normalized_name', sa.String(500), nullable=False),
        sa.Column('image_hash', sa.String(64), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_products_name',            'products', ['name'])
    op.create_index('ix_products_normalized_name', 'products', ['normalized_name'])
    op.create_index('ix_products_image_hash',      'products', ['image_hash'])

    # ── price_results ──────────────────────────────────
    op.create_table(
        'price_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=False),
        sa.Column('store_id',   sa.Integer(), sa.ForeignKey('stores.id'),   nullable=False),
        sa.Column('price',    sa.Float(),      nullable=False),
        sa.Column('currency', sa.String(3),    nullable=False, server_default='COP'),
        sa.Column('url',      sa.String(1000), nullable=False),
        sa.Column('title',    sa.String(500),  nullable=True),
        sa.Column('in_stock', sa.Boolean(),    nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_price_results_product_id', 'price_results', ['product_id'])
    op.create_index('ix_price_results_store_id',   'price_results', ['store_id'])

    # ── search_history ─────────────────────────────────
    op.create_table(
        'search_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id',    sa.Integer(), sa.ForeignKey('users.id'),    nullable=False),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=True),
        sa.Column('task_id', sa.String(255), nullable=False),
        sa.Column('query',   sa.String(500), nullable=False),
        sa.Column('status',
                  sa.Enum('pending', 'processing', 'done', 'error', name='taskstatus'),
                  nullable=False, server_default='pending'),
        sa.Column('image_url',     sa.String(1000), nullable=True),
        sa.Column('error_message', sa.Text(),        nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_search_history_task_id', 'search_history', ['task_id'], unique=True)
    op.create_index('ix_search_history_user_id', 'search_history', ['user_id'])

    # ── scraping_logs ──────────────────────────────────
    op.create_table(
        'scraping_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('store_id', sa.Integer(), sa.ForeignKey('stores.id'), nullable=True),
        sa.Column('status',           sa.String(20),  nullable=False),
        sa.Column('products_scraped', sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('errors_count',     sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('duration_seconds', sa.Float(),     nullable=True),
        sa.Column('error_detail',     sa.Text(),      nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── seed: tiendas iniciales ────────────────────────
    op.bulk_insert(
        sa.table('stores',
            sa.column('name',      sa.String),
            sa.column('base_url',  sa.String),
            sa.column('is_active', sa.Boolean),
        ),
        [
            {'name': 'MercadoLibre', 'base_url': 'https://www.mercadolibre.com.co', 'is_active': True},
            {'name': 'Falabella',    'base_url': 'https://www.falabella.com.co',    'is_active': True},
            {'name': 'Linio',        'base_url': 'https://www.linio.com.co',        'is_active': True},
            {'name': 'Amazon',       'base_url': 'https://www.amazon.com',          'is_active': True},
        ]
    )


def downgrade() -> None:
    op.drop_table('scraping_logs')
    op.drop_table('search_history')
    op.drop_table('price_results')
    op.drop_table('products')
    op.drop_table('stores')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS taskstatus')
    op.execute('DROP TYPE IF EXISTS userrole')