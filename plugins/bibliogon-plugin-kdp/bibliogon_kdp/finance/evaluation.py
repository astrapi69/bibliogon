"""Contribution margin per title, language, format, market, pen name (#1129).

Pure: the service resolves report rows to books and hands typed lines
in; nothing here touches the database.

Three rules carry the design:

* **No silent zero, no silent one.** A KENP month without a rate and a
  currency without an exchange rate are left out of the sum, flagged on
  the group (``incomplete``) and listed on the result. They are never
  counted as 0 or converted at 1.0.
* **No margin without costs.** ``contribution_margin`` is only set when
  every title in a group has direct costs recorded. Otherwise it stays
  ``None`` and ``margin_label`` says ``net_revenue``.
* **No spreading.** A cost only lands in the dimensions it carries.
  Withheld tax (#1147) carries only marketplace and month.
  Direct costs have no format and no marketplace, so grouping by either
  puts them in a ``not_attributable`` group instead of dividing them up
  by a key nobody chose.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from bibliogon_kdp.finance.money import month_status

DIMENSIONS: tuple[str, ...] = (
    "title",
    "language",
    "pen_name",
    "format",
    "marketplace",
    "month",
    "channel",
)
NOT_ATTRIBUTABLE = "not_attributable"
UNASSIGNED = "unassigned"
ZERO = Decimal("0")

#: Amazon attributes ad sales over a 14-day window and counts Kindle
#: Unlimited reads poorly, so campaigns for KU-heavy titles look worse
#: than they are. Reported as a note; the figure is not adjusted.
NOTE_ADS_ATTRIBUTION = "ads_attribution_window"
NOTE_NO_COSTS = "net_revenue_without_costs"


@dataclass
class RevenueLine:
    month: str
    sales_channel: str
    kind: str
    book_format: str
    marketplace: str
    book_id: str | None
    title_text: str | None
    units_sold: int
    units_refunded: int
    net_units: int
    kenp_pages: int
    royalty: Decimal | None
    currency: str | None


@dataclass
class AdLine:
    month: str
    marketplace: str
    book_id: str | None
    book_format: str | None
    asin: str
    spend: Decimal
    currency: str
    clicks: int
    orders: int | None
    impressions: int


@dataclass
class CostLine:
    book_id: str
    month: str
    amount: Decimal
    currency: str


@dataclass
class WithholdingLine:
    """Tax Amazon withheld from one marketplace payout (#1147)."""

    month: str
    marketplace: str
    amount: Decimal
    currency: str


@dataclass
class KenpRate:
    rate: Decimal
    currency: str


@dataclass
class TitleInfo:
    title: str
    language: str | None
    pen_name: str | None


@dataclass
class EvaluationInput:
    revenue: list[RevenueLine]
    ads: list[AdLine]
    costs: list[CostLine]
    costed_book_ids: set[str]
    titles: dict[str, TitleInfo]
    kenp_rates: dict[tuple[str, str], KenpRate]
    fx: dict[tuple[str, str], Decimal]
    base_currency: str
    today: date
    withholding: list[WithholdingLine] = field(default_factory=list)


@dataclass
class Group:
    key: dict[str, str]
    royalty: Decimal = ZERO
    kenp_royalty: Decimal = ZERO
    ad_spend: Decimal = ZERO
    direct_costs: Decimal = ZERO
    tax_withheld: Decimal = ZERO
    units_sold: int = 0
    units_refunded: int = 0
    net_units: int = 0
    kenp_pages: int = 0
    ads_impressions: int = 0
    ads_clicks: int = 0
    ads_orders: int | None = None
    provisional: bool = False
    incomplete: bool = False
    contribution_margin: Decimal | None = None
    margin_label: str = "net_revenue"
    fx_rates_used: list[tuple[str, str, Decimal]] = field(default_factory=list)
    book_ids: set[str] = field(default_factory=set)
    has_unassigned: bool = False

    @property
    def net_revenue(self) -> Decimal:
        return self.royalty + self.kenp_royalty

    @property
    def paid_click_to_order_rate(self) -> Decimal | None:
        """Orders per ad click - the paid channel only, never all traffic."""
        if self.ads_orders is None or not self.ads_clicks:
            return None
        return Decimal(self.ads_orders) / Decimal(self.ads_clicks)


@dataclass
class EvaluationResult:
    base_currency: str
    group_by: tuple[str, ...]
    groups: list[Group]
    provisional_months: list[str]
    missing_fx: list[tuple[str, str]]
    missing_kenp_rates: list[tuple[str, str]]
    notes: list[str]


class _Evaluator:
    """Accumulates lines into groups; one instance per evaluation."""

    def __init__(self, inp: EvaluationInput, group_by: tuple[str, ...]) -> None:
        self.inp = inp
        self.group_by = group_by
        self.groups: dict[tuple[str, ...], Group] = {}
        self.missing_fx: set[tuple[str, str]] = set()
        self.missing_kenp: set[tuple[str, str]] = set()
        self.provisional_months: set[str] = set()

    def group_for(self, values: dict[str, str]) -> Group:
        key = tuple(values[dim] for dim in self.group_by)
        if key not in self.groups:
            self.groups[key] = Group(key={dim: values[dim] for dim in self.group_by})
        return self.groups[key]

    def to_base(self, group: Group, amount: Decimal, currency: str, month: str) -> Decimal | None:
        if currency == self.inp.base_currency:
            return amount
        rate = self.inp.fx.get((month, currency))
        if rate is None:
            self.missing_fx.add((month, currency))
            group.incomplete = True
            return None
        if (month, currency, rate) not in group.fx_rates_used:
            group.fx_rates_used.append((month, currency, rate))
        return amount * rate

    def mark_month(self, group: Group, month: str) -> None:
        if month_status(month, self.inp.today) == "provisional":
            group.provisional = True
            self.provisional_months.add(month)

    def book_dims(self, book_id: str | None) -> dict[str, str]:
        info = self.inp.titles.get(book_id) if book_id else None
        if info is None:
            return {"language": UNASSIGNED, "pen_name": UNASSIGNED}
        return {"language": info.language or "unknown", "pen_name": info.pen_name or "unknown"}

    def track_book(self, group: Group, book_id: str | None) -> None:
        if book_id:
            group.book_ids.add(book_id)
        else:
            group.has_unassigned = True


def _revenue_dims(ev: _Evaluator, line: RevenueLine) -> dict[str, str]:
    return {
        "title": line.book_id or f"{UNASSIGNED}:{line.title_text}",
        **ev.book_dims(line.book_id),
        "format": line.book_format,
        "marketplace": line.marketplace,
        "month": line.month,
        "channel": line.sales_channel,
    }


def _add_revenue(ev: _Evaluator, line: RevenueLine) -> None:
    group = ev.group_for(_revenue_dims(ev, line))
    ev.track_book(group, line.book_id)
    ev.mark_month(group, line.month)
    group.units_sold += line.units_sold
    group.units_refunded += line.units_refunded
    group.net_units += line.net_units
    group.kenp_pages += line.kenp_pages
    if line.kind == "kenp":
        _add_kenp_value(ev, group, line)
    elif line.royalty is not None and line.currency:
        converted = ev.to_base(group, line.royalty, line.currency, line.month)
        if converted is not None:
            group.royalty += converted


def _add_kenp_value(ev: _Evaluator, group: Group, line: RevenueLine) -> None:
    rate = ev.inp.kenp_rates.get((line.month, line.marketplace))
    if rate is None:
        ev.missing_kenp.add((line.month, line.marketplace))
        group.incomplete = True
        return
    converted = ev.to_base(group, rate.rate * line.kenp_pages, rate.currency, line.month)
    if converted is not None:
        group.kenp_royalty += converted


def _add_ad(ev: _Evaluator, line: AdLine) -> None:
    values = {
        "title": line.book_id or f"{UNASSIGNED}:{line.asin}",
        **ev.book_dims(line.book_id),
        "format": line.book_format or NOT_ATTRIBUTABLE,
        "marketplace": line.marketplace,
        "month": line.month,
        "channel": "kdp",
    }
    group = ev.group_for(values)
    ev.track_book(group, line.book_id)
    ev.mark_month(group, line.month)
    group.ads_impressions += line.impressions
    group.ads_clicks += line.clicks
    if line.orders is not None:
        group.ads_orders = (group.ads_orders or 0) + line.orders
    converted = ev.to_base(group, line.spend, line.currency, line.month)
    if converted is not None:
        group.ad_spend += converted


def _add_cost(ev: _Evaluator, line: CostLine) -> None:
    values = {
        "title": line.book_id,
        **ev.book_dims(line.book_id),
        "format": NOT_ATTRIBUTABLE,
        "marketplace": NOT_ATTRIBUTABLE,
        "month": line.month,
        "channel": NOT_ATTRIBUTABLE,
    }
    group = ev.group_for(values)
    ev.track_book(group, line.book_id)
    converted = ev.to_base(group, line.amount, line.currency, line.month)
    if converted is not None:
        group.direct_costs += converted


def _add_withholding(ev: _Evaluator, line: WithholdingLine) -> None:
    values = {
        "title": NOT_ATTRIBUTABLE,
        "language": NOT_ATTRIBUTABLE,
        "pen_name": NOT_ATTRIBUTABLE,
        "format": NOT_ATTRIBUTABLE,
        "marketplace": line.marketplace,
        "month": line.month,
        "channel": "kdp",
    }
    group = ev.group_for(values)
    converted = ev.to_base(group, line.amount, line.currency, line.month)
    if converted is not None:
        group.tax_withheld += converted


def _finish(group: Group, costed: set[str]) -> None:
    covered = group.book_ids and not group.has_unassigned and group.book_ids <= costed
    if covered:
        group.contribution_margin = (
            group.net_revenue - group.ad_spend - group.direct_costs - group.tax_withheld
        )
        group.margin_label = "contribution_margin"
    group.fx_rates_used.sort()


def evaluate(inp: EvaluationInput, group_by: tuple[str, ...]) -> EvaluationResult:
    """Group every line by ``group_by`` and compute the figures per group.

    Raises:
        ValueError: For a dimension outside :data:`DIMENSIONS`.
    """
    unknown = [dim for dim in group_by if dim not in DIMENSIONS]
    if unknown or not group_by:
        raise ValueError(f"unknown dimension(s) {unknown}; choose from {', '.join(DIMENSIONS)}")
    ev = _Evaluator(inp, group_by)
    for revenue_line in inp.revenue:
        _add_revenue(ev, revenue_line)
    for ad_line in inp.ads:
        _add_ad(ev, ad_line)
    for cost_line in inp.costs:
        _add_cost(ev, cost_line)
    for withholding_line in inp.withholding:
        _add_withholding(ev, withholding_line)
    groups = [ev.groups[key] for key in sorted(ev.groups)]
    for group in groups:
        _finish(group, inp.costed_book_ids)
    return EvaluationResult(
        base_currency=inp.base_currency,
        group_by=group_by,
        groups=groups,
        provisional_months=sorted(ev.provisional_months),
        missing_fx=sorted(ev.missing_fx),
        missing_kenp_rates=sorted(ev.missing_kenp),
        notes=_notes(inp, groups),
    )


def _notes(inp: EvaluationInput, groups: list[Group]) -> list[str]:
    notes = []
    if inp.ads:
        notes.append(NOTE_ADS_ATTRIBUTION)
    if any(group.contribution_margin is None for group in groups):
        notes.append(NOTE_NO_COSTS)
    return notes
