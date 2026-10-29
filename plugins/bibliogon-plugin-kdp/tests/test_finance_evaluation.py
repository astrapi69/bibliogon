"""Contribution-margin evaluation over typed lines (#1129)."""

from datetime import date
from decimal import Decimal

import pytest
from bibliogon_kdp.finance.evaluation import (
    AdLine,
    CostLine,
    EvaluationInput,
    KenpRate,
    RevenueLine,
    TitleInfo,
    evaluate,
)

TODAY = date(2026, 10, 27)
TITLES = {
    "b1": TitleInfo(title="Alpha", language="de", pen_name="Pen A"),
    "b2": TitleInfo(title="Beta", language="en", pen_name="Pen B"),
}


def _royalty(month: str, amount: str, currency: str = "EUR", **kw: object) -> RevenueLine:
    defaults: dict = {
        "sales_channel": "kdp",
        "kind": "royalty",
        "book_format": "ebook",
        "marketplace": "Amazon.de",
        "book_id": "b1",
        "title_text": "Alpha",
        "units_sold": 1,
        "units_refunded": 0,
        "net_units": 1,
        "kenp_pages": 0,
    }
    defaults.update(kw)
    return RevenueLine(month=month, royalty=Decimal(amount), currency=currency, **defaults)


def _kenp(month: str, pages: int, marketplace: str = "Amazon.de") -> RevenueLine:
    return RevenueLine(
        month=month,
        sales_channel="kdp",
        kind="kenp",
        book_format="ebook",
        marketplace=marketplace,
        book_id="b1",
        title_text="Alpha",
        units_sold=0,
        units_refunded=0,
        net_units=0,
        kenp_pages=pages,
        royalty=None,
        currency=None,
    )


def _input(**kw: object) -> EvaluationInput:
    defaults: dict = {
        "revenue": [],
        "ads": [],
        "costs": [],
        "costed_book_ids": set(),
        "titles": TITLES,
        "kenp_rates": {},
        "fx": {},
        "base_currency": "EUR",
        "today": TODAY,
    }
    defaults.update(kw)
    return EvaluationInput(**defaults)


def _only(result, **key: str):
    matches = [g for g in result.groups if all(g.key.get(k) == v for k, v in key.items())]
    assert len(matches) == 1, [g.key for g in result.groups]
    return matches[0]


class TestKenp:
    def test_pages_are_valued_with_the_rate_of_their_own_month(self) -> None:
        rates = {
            ("2026-01", "Amazon.de"): KenpRate(Decimal("0.0040"), "EUR"),
            ("2026-02", "Amazon.de"): KenpRate(Decimal("0.0050"), "EUR"),
        }
        result = evaluate(
            _input(revenue=[_kenp("2026-01", 1000), _kenp("2026-02", 2000)], kenp_rates=rates),
            ("title",),
        )
        group = _only(result, title="b1")
        assert group.kenp_royalty == Decimal("14.0000")
        assert group.kenp_pages == 3000
        assert group.kenp_royalty != Decimal("3000") * Decimal("0.0045")

    def test_a_month_without_a_rate_is_flagged_not_counted_as_zero(self) -> None:
        rates = {("2026-01", "Amazon.de"): KenpRate(Decimal("0.0040"), "EUR")}
        result = evaluate(
            _input(revenue=[_kenp("2026-01", 1000), _kenp("2026-02", 2000)], kenp_rates=rates),
            ("title",),
        )
        group = _only(result, title="b1")
        assert group.kenp_royalty == Decimal("4.0000")
        assert group.incomplete is True
        assert result.missing_kenp_rates == [("2026-02", "Amazon.de")]


class TestCurrency:
    def test_two_currencies_sum_with_the_recorded_rate(self) -> None:
        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "33.00"), _royalty("2026-01", "16.00", "USD")],
                fx={("2026-01", "USD"): Decimal("0.9200")},
            ),
            ("title",),
        )
        group = _only(result, title="b1")
        assert group.net_revenue == Decimal("47.7200")
        assert group.fx_rates_used == [("2026-01", "USD", Decimal("0.9200"))]

    def test_a_missing_rate_is_never_treated_as_one(self) -> None:
        result = evaluate(
            _input(revenue=[_royalty("2026-01", "33.00"), _royalty("2026-01", "16.00", "USD")]),
            ("title",),
        )
        group = _only(result, title="b1")
        assert group.net_revenue == Decimal("33.00")
        assert group.incomplete is True
        assert result.missing_fx == [("2026-01", "USD")]


class TestMarginLabel:
    def test_without_costs_the_figure_is_net_revenue_not_a_margin(self) -> None:
        result = evaluate(_input(revenue=[_royalty("2026-01", "33.00")]), ("title",))
        group = _only(result, title="b1")
        assert group.margin_label == "net_revenue"
        assert group.contribution_margin is None
        assert group.net_revenue == Decimal("33.00")

    def test_with_costs_ads_and_direct_costs_reduce_the_margin(self) -> None:
        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "33.00")],
                ads=[
                    AdLine(
                        "2026-01",
                        "Amazon.de",
                        "b1",
                        "ebook",
                        "B000000001",
                        Decimal("15.00"),
                        "EUR",
                        60,
                        4,
                        2000,
                    )
                ],
                costs=[CostLine("b1", "2026-01", Decimal("10.00"), "EUR")],
                costed_book_ids={"b1"},
            ),
            ("title",),
        )
        group = _only(result, title="b1")
        assert group.margin_label == "contribution_margin"
        assert group.contribution_margin == Decimal("8.00")
        assert group.ad_spend == Decimal("15.00")
        assert group.direct_costs == Decimal("10.00")

    def test_a_title_with_costs_recorded_outside_the_period_still_counts_as_costed(self) -> None:
        result = evaluate(
            _input(revenue=[_royalty("2026-01", "33.00")], costed_book_ids={"b1"}),
            ("title",),
        )
        assert _only(result, title="b1").contribution_margin == Decimal("33.00")

    def test_a_group_mixing_costed_and_uncosted_titles_has_no_margin(self) -> None:
        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "33.00"), _royalty("2026-01", "5.00", book_id="b2")],
                costed_book_ids={"b1"},
            ),
            ("month",),
        )
        assert _only(result, month="2026-01").contribution_margin is None


class TestDimensions:
    def test_unmatched_rows_stay_visible_as_unassigned(self) -> None:
        result = evaluate(
            _input(revenue=[_royalty("2026-01", "2.00", book_id=None, title_text="B000000099")]),
            ("title",),
        )
        group = _only(result, title="unassigned:B000000099")
        assert group.net_revenue == Decimal("2.00")

    def test_language_and_pen_name_come_from_the_book(self) -> None:
        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "3.00"), _royalty("2026-01", "5.00", book_id="b2")]
            ),
            ("language", "pen_name"),
        )
        assert _only(result, language="de", pen_name="Pen A").net_revenue == Decimal("3.00")
        assert _only(result, language="en", pen_name="Pen B").net_revenue == Decimal("5.00")

    def test_direct_costs_are_not_spread_over_formats(self) -> None:
        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "33.00")],
                costs=[CostLine("b1", "2026-01", Decimal("10.00"), "EUR")],
                costed_book_ids={"b1"},
            ),
            ("format",),
        )
        assert _only(result, format="ebook").direct_costs == Decimal("0")
        assert _only(result, format="not_attributable").direct_costs == Decimal("10.00")

    def test_an_unknown_dimension_fails(self) -> None:
        with pytest.raises(ValueError, match="dimension"):
            evaluate(_input(), ("genre",))


class TestProvisionalAndNotes:
    def test_recent_months_are_marked_provisional(self) -> None:
        result = evaluate(
            _input(revenue=[_royalty("2026-01", "1.00"), _royalty("2026-09", "1.00")]),
            ("month",),
        )
        assert _only(result, month="2026-01").provisional is False
        assert _only(result, month="2026-09").provisional is True
        assert result.provisional_months == ["2026-09"]

    def test_ad_spend_carries_the_attribution_hint_and_paid_conversion_only(self) -> None:
        result = evaluate(
            _input(
                ads=[
                    AdLine(
                        "2026-01",
                        "Amazon.de",
                        "b1",
                        "ebook",
                        "B000000001",
                        Decimal("15.00"),
                        "EUR",
                        60,
                        3,
                        2000,
                    )
                ]
            ),
            ("title",),
        )
        assert "ads_attribution_window" in result.notes
        group = _only(result, title="b1")
        assert group.paid_click_to_order_rate == Decimal("0.05")
        assert not hasattr(group, "conversion_rate")

    def test_no_ad_spend_no_attribution_hint(self) -> None:
        result = evaluate(_input(revenue=[_royalty("2026-01", "1.00")]), ("title",))
        assert "ads_attribution_window" not in result.notes


class TestWithholding:
    def test_withheld_tax_reduces_the_margin_of_its_month(self) -> None:
        from bibliogon_kdp.finance.evaluation import WithholdingLine

        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "33.00")],
                withholding=[WithholdingLine("2026-01", "Amazon.de", Decimal("3.30"), "EUR")],
                costed_book_ids={"b1"},
            ),
            ("month",),
        )
        group = _only(result, month="2026-01")
        assert group.tax_withheld == Decimal("3.30")
        assert group.contribution_margin == Decimal("29.70")

    def test_withheld_tax_is_not_spread_over_titles(self) -> None:
        from bibliogon_kdp.finance.evaluation import WithholdingLine

        result = evaluate(
            _input(
                revenue=[_royalty("2026-01", "33.00")],
                withholding=[WithholdingLine("2026-01", "Amazon.com", Decimal("2"), "USD")],
                fx={("2026-01", "USD"): Decimal("0.9")},
            ),
            ("title",),
        )
        assert _only(result, title="b1").tax_withheld == Decimal("0")
        assert _only(result, title="not_attributable").tax_withheld == Decimal("1.8")
