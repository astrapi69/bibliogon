"""XLSX downloads go through the same contract as CSV (#1132)."""

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from bibliogon_kdp.finance.parsing import ReportFormatError, parse_report

from tests.xlsx_builder import build_xlsx, rows_from_csv

FIXTURES = Path(__file__).parent / "fixtures" / "finance"


def _rows(name: str) -> list[list[object]]:
    return rows_from_csv((FIXTURES / name).read_text(encoding="utf-8"))


def test_an_xlsx_sheet_yields_the_same_records_as_its_csv() -> None:
    from_csv = parse_report(
        "kdp_royalty", (FIXTURES / "royalty-ebook-2026-01.csv").read_bytes(), book_format="ebook"
    )
    from_xlsx = parse_report(
        "kdp_royalty",
        build_xlsx({"eBook Royalty": _rows("royalty-ebook-2026-01.csv")}),
        book_format="ebook",
    )
    assert from_xlsx.revenue == from_csv.revenue
    assert from_xlsx.sheet == "eBook Royalty"


def test_numeric_isbn_and_date_cells_are_read_exactly() -> None:
    rows = _rows("kenp-2026-01-02.csv")
    rows[1][0] = date(2026, 1, 15)
    paperback = _rows("royalty-paperback-2026-01.csv")
    kenp = parse_report("kdp_kenp", build_xlsx({"KENP Read": rows}))
    assert kenp.revenue[0].month == "2026-01"
    royalty = parse_report(
        "kdp_royalty", build_xlsx({"Paperback": paperback}), book_format="paperback"
    )
    assert royalty.revenue[0].isbn == "9780000000002"
    assert royalty.revenue[0].royalty == Decimal("13.98")


def test_a_workbook_with_several_sheets_needs_a_sheet_name() -> None:
    workbook = build_xlsx(
        {
            "Summary": [["nothing"]],
            "eBook Royalty": _rows("royalty-ebook-2026-01.csv"),
        }
    )
    with pytest.raises(ReportFormatError, match="Summary, eBook Royalty"):
        parse_report("kdp_royalty", workbook, book_format="ebook")
    parsed = parse_report("kdp_royalty", workbook, book_format="ebook", sheet="eBook Royalty")
    assert len(parsed.revenue) == 3


def test_an_unknown_sheet_name_lists_the_available_ones() -> None:
    workbook = build_xlsx({"eBook Royalty": _rows("royalty-ebook-2026-01.csv")})
    with pytest.raises(ReportFormatError, match="eBook Royalty"):
        parse_report("kdp_royalty", workbook, book_format="ebook", sheet="Paperback")


def test_preamble_rows_above_the_header_are_skipped_and_reported() -> None:
    rows = [["Sales Period: January 2026"], [], *_rows("royalty-ebook-2026-01.csv")]
    parsed = parse_report("kdp_royalty", build_xlsx({"eBook": rows}), book_format="ebook")
    assert parsed.header_row == 3
    assert len(parsed.revenue) == 3


def test_a_csv_with_a_preamble_row_is_read_the_same_way() -> None:
    raw = (
        b"Sales Period: January 2026\n" + (FIXTURES / "royalty-paperback-2026-01.csv").read_bytes()
    )
    parsed = parse_report("kdp_royalty", raw, book_format="paperback")
    assert parsed.header_row == 2
    assert parsed.revenue[0].royalty == Decimal("13.98")


def test_a_renamed_column_still_fails_with_its_name() -> None:
    rows = _rows("royalty-ebook-2026-01.csv")
    rows[0] = ["Royalties" if cell == "Royalty" else cell for cell in rows[0]]
    with pytest.raises(ReportFormatError) as excinfo:
        parse_report("kdp_royalty", build_xlsx({"eBook": rows}), book_format="ebook")
    assert "Royalties" in str(excinfo.value)
    assert "missing" in str(excinfo.value)


def test_a_boolean_cell_fails_with_row_and_column() -> None:
    rows = _rows("royalty-ebook-2026-01.csv")
    rows[2][rows[0].index("Units Sold")] = True
    with pytest.raises(ReportFormatError, match=r"row 3.*Units Sold"):
        parse_report("kdp_royalty", build_xlsx({"eBook": rows}), book_format="ebook")


def test_a_value_outside_the_header_width_fails() -> None:
    rows = _rows("royalty-paperback-2026-01.csv")
    rows[1].append("stray")
    with pytest.raises(ReportFormatError, match="row 2"):
        parse_report("kdp_royalty", build_xlsx({"P": rows}), book_format="paperback")


def test_a_damaged_workbook_fails_loudly() -> None:
    with pytest.raises(ReportFormatError, match="workbook"):
        parse_report("kdp_royalty", b"PK\x03\x04 not really a zip", book_format="ebook")
