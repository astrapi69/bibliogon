"""add finance tables for KDP report import (#1129)

Revenue lines (royalty + KENP), ad-spend lines, the import log, the
monthly KENP and exchange rates and direct title costs. Amounts and
rates are exact decimals stored as text (``DecimalText``).

Revision ID: h9c0d1e2f3a4
Revises: g8b9c0d1e2f3
Create Date: 2026-10-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h9c0d1e2f3a4"
down_revision: str | Sequence[str] | None = "g8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MONEY = sa.String(length=40)


def upgrade() -> None:
    op.create_table(
        "finance_imports",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("sales_channel", sa.String(length=30), nullable=False),
        sa.Column("book_format", sa.String(length=20), nullable=True),
        sa.Column("marketplace", sa.String(length=50), nullable=True),
        sa.Column("filename", sa.String(length=300), nullable=True),
        sa.Column("file_sha256", sa.String(length=64), nullable=False),
        sa.Column("months", sa.Text(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_finance_imports_file_sha256"), "finance_imports", ["file_sha256"], unique=False
    )
    _create_revenue_lines()
    _create_ad_lines()
    _create_rates()
    op.create_table(
        "finance_title_costs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("book_id", sa.String(length=32), nullable=False),
        sa.Column("cost_date", sa.Date(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_finance_title_costs_book_id"), "finance_title_costs", ["book_id"], unique=False
    )


def _create_revenue_lines() -> None:
    op.create_table(
        "finance_revenue_lines",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("import_id", sa.String(length=32), nullable=True),
        sa.Column("sales_channel", sa.String(length=30), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("marketplace", sa.String(length=50), nullable=False),
        sa.Column("book_format", sa.String(length=20), nullable=False),
        sa.Column("asin", sa.String(length=20), nullable=True),
        sa.Column("isbn", sa.String(length=20), nullable=True),
        sa.Column("title_text", sa.String(length=500), nullable=True),
        sa.Column("author_text", sa.String(length=300), nullable=True),
        sa.Column("royalty_type", sa.String(length=30), nullable=True),
        sa.Column("transaction_type", sa.String(length=60), nullable=True),
        sa.Column("units_sold", sa.Integer(), nullable=False),
        sa.Column("units_refunded", sa.Integer(), nullable=False),
        sa.Column("net_units", sa.Integer(), nullable=False),
        sa.Column("kenp_pages", sa.Integer(), nullable=False),
        sa.Column("royalty", MONEY, nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.ForeignKeyConstraint(["import_id"], ["finance_imports.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("import_id", "month"):
        op.create_index(
            op.f(f"ix_finance_revenue_lines_{column}"),
            "finance_revenue_lines",
            [column],
            unique=False,
        )


def _create_ad_lines() -> None:
    op.create_table(
        "finance_ad_lines",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("import_id", sa.String(length=32), nullable=True),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("marketplace", sa.String(length=50), nullable=False),
        sa.Column("campaign", sa.String(length=300), nullable=False),
        sa.Column("asin", sa.String(length=20), nullable=False),
        sa.Column("impressions", sa.Integer(), nullable=False),
        sa.Column("clicks", sa.Integer(), nullable=False),
        sa.Column("orders", sa.Integer(), nullable=True),
        sa.Column("spend", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.ForeignKeyConstraint(["import_id"], ["finance_imports.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("import_id", "month"):
        op.create_index(
            op.f(f"ix_finance_ad_lines_{column}"), "finance_ad_lines", [column], unique=False
        )


def _create_rates() -> None:
    op.create_table(
        "finance_kenp_rates",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("marketplace", sa.String(length=50), nullable=False),
        sa.Column("rate", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("month", "marketplace", name="uq_finance_kenp_rate"),
    )
    op.create_table(
        "finance_fx_rates",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("base_currency", sa.String(length=3), nullable=False),
        sa.Column("rate", MONEY, nullable=False),
        sa.Column("source", sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("month", "currency", "base_currency", name="uq_finance_fx_rate"),
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_finance_title_costs_book_id"), table_name="finance_title_costs")
    op.drop_table("finance_title_costs")
    op.drop_table("finance_fx_rates")
    op.drop_table("finance_kenp_rates")
    for column in ("import_id", "month"):
        op.drop_index(op.f(f"ix_finance_ad_lines_{column}"), table_name="finance_ad_lines")
        op.drop_index(
            op.f(f"ix_finance_revenue_lines_{column}"), table_name="finance_revenue_lines"
        )
    op.drop_table("finance_ad_lines")
    op.drop_table("finance_revenue_lines")
    op.drop_index(op.f("ix_finance_imports_file_sha256"), table_name="finance_imports")
    op.drop_table("finance_imports")
