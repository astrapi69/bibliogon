"""KDP payments report: hierarchical rows, checked invariants (#1147).

The header is the German one from a real download; every amount here is
synthetic. A payment row is followed by its detail rows (one per source).
"""

from decimal import Decimal

import pytest
from bibliogon_kdp.finance.payments import DE_HEADERS, parse_payments
from bibliogon_kdp.finance.parsing import ReportFormatError

from tests.xlsx_builder import build_xlsx


def _payment(
    month: str,
    market: str,
    number: float,
    currency: str,
    accrued: float,
    tax: float,
    net: float,
    rate: str | None,
    payout_currency: str,
    payout: float,
) -> list:
    return [
        f"{month}-01",
        f"{month}-28",
        market,
        number,
        "",
        f"{month}-28",
        "EFT",
        currency,
        accrued,
        tax,
        net,
        "",
        rate or "",
        payout_currency,
        payout,
        "Bezahlt",
    ]


def _detail(month: str, currency: str, accrued: float, tax: float, net: float, source: str) -> list:
    return ["", "", "", "", month, "", "", currency, accrued, tax, net, source, "", "", "", ""]


def _workbook(*rows: list) -> bytes:
    return build_xlsx({"Zahlungen": [list(DE_HEADERS), *rows]})


VALID = (
    _payment(
        "2026-01", "Amazon.com", 100000000000001.0, "USD", 30.0, 0.0, 30.0, "0.9000", "EUR", 27.0
    ),
    _detail("2026-01", "USD", 20.0, 0.0, 20.0, "Verkäufe"),
    _detail("2026-01", "USD", 10.0, 0.0, 10.0, "Kindle+ Tantiemen"),
    _payment("2026-01", "Amazon.de", 200000001.0, "EUR", 12.5, 0.0, 12.5, None, "EUR", 12.5),
    _detail("2026-01", "EUR", 12.5, 0.0, 12.5, "Taschenbuchverkäufe"),
)


def test_payments_and_their_lines_are_read() -> None:
    parsed = parse_payments(_workbook(*VALID))
    assert [p.payment_no for p in parsed.payments] == ["100000000000001", "200000001"]
    usd = parsed.payments[0]
    assert (usd.sales_month, usd.marketplace, usd.currency) == ("2026-01", "Amazon.com", "USD")
    assert usd.fx_rate == Decimal("0.9000")
    assert usd.payout_amount == Decimal("27")
    assert [(line.source, line.net) for line in usd.lines] == [
        ("Verkäufe", Decimal("20")),
        ("Kindle+ Tantiemen", Decimal("10")),
    ]
    assert parsed.payments[1].fx_rate is None


def test_the_two_currency_columns_are_told_apart_by_position() -> None:
    parsed = parse_payments(_workbook(*VALID))
    assert (parsed.payments[0].currency, parsed.payments[0].payout_currency) == ("USD", "EUR")


def test_an_unknown_or_reordered_header_fails() -> None:
    headers = list(DE_HEADERS)
    headers[12], headers[14] = headers[14], headers[12]
    with pytest.raises(ReportFormatError, match="header"):
        parse_payments(build_xlsx({"Zahlungen": [headers, *VALID]}))


def test_a_detail_row_before_any_payment_fails() -> None:
    with pytest.raises(ReportFormatError, match="row 2.*before any payment"):
        parse_payments(_workbook(VALID[1], *VALID))


def test_details_that_do_not_sum_to_their_payment_fail() -> None:
    broken = list(VALID)
    broken[2] = _detail("2026-01", "USD", 9.0, 0.0, 9.0, "Kindle+ Tantiemen")
    with pytest.raises(ReportFormatError, match="do not sum"):
        parse_payments(_workbook(*broken))


def test_net_must_equal_accrued_minus_tax() -> None:
    broken = list(VALID)
    broken[3] = _payment(
        "2026-01", "Amazon.de", 200000001.0, "EUR", 12.5, 1.0, 12.5, None, "EUR", 12.5
    )
    with pytest.raises(ReportFormatError, match="accrued - tax"):
        parse_payments(_workbook(*broken))


def test_a_payout_that_is_not_net_times_rate_fails() -> None:
    broken = list(VALID)
    broken[0] = _payment(
        "2026-01", "Amazon.com", 100000000000001.0, "USD", 30.0, 0.0, 30.0, "0.9000", "EUR", 33.0
    )
    with pytest.raises(ReportFormatError, match="net x rate"):
        parse_payments(_workbook(*broken))


def test_a_foreign_currency_payout_without_rate_fails() -> None:
    broken = list(VALID)
    broken[0] = _payment(
        "2026-01", "Amazon.com", 100000000000001.0, "USD", 30.0, 0.0, 30.0, None, "EUR", 27.0
    )
    with pytest.raises(ReportFormatError, match="Wechselkurs"):
        parse_payments(_workbook(*broken))


def test_a_detail_in_another_month_than_its_payment_fails() -> None:
    broken = list(VALID)
    broken[4] = _detail("2026-02", "EUR", 12.5, 0.0, 12.5, "Taschenbuchverkäufe")
    with pytest.raises(ReportFormatError, match="2026-02"):
        parse_payments(_workbook(*broken))


def test_a_payment_without_detail_rows_fails() -> None:
    with pytest.raises(ReportFormatError, match="no detail rows"):
        parse_payments(_workbook(*VALID[:3], VALID[3]))
