"""Read a report download into numbered rows of text cells (#1129, #1132).

Two sources, one contract. CSV is read as text; XLSX through
``python-calamine`` and every cell converted to the text the strict
cell parsers in ``money`` expect. A cell whose value cannot be stated
as text without guessing (a boolean, a time of day) fails with its row
and column.

The header is the first of the first :data:`HEADER_SEARCH_ROWS` rows
that contains every required column, so a report-period line above the
table is skipped. When no row qualifies, the first row is checked as
the header and its unknown and missing columns are reported - the same
loud failure as before.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime

from bibliogon_kdp.finance.columns import ColumnContract

HEADER_SEARCH_ROWS = 10
_ZIP_MAGIC = b"PK\x03\x04"

Cell = object
Row = dict[str, str]


class TableError(ValueError):
    """The download cannot be read as a table matching its contract."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("; ".join(problems))


@dataclass
class TableRows:
    """Data rows keyed by header, numbered as in the file (1-based)."""

    rows: list[tuple[int, Row]]
    header_row: int
    sheet: str | None


def read_table(raw: bytes, contract: ColumnContract, sheet: str | None = None) -> TableRows:
    """Locate the header and return the non-blank data rows.

    Raises:
        TableError: For an unreadable file, an ambiguous or unknown
            sheet, a header outside the contract or a malformed row.
    """
    if raw.startswith(_ZIP_MAGIC):
        grid, sheet_name = _xlsx_grid(raw, sheet)
    else:
        grid, sheet_name = _csv_grid(raw), None
    if not any(_filled(row) for row in grid):
        raise TableError(["report has no data rows"])
    index = _header_index(grid, contract)
    headers = _trim([_header_text(cell) for cell in grid[index]])
    _check_headers(headers, contract)
    rows = _data_rows(grid, index, headers, strict_width=sheet_name is None)
    if not rows:
        raise TableError(["report has no data rows"])
    return TableRows(rows=rows, header_row=index + 1, sheet=sheet_name)


def _csv_grid(raw: bytes) -> list[list[Cell]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise TableError([f"file is neither a workbook nor UTF-8 text: {exc}"]) from exc
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    widest = max(lines[: HEADER_SEARCH_ROWS + 1], key=len)
    delimiter = max((",", ";", "\t"), key=widest.count)
    return [list(cells) for cells in csv.reader(io.StringIO(text), delimiter=delimiter)]


def _xlsx_grid(raw: bytes, sheet: str | None) -> tuple[list[list[Cell]], str]:
    from python_calamine import CalamineError, CalamineWorkbook

    try:
        workbook = CalamineWorkbook.from_filelike(io.BytesIO(raw))
        name = _pick_sheet(list(workbook.sheet_names), sheet)
        grid = workbook.get_sheet_by_name(name).to_python(skip_empty_area=False)
    except TableError:
        raise
    except (CalamineError, OSError, ValueError) as exc:
        raise TableError([f"not a readable workbook: {exc}"]) from exc
    return [list(row) for row in grid], name


def _pick_sheet(names: list[str], sheet: str | None) -> str:
    if sheet is not None:
        if sheet not in names:
            raise TableError([f"sheet {sheet!r} not found; the workbook has: {', '.join(names)}"])
        return sheet
    if len(names) == 1:
        return names[0]
    raise TableError(
        [f"the workbook has several sheets, name one with 'sheet': {', '.join(names)}"]
    )


def _header_text(cell: Cell) -> str:
    return cell.strip() if isinstance(cell, str) else ("" if cell is None else str(cell))


def _trim(cells: list[str]) -> list[str]:
    while cells and not cells[-1]:
        cells = cells[:-1]
    return cells


def _filled(row: list[Cell]) -> bool:
    return any(_header_text(cell) for cell in row)


def _header_index(grid: list[list[Cell]], contract: ColumnContract) -> int:
    first_filled = next(i for i, row in enumerate(grid) if _filled(row))
    for index, row in enumerate(grid[:HEADER_SEARCH_ROWS]):
        names = {_header_text(cell) for cell in row}
        if set(contract.required) <= names:
            return index
    return first_filled


def _check_headers(headers: list[str], contract: ColumnContract) -> None:
    problems = []
    unknown = [h for h in headers if h not in contract.known()]
    if unknown:
        problems.append(f"unknown column(s) for {contract.kind}: {', '.join(unknown)}")
    missing = [h for h in contract.required if h not in headers]
    if missing:
        problems.append(f"missing required column(s) for {contract.kind}: {', '.join(missing)}")
    duplicates = sorted({h for h in headers if headers.count(h) > 1})
    if duplicates:
        problems.append(f"duplicate column(s): {', '.join(duplicates)}")
    if problems:
        raise TableError(problems)


def _data_rows(
    grid: list[list[Cell]], index: int, headers: list[str], *, strict_width: bool
) -> list[tuple[int, Row]]:
    rows, problems = [], []
    for number, cells in enumerate(grid[index + 1 :], start=index + 2):
        if not _filled(cells):
            continue
        try:
            rows.append((number, _row(cells, headers, strict_width)))
        except ValueError as exc:
            problems.append(f"row {number}: {exc}")
    if problems:
        raise TableError(problems)
    return rows


def _row(cells: list[Cell], headers: list[str], strict_width: bool) -> Row:
    width = len(headers)
    if strict_width and len(cells) != width:
        raise ValueError(f"{len(cells)} cells, header has {width}")
    stray = [c for c in cells[width:] if _header_text(c)]
    if stray:
        raise ValueError(f"value(s) outside the header columns: {stray!r}")
    padded = list(cells[:width]) + [""] * (width - len(cells))
    return {name: cell_text(cell, name) for name, cell in zip(headers, padded, strict=True)}


def cell_text(cell: Cell, column: str) -> str:
    """Text form of one cell, exact for the types a report carries.

    Raises:
        ValueError: For a boolean or any type without an exact text form.
    """
    if cell is None:
        return ""
    if isinstance(cell, str):
        return cell.strip()
    if isinstance(cell, bool):
        raise ValueError(f"{column}: a true/false cell is not a value of this column")
    if isinstance(cell, int):
        return str(cell)
    if isinstance(cell, float):
        return str(int(cell)) if cell.is_integer() else repr(cell)
    if isinstance(cell, datetime):
        return cell.isoformat(timespec="seconds")
    if isinstance(cell, date):
        return cell.isoformat()
    raise ValueError(f"{column}: unsupported cell value {cell!r}")
