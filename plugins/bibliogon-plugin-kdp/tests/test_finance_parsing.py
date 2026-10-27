"""Report parsers: typed projection with loud failure (#1129).

The fixtures are synthetic (see ``test_finance_fixture_guard``). Their
headers follow the KDP and Amazon Ads downloads as known at the time of
writing; when Amazon renames a column, the contract has to fail on it
rather than drop the value.
"""

from decimal import Decimal
from pathlib import Path

import pytest
from bibliogon_kdp.finance.parsing import ReportFormatError, parse_report

FIXTURES = Path(__file__).parent / "fixtures" / "finance"


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


class TestRoyalty:
    def test_ebook_rows_are_projected_onto_typed_records(self) -> None:
        parsed = parse_report(
            "kdp_royalty", _fixture("royalty-ebook-2026-01.csv"), book_format="ebook"
        )
        assert len(parsed.revenue) == 3
        first = parsed.revenue[0]
        assert first.kind == "royalty"
        assert first.month == "2026-01"
        assert first.book_format == "ebook"
        assert first.asin == "B000000001"
        assert first.marketplace == "Amazon.de"
        assert (first.units_sold, first.units_refunded, first.net_units) == (10, 0, 10)
        assert first.royalty == Decimal("33.00")
        assert first.currency == "EUR"

    def test_paperback_rows_carry_the_isbn(self) -> None:
        parsed = parse_report(
            "kdp_royalty", _fixture("royalty-paperback-2026-01.csv"), book_format="paperback"
        )
        assert parsed.revenue[0].isbn == "9780000000002"
        assert parsed.revenue[0].book_format == "paperback"

    def test_royalty_import_requires_a_format(self) -> None:
        with pytest.raises(ReportFormatError, match="book_format"):
            parse_report("kdp_royalty", _fixture("royalty-ebook-2026-01.csv"))

    def test_an_unknown_column_fails_instead_of_being_dropped(self) -> None:
        raw = _fixture("royalty-ebook-2026-01.csv").replace(
            b"Currency\n", b"Currency,Tax Withheld\n", 1
        )
        raw = raw.replace(b",EUR\n", b",EUR,0\n").replace(b",USD\n", b",USD,0\n")
        with pytest.raises(ReportFormatError, match="Tax Withheld"):
            parse_report("kdp_royalty", raw, book_format="ebook")

    def test_a_renamed_required_column_fails_and_names_it(self) -> None:
        raw = _fixture("royalty-ebook-2026-01.csv").replace(b",Royalty,", b",Royalties,", 1)
        with pytest.raises(ReportFormatError) as excinfo:
            parse_report("kdp_royalty", raw, book_format="ebook")
        message = str(excinfo.value)
        assert "Royalties" in message
        assert "missing" in message and "Royalty" in message

    def test_a_bad_cell_names_row_and_column(self) -> None:
        raw = _fixture("royalty-ebook-2026-01.csv").replace(b",33.00,", b",33,00 EUR,", 1)
        with pytest.raises(ReportFormatError, match=r"row 2"):
            parse_report("kdp_royalty", raw, book_format="ebook")

    def test_semicolon_export_and_bom_are_read(self) -> None:
        raw = "﻿" + _fixture("royalty-paperback-2026-01.csv").decode().replace(",", ";")
        parsed = parse_report("kdp_royalty", raw.encode(), book_format="paperback")
        assert parsed.revenue[0].royalty == Decimal("13.98")

    def test_blank_trailing_rows_are_ignored(self) -> None:
        raw = _fixture("royalty-paperback-2026-01.csv") + b"\n,,,,,,,,,,,,,,,\n"
        assert len(parse_report("kdp_royalty", raw, book_format="paperback").revenue) == 1

    def test_an_empty_report_fails(self) -> None:
        with pytest.raises(ReportFormatError, match="no data rows"):
            parse_report("kdp_royalty", b"", book_format="ebook")


class TestKenp:
    def test_pages_are_read_per_month_without_a_royalty(self) -> None:
        parsed = parse_report("kdp_kenp", _fixture("kenp-2026-01-02.csv"))
        assert [(r.month, r.kenp_pages) for r in parsed.revenue] == [
            ("2026-01", 1000),
            ("2026-02", 2000),
        ]
        assert all(r.kind == "kenp" and r.royalty is None for r in parsed.revenue)
        assert all(r.book_format == "ebook" for r in parsed.revenue)


class TestAds:
    def test_spend_and_paid_channel_counts_are_read(self) -> None:
        parsed = parse_report(
            "amazon_ads", _fixture("ads-advertised-product-2026-01.csv"), marketplace="Amazon.de"
        )
        assert len(parsed.ads) == 2
        first = parsed.ads[0]
        assert (first.month, first.marketplace, first.asin) == (
            "2026-01",
            "Amazon.de",
            "B000000001",
        )
        assert first.spend == Decimal("10.00")
        assert (first.impressions, first.clicks, first.orders) == (1200, 40, 4)
        assert first.campaign == "Example Campaign One"

    def test_ads_import_requires_the_marketplace_of_the_ads_account(self) -> None:
        with pytest.raises(ReportFormatError, match="marketplace"):
            parse_report("amazon_ads", _fixture("ads-advertised-product-2026-01.csv"))

    def test_a_summary_row_spanning_two_months_fails(self) -> None:
        raw = (
            b"Start Date,End Date,Currency,Campaign Name,Advertised ASIN,Impressions,Clicks,Spend\n"
            b"2026-01-20,2026-02-10,EUR,C,B000000001,10,1,1.00\n"
        )
        with pytest.raises(ReportFormatError, match="spans"):
            parse_report("amazon_ads", raw, marketplace="Amazon.de")

    def test_a_summary_row_within_one_month_is_accepted(self) -> None:
        raw = (
            b"Start Date,End Date,Currency,Campaign Name,Advertised ASIN,Impressions,Clicks,Spend\n"
            b"2026-01-01,2026-01-31,EUR,C,B000000001,10,1,1.00\n"
        )
        parsed = parse_report("amazon_ads", raw, marketplace="Amazon.de")
        assert parsed.ads[0].month == "2026-01"
        assert parsed.ads[0].orders is None


def test_an_unknown_report_kind_fails() -> None:
    with pytest.raises(ReportFormatError, match="kind"):
        parse_report("kdp_payments", b"a\n1\n")
