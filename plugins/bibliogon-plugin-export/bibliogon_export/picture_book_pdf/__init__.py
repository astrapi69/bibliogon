"""Picture-book PDF generation via WeasyPrint.

The chapter-based pipeline in :mod:`pandoc_runner` cannot render
picture-books — picture-books carry zero chapters and N
:class:`app.models.Page` rows. This package is the parallel path:
WeasyPrint takes a server-rendered HTML+CSS document and produces a
KDP-ready print PDF whose CSS Grid + paged-media match the PageCanvas
layout primitives, so the visual rendering ports cleanly between the
in-app editor and the printable PDF.

Split from the former 1887-line ``picture_book_pdf.py`` god-file. The
implementation lives in focused submodules; this package is the public
barrel plus the :func:`generate_picture_book_pdf` orchestrator:

- :mod:`.styles` — KDP formats, base CSS, per-element style builders.
- :mod:`.layout` — ``layout_config`` readers + layout-class mapping.
- :mod:`.page_renderer` — TipTap + page HTML assembly.
- :mod:`.assets` — asset-id to ``file://`` URI resolution.

The public import surface (``from bibliogon_export.picture_book_pdf
import ...``) is unchanged: every symbol previously defined at module
top level is re-exported here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .assets import _build_assets_map
from .layout import (
    _layout_class,
    _looks_namespaced,
    _read_layout_namespace,
    _read_secondary_image_asset_id,
)
from .page_renderer import (
    _build_html,
    _extract_plain_text,
    _render_page,
    _render_tiptap_doc,
)
from .styles import (
    DEFAULT_PICTURE_BOOK_FORMAT,
    PICTURE_BOOK_FORMATS,
    _format_css,
    _image_layout_style,
    _resolve_picture_book_format,
    _speech_bubble_style,
)

__all__ = [
    "DEFAULT_PICTURE_BOOK_FORMAT",
    "PICTURE_BOOK_FORMATS",
    "generate_picture_book_pdf",
    "_build_assets_map",
    "_build_html",
    "_extract_plain_text",
    "_format_css",
    "_image_layout_style",
    "_layout_class",
    "_looks_namespaced",
    "_read_layout_namespace",
    "_read_secondary_image_asset_id",
    "_render_page",
    "_render_tiptap_doc",
    "_resolve_picture_book_format",
    "_speech_bubble_style",
]


def generate_picture_book_pdf(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    upload_dir: Path,
    output_path: Path,
    picture_book_format: str = DEFAULT_PICTURE_BOOK_FORMAT,
    picture_book_bleed_marks: bool = False,
) -> Path:
    """Render a picture-book to PDF via WeasyPrint.

    Args:
        book_data: Book ORM-as-dict (id, title, author, language,
            etc.). The chapter-based pipeline's _serialize_book
            shape is reused for consistency.
        pages: List of page dicts (PageOut-shaped: id, position,
            layout, text_content, image_asset_id, layout_config).
            Caller MUST sort by position ascending; this function
            doesn't reorder.
        assets: List of asset dicts (id, filename, asset_type,
            path). Same shape as the chapter-based pipeline's
            ``_query_book_data`` returns.
        upload_dir: Root directory for resolving relative asset
            paths to absolute file://-URIs.
        output_path: Where to write the PDF. Caller owns the temp
            dir lifecycle.
        picture_book_format: KDP trim size key (one of the 5
            entries in ``PICTURE_BOOK_FORMATS``). Missing, null,
            empty, or unknown values silently fall back to
            ``DEFAULT_PICTURE_BOOK_FORMAT`` (Q2 gamma-shim
            default-on-read pattern).

    Returns:
        ``output_path`` after WeasyPrint has written the PDF.

    Raises:
        ImportError: when WeasyPrint is not installed (caller
            handles by returning a 500 with an install hint).
        Exception: WeasyPrint internal errors (font missing,
            unresolvable image, etc.) propagate unchanged for the
            caller to wrap in a structured error response.
    """
    # Lazy import: keeps the module importable when WeasyPrint's
    # native deps aren't present in some test/dev environments.
    from weasyprint import HTML  # noqa: PLC0415

    assets_map = _build_assets_map(assets, upload_dir)
    html_str = _build_html(
        book_data,
        pages,
        assets_map,
        picture_book_format,
        picture_book_bleed_marks,
    )
    HTML(string=html_str, base_url=str(upload_dir)).write_pdf(
        target=str(output_path),
    )
    return output_path
