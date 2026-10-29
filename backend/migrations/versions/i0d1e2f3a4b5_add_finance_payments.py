"""add finance_payments + finance_payment_lines (#1147)

The KDP payments report: one row per marketplace payout and sales month,
with Amazon's applied exchange rate and the withheld tax, plus one line
per source.

Revision ID: i0d1e2f3a4b5
Revises: h9c0d1e2f3a4
Create Date: 2026-10-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "h9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MONEY = sa.String(length=40)


def upgrade() -> None:
    op.create_table(
        "finance_payments",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("import_id", sa.String(length=32), nullable=True),
        sa.Column("payment_no", sa.String(length=40), nullable=False),
        sa.Column("marketplace", sa.String(length=50), nullable=False),
        sa.Column("sales_month", sa.String(length=7), nullable=False),
        sa.Column("payment_date", sa.String(length=10), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("accrued", MONEY, nullable=False),
        sa.Column("tax", MONEY, nullable=False),
        sa.Column("net", MONEY, nullable=False),
        sa.Column("fx_rate", MONEY, nullable=True),
        sa.Column("payout_currency", sa.String(length=3), nullable=False),
        sa.Column("payout_amount", MONEY, nullable=False),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(["import_id"], ["finance_imports.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_no"),
    )
    for column in ("import_id", "sales_month"):
        op.create_index(
            op.f(f"ix_finance_payments_{column}"), "finance_payments", [column], unique=False
        )
    op.create_table(
        "finance_payment_lines",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("payment_id", sa.String(length=32), nullable=False),
        sa.Column("sales_month", sa.String(length=7), nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("accrued", MONEY, nullable=False),
        sa.Column("tax", MONEY, nullable=False),
        sa.Column("net", MONEY, nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["finance_payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_finance_payment_lines_payment_id"),
        "finance_payment_lines",
        ["payment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_finance_payment_lines_payment_id"), table_name="finance_payment_lines")
    op.drop_table("finance_payment_lines")
    for column in ("import_id", "sales_month"):
        op.drop_index(op.f(f"ix_finance_payments_{column}"), table_name="finance_payments")
    op.drop_table("finance_payments")
