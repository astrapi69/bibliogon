"""Minimal XLSX writer for tests (#1132), standard library only.

Committing binary workbooks would hide their content from review and
from the fixture guard, so tests build them from plain rows instead.
Cell values: ``str`` becomes an inline string, ``int``/``float`` a
number, ``datetime.date`` a date-formatted serial, ``bool`` a boolean.
"""

from __future__ import annotations

import io
import zipfile
from datetime import date, datetime
from xml.sax.saxutils import escape

EPOCH = date(1899, 12, 30)

_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
{sheets}
</Types>"""
_ROOT_RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""
_STYLES = """<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>
</styleSheet>"""
_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _column(index: int) -> str:
    name = ""
    index += 1
    while index:
        index, rest = divmod(index - 1, 26)
        name = chr(65 + rest) + name
    return name


def _cell(ref: str, value: object) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return f'<c r="{ref}" t="b"><v>{int(value)}</v></c>'
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return f'<c r="{ref}" s="1"><v>{(value - EPOCH).days}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value!r}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def _sheet_xml(rows: list[list[object]]) -> str:
    body = []
    for r, row in enumerate(rows, start=1):
        cells = "".join(_cell(f"{_column(c)}{r}", v) for c, v in enumerate(row))
        body.append(f'<row r="{r}">{cells}</row>')
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="{_MAIN}"><sheetData>{"".join(body)}</sheetData></worksheet>'


def build_xlsx(sheets: dict[str, list[list[object]]]) -> bytes:
    """Return the bytes of a workbook with one worksheet per entry."""
    names = list(sheets)
    workbook = (
        f'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="{_MAIN}" xmlns:r="{_REL}"><sheets>'
        + "".join(
            f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>'
            for i, n in enumerate(names, start=1)
        )
        + "</sheets></workbook>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(
            f'<Relationship Id="rId{i}" Type="{_REL}/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(names) + 1)
        )
        + f'<Relationship Id="rId{len(names) + 1}" Type="{_REL}/styles" Target="styles.xml"/>'
        + "</Relationships>"
    )
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for i in range(1, len(names) + 1)
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _CONTENT_TYPES.format(sheets=overrides))
        archive.writestr("_rels/.rels", _ROOT_RELS)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", rels)
        archive.writestr("xl/styles.xml", _STYLES)
        for i, name in enumerate(names, start=1):
            archive.writestr(f"xl/worksheets/sheet{i}.xml", _sheet_xml(sheets[name]))
    return buffer.getvalue()


def rows_from_csv(text: str) -> list[list[object]]:
    """Header plus data rows of a fixture CSV, numbers kept as numbers."""
    import csv

    rows: list[list[object]] = []
    for index, cells in enumerate(csv.reader(io.StringIO(text))):
        rows.append(cells if index == 0 else [_typed(cell) for cell in cells])
    return rows


def _typed(cell: str) -> object:
    for kind in (int, float):
        try:
            return kind(cell)
        except ValueError:
            continue
    return cell
