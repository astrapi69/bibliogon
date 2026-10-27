"""Value parsing and month conventions of the finance import (#1129)."""

from datetime import date
from decimal import Decimal

import pytest
from bibliogon_kdp.finance.money import (
    PROVISIONAL_DAYS,
    month_status,
    parse_decimal,
    parse_int,
    parse_month,
)


class TestParseDecimal:
    def test_plain_and_negative_values_are_exact(self) -> None:
        assert parse_decimal("33.00", field="Royalty") == Decimal("33.00")
        assert parse_decimal("-2.10", field="Royalty") == Decimal("-2.10")

    def test_thousands_separator_comma_is_accepted(self) -> None:
        assert parse_decimal("1,234.56", field="Royalty") == Decimal("1234.56")

    @pytest.mark.parametrize("text", ["12,5", "1.234,56", "$3.00", "abc", "", "1e3"])
    def test_ambiguous_or_foreign_shapes_fail_loudly(self, text: str) -> None:
        with pytest.raises(ValueError, match="Royalty"):
            parse_decimal(text, field="Royalty")


class TestParseInt:
    def test_integer_text(self) -> None:
        assert parse_int("12", field="Units Sold") == 12
        assert parse_int("1,200", field="Impressions") == 1200

    @pytest.mark.parametrize("text", ["1.5", "", "x"])
    def test_non_integer_fails_loudly(self, text: str) -> None:
        with pytest.raises(ValueError, match="Units Sold"):
            parse_int(text, field="Units Sold")

    def test_integral_decimal_text_is_accepted(self) -> None:
        assert parse_int("12.0", field="Units Sold") == 12


class TestParseMonth:
    @pytest.mark.parametrize(
        "text",
        ["2026-01", "2026-01-15", "2026-01-31T00:00:00", "Jan 05, 2026", "January 5, 2026"],
    )
    def test_supported_shapes_map_to_the_month(self, text: str) -> None:
        assert parse_month(text, field="Date") == "2026-01"

    @pytest.mark.parametrize("text", ["01/02/2026", "05.01.2026", "", "2026-13"])
    def test_ambiguous_dates_fail_loudly(self, text: str) -> None:
        with pytest.raises(ValueError, match="Date"):
            parse_month(text, field="Date")


class TestMonthStatus:
    def test_the_window_is_ninety_days(self) -> None:
        assert PROVISIONAL_DAYS == 90

    def test_boundary_of_the_provisional_window(self) -> None:
        assert month_status("2026-01", date(2026, 5, 1)) == "provisional"
        assert month_status("2026-01", date(2026, 5, 2)) == "closed"

    def test_current_month_is_provisional(self) -> None:
        assert month_status("2026-10", date(2026, 10, 27)) == "provisional"

    def test_december_rolls_into_the_next_year(self) -> None:
        assert month_status("2025-12", date(2026, 3, 31)) == "provisional"
        assert month_status("2025-12", date(2026, 4, 1)) == "closed"
