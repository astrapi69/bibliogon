"""Sheet-count pin for comic-book PDF grid templates (#793).

One comic page must render as exactly one printed sheet. For a fixed-trim
print book the sheet count has to match the page count, so a template that
overflows gives the author stray extra sheets with panels pushed onto them,
and nothing in the pipeline says so.

The assertion counts PDF page objects, not DOM nodes: WeasyPrint decides
where a page break lands, so only the rendered output can answer this
(``Playwright-visible != user-visible``, applied to print).
"""

from __future__ import annotations

import re
import zlib
from pathlib import Path

import pytest
from bibliogon_comics.comic_book_pdf import COMIC_GRID_TEMPLATES, generate_comic_book_pdf

#: Panels each template expects to fill. Mirrors the comment on
#: ``_GRID_TEMPLATE_CSS``; the walker renders whatever rows exist, so the
#: full count is the worst case for row height.
TEMPLATE_PANELS = {
    "single_panel": 1,
    "grid_1x2": 2,
    "grid_2x1": 2,
    "grid_2x2": 4,
    "grid_2x3": 6,
    "grid_3x2": 6,
    "grid_3x3": 9,
}


def _sheet_count(pdf_bytes: bytes) -> int:
    """Number of page objects in the PDF (``/Type /Pages`` excluded).

    WeasyPrint writes PDF 1.5+ compressed object streams, so the page
    dictionaries sit inside zlib-compressed streams rather than in the raw
    bytes - hence the decompress pass. Same helper shape as
    ``test_picture_book_pdf.py``.
    """
    count = 0
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", pdf_bytes, re.S):
        try:
            data = zlib.decompress(match.group(1).strip(b"\r\n"))
        except zlib.error:
            continue
        count += len(re.findall(rb"/Type\s*/Page(?![s])", data))
    return count


def _painted_rects(pdf_bytes: bytes) -> list[tuple[float, float, float, float]]:
    """Every ``re`` rectangle in the content streams as (x, y, w, h)."""
    rects: list[tuple[float, float, float, float]] = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", pdf_bytes, re.S):
        raw = match.group(1)
        try:
            data = zlib.decompress(raw.strip(b"\r\n"))
        except zlib.error:
            data = raw
        for line in data.decode("latin1", errors="replace").splitlines():
            parts = line.split()
            if line.endswith(" re") and len(parts) == 5:
                try:
                    rects.append(tuple(float(v) for v in parts[:4]))  # type: ignore[arg-type]
                except ValueError:
                    continue
    return rects


def _write_panel_image(path: Path) -> None:
    """A landscape image, which is the shape that overflows a tall row."""
    from PIL import Image

    Image.new("RGB", (1200, 800), (40, 80, 160)).save(path, "PNG")


def _fixture(tmp_path: Path, template: str, panel_count: int) -> dict[str, object]:
    image = tmp_path / "panel.png"
    _write_panel_image(image)
    page_id = "page-1"
    panels = [
        {
            "id": f"panel-{index}",
            "page_id": page_id,
            "position": index,
            "image_asset_id": "asset-1",
            "panel_config": {},
        }
        for index in range(panel_count)
    ]
    return {
        "book_data": {"id": "book-1", "title": "Sheet Count", "author": "A", "language": "de"},
        "pages": [
            {
                "id": page_id,
                "book_id": "book-1",
                "position": 0,
                "layout": "comic_panel_grid",
                "layout_config": {"comic_grid_template": template},
            }
        ],
        "panels": panels,
        "bubbles": [
            {
                "id": "bubble-1",
                "panel_id": "panel-0",
                "position": 0,
                "text": "Hallo!",
                "bubble_type": "speech",
                "anchor_x": 50,
                "anchor_y": 20,
            }
        ],
        "assets": [{"id": "asset-1", "path": str(image)}],
    }


@pytest.mark.parametrize("template", COMIC_GRID_TEMPLATES)
def test_one_comic_page_renders_on_exactly_one_sheet(tmp_path: Path, template: str) -> None:
    """#793: grid_2x1 and grid_3x2 spilled onto a second sheet.

    Both have cells wider than their siblings at the same row count
    (1 column at 2 rows, 2 columns at 3 rows), so the intrinsic height of
    a full-width image exceeded the row's share of the page. ``1fr`` is
    ``minmax(auto, 1fr)``, so that intrinsic height raised the row instead
    of being clipped by it.
    """
    fixture = _fixture(tmp_path, template, TEMPLATE_PANELS[template])
    output = tmp_path / f"{template}.pdf"
    generate_comic_book_pdf(
        fixture["book_data"],  # type: ignore[arg-type]
        fixture["pages"],  # type: ignore[arg-type]
        fixture["panels"],  # type: ignore[arg-type]
        fixture["bubbles"],  # type: ignore[arg-type]
        fixture["assets"],  # type: ignore[arg-type]
        upload_dir=tmp_path,
        output_path=output,
    )
    pdf = output.read_bytes()
    assert _sheet_count(pdf) == 1

    # One sheet is also what a collapsed grid produces, so check the panels
    # still fill the page. Panel borders are painted rectangles; their union
    # must cover most of the sheet in both directions.
    rects = [r for r in _painted_rects(pdf) if r[2] > 1 and r[3] > 1]
    assert rects, "no painted panel borders"
    spread_x = max(x + w for x, _, w, _ in rects) - min(x for x, _, _, _ in rects)
    spread_y = max(y + h for _, y, _, h in rects) - min(y for _, y, _, _ in rects)
    assert spread_x > 300, f"panels span only {spread_x:.0f}pt horizontally"
    assert spread_y > 300, f"panels span only {spread_y:.0f}pt vertically"
