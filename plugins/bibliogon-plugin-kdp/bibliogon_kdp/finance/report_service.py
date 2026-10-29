"""Load stored lines, resolve them to books and evaluate (#1129)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.exceptions import ValidationError
from app.models import (
    Book,
    FinanceAdLine,
    FinanceFxRate,
    FinanceKenpRate,
    FinancePayment,
    FinanceRevenueLine,
    FinanceTitleCost,
)
from bibliogon_kdp.finance.evaluation import (
    AdLine,
    CostLine,
    EvaluationInput,
    EvaluationResult,
    Group,
    KenpRate,
    RevenueLine,
    TitleInfo,
    WithholdingLine,
    evaluate,
)
from bibliogon_kdp.finance.money import parse_month
from bibliogon_kdp.finance.service import BookIndex


def _in_period(month: str, from_month: str | None, to_month: str | None) -> bool:
    return (from_month is None or month >= from_month) and (to_month is None or month <= to_month)


def _revenue_lines(db: Session, index: BookIndex, period: tuple) -> list[RevenueLine]:
    lines = []
    for row in db.query(FinanceRevenueLine).all():
        if not _in_period(row.month, *period):
            continue
        match = index.match(row.asin, row.isbn)
        lines.append(
            RevenueLine(
                month=row.month,
                sales_channel=row.sales_channel,
                kind=row.kind,
                book_format=row.book_format,
                marketplace=row.marketplace,
                book_id=match[0] if match else None,
                title_text=row.asin or row.isbn or row.title_text,
                units_sold=row.units_sold,
                units_refunded=row.units_refunded,
                net_units=row.net_units,
                kenp_pages=row.kenp_pages,
                royalty=row.royalty,
                currency=row.currency,
            )
        )
    return lines


def _ad_lines(db: Session, index: BookIndex, period: tuple) -> list[AdLine]:
    lines = []
    for row in db.query(FinanceAdLine).all():
        if not _in_period(row.month, *period):
            continue
        match = index.match(row.asin)
        lines.append(
            AdLine(
                month=row.month,
                marketplace=row.marketplace,
                book_id=match[0] if match else None,
                book_format=match[1] if match else None,
                asin=row.asin,
                spend=row.spend,
                currency=row.currency,
                clicks=row.clicks,
                orders=row.orders,
                impressions=row.impressions,
            )
        )
    return lines


def _cost_lines(costs: list[FinanceTitleCost], period: tuple) -> list[CostLine]:
    lines = []
    for cost in costs:
        month = cost.cost_date.strftime("%Y-%m")
        if _in_period(month, *period):
            lines.append(CostLine(cost.book_id, month, cost.amount, cost.currency))
    return lines


def _withholding(db: Session, period: tuple) -> list[WithholdingLine]:
    """Withheld tax per payout; payouts without any are left out."""
    return [
        WithholdingLine(p.sales_month, p.marketplace, p.tax, p.currency)
        for p in db.query(FinancePayment).all()
        if p.tax and _in_period(p.sales_month, *period)
    ]


def _titles(db: Session) -> dict[str, TitleInfo]:
    return {
        book.id: TitleInfo(title=book.title, language=book.language, pen_name=book.author)
        for book in db.query(Book).all()
    }


def _check_period(from_month: str | None, to_month: str | None) -> tuple:
    try:
        for value in (from_month, to_month):
            if value is not None and parse_month(value, field="period") != value:
                raise ValueError(f"period: {value!r} must be YYYY-MM")
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc
    return (from_month, to_month)


def build_report(
    db: Session,
    *,
    group_by: tuple[str, ...],
    base_currency: str,
    from_month: str | None = None,
    to_month: str | None = None,
    today: date | None = None,
) -> dict:
    """Evaluate the stored lines for a period and return a JSON shape.

    Raises:
        ValidationError: For an unknown dimension or a malformed month.
    """
    period = _check_period(from_month, to_month)
    base = base_currency.upper()
    index = BookIndex.load(db)
    all_costs = db.query(FinanceTitleCost).all()
    inp = EvaluationInput(
        revenue=_revenue_lines(db, index, period),
        ads=_ad_lines(db, index, period),
        costs=_cost_lines(all_costs, period),
        costed_book_ids={cost.book_id for cost in all_costs},
        titles=_titles(db),
        kenp_rates={
            (r.month, r.marketplace): KenpRate(r.rate, r.currency)
            for r in db.query(FinanceKenpRate).all()
        },
        fx={
            (r.month, r.currency): r.rate
            for r in db.query(FinanceFxRate).filter(FinanceFxRate.base_currency == base).all()
        },
        base_currency=base,
        today=today or date.today(),
        withholding=_withholding(db, period),
    )
    try:
        result = evaluate(inp, group_by)
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc
    return serialize(result, inp.titles)


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _serialize_group(group: Group, titles: dict[str, TitleInfo]) -> dict:
    title_id = group.key.get("title")
    return {
        "key": group.key,
        "title": titles[title_id].title if title_id in titles else None,
        "net_revenue": _money(group.net_revenue),
        "royalty": _money(group.royalty),
        "kenp_royalty": _money(group.kenp_royalty),
        "ad_spend": _money(group.ad_spend),
        "direct_costs": _money(group.direct_costs),
        "tax_withheld": _money(group.tax_withheld),
        "contribution_margin": _money(group.contribution_margin),
        "margin_label": group.margin_label,
        "units_sold": group.units_sold,
        "units_refunded": group.units_refunded,
        "net_units": group.net_units,
        "kenp_pages": group.kenp_pages,
        "ads_impressions": group.ads_impressions,
        "ads_clicks": group.ads_clicks,
        "ads_orders": group.ads_orders,
        "paid_click_to_order_rate": _money(group.paid_click_to_order_rate),
        "provisional": group.provisional,
        "incomplete": group.incomplete,
        "fx_rates_used": [
            {"month": month, "currency": currency, "rate": str(rate)}
            for month, currency, rate in group.fx_rates_used
        ],
    }


def serialize(result: EvaluationResult, titles: dict[str, TitleInfo]) -> dict:
    """JSON shape; money as decimal strings so nothing passes through float."""
    return {
        "base_currency": result.base_currency,
        "group_by": list(result.group_by),
        "groups": [_serialize_group(group, titles) for group in result.groups],
        "provisional_months": result.provisional_months,
        "missing_fx": [{"month": m, "currency": c} for m, c in result.missing_fx],
        "missing_kenp_rates": [
            {"month": m, "marketplace": mp} for m, mp in result.missing_kenp_rates
        ],
        "notes": result.notes,
    }
