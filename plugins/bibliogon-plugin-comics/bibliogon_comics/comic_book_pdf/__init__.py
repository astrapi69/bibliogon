"""Comic-book PDF generation via WeasyPrint.

Comic-books carry N :class:`app.models.Page` rows with multi-panel
grid layouts and N speech bubbles per panel. This package renders them
to a KDP-ready print PDF, reusing the picture-book KDP format set + CSS
emit helpers + embedded fonts (``plugin-comics`` ``depends_on =
["export"]``; the import direction comics -> export is legitimate).

Split from the former 1262-line ``comic_book_pdf.py`` god-file. The
implementation lives in focused submodules; this package is the public
barrel plus the :func:`generate_comic_book_pdf` orchestrator:

- :mod:`.layout` — comic grid-template resolution.
- :mod:`.bubble_renderer` — bubble CSS + SVG-path geometry + HTML.
- :mod:`.panel_renderer` — panel/page/document HTML assembly.
- :mod:`.assets` — asset-id to ``file://`` URI resolution.

The public import surface (``from bibliogon_comics.comic_book_pdf
import generate_comic_book_pdf``) is unchanged.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .assets import _build_assets_map
from .bubble_renderer import (
    _BUBBLE_TYPE_CSS,
    _bubble_type_style,
    _build_bubble_path,
    _render_bubble_tail_svg,
    _render_comic_bubble,
)
from .layout import (
    _GRID_TEMPLATE_CSS,
    COMIC_GRID_TEMPLATES,
    DEFAULT_COMIC_GRID_TEMPLATE,
    _resolve_comic_grid_template,
)
from .panel_renderer import (
    DEFAULT_PICTURE_BOOK_FORMAT,
    _build_comic_html,
    _render_comic_page,
    _render_comic_panel,
)

__all__ = [
    "COMIC_GRID_TEMPLATES",
    "DEFAULT_COMIC_GRID_TEMPLATE",
    "generate_comic_book_pdf",
    "_BUBBLE_TYPE_CSS",
    "_GRID_TEMPLATE_CSS",
    "_build_assets_map",
    "_build_bubble_path",
    "_build_comic_html",
    "_bubble_type_style",
    "_render_bubble_tail_svg",
    "_render_comic_bubble",
    "_render_comic_page",
    "_render_comic_panel",
    "_resolve_comic_grid_template",
]


def generate_comic_book_pdf(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    panels: list[dict[str, Any]],
    bubbles: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    upload_dir: Path,
    output_path: Path,
    picture_book_format: str = DEFAULT_PICTURE_BOOK_FORMAT,
    picture_book_bleed_marks: bool = False,
) -> Path:
    """Render a comic book to PDF via WeasyPrint.

    Entry point called by plugin-export's ``routes.export()`` after
    branching on ``Book.book_type == "comic_book"``. The dispatch
    is via lazy import (``from bibliogon_comics.comic_book_pdf
    import generate_comic_book_pdf``) inside the route handler so
    plugin-export does NOT need a top-level dependency on
    plugin-comics — keeps the dependency direction one-way
    (plugin-comics ``depends_on = ["export"]``).

    Args:
        book_data: Book ORM-as-dict (id, title, author, language).
        pages: List of Page rows where book_type == "comic_book"
            (loaded by the dispatch site).
        panels: List of ComicPanel rows where page_id in pages.
        bubbles: List of ComicBubble rows where panel_id in panels.
        assets: List of asset rows for image resolution.
        upload_dir: Root for relative asset paths.
        output_path: Where WeasyPrint writes the PDF.
        picture_book_format: One of the 5 KDP trim sizes (Q4 a:
            reuse picture-book formats; comics-specific trim
            sizes deferred). Unknown → default.
        picture_book_bleed_marks: PDF-BLEED-MARKS-01 0.125in bleed
            + crop marks (Q4 reuse decision).

    Returns:
        ``output_path`` after WeasyPrint has written the PDF.
    """
    from weasyprint import HTML  # noqa: PLC0415

    assets_map = _build_assets_map(assets, upload_dir)
    html_str = _build_comic_html(
        book_data,
        pages,
        panels,
        bubbles,
        assets_map,
        picture_book_format=picture_book_format,
        picture_book_bleed_marks=picture_book_bleed_marks,
    )
    HTML(string=html_str, base_url=str(upload_dir)).write_pdf(
        target=str(output_path),
    )
    return output_path
