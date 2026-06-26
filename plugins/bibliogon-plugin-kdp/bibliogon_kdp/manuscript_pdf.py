"""WeasyPrint-based KDP manuscript PDF renderer.

Renders a prose manuscript to a print-ready PDF at a chosen KDP trim
size + margin preset, with optional crop / bleed marks for paperback
and hardcover editions. This is the deferred piece of
KDP-PUBLISHING-WIZARD-01 (#583): the wizard's FormatStep captures the
trim size + margin + format kind, and the package builder now threads
them here so the bundled PDF honours the print specification instead of
a fixed default.

Page geometry is controlled through CSS Paged Media - the same
mechanism plugin-export's ``picture_book_pdf`` uses:
``@page { size; margin; bleed; marks }``. The page-CSS builder is a
pure function so the page size can be unit-tested without rendering a
real PDF (WeasyPrint's native deps are absent in CI; see
``plugins/bibliogon-plugin-export/tests/test_picture_book_pdf.py`` for
the same testing pattern).
"""

from __future__ import annotations

import html as html_lib
from pathlib import Path
from typing import Any

# --- KDP standard print trim sizes (inches) ---
#
# Mirrors the wizard's FormatStep ``TRIM_SIZES`` (frontend
# ``machines/types.ts`` ``KdpTrimSize``). The inches-tuple convention
# matches plugin-export's ``PICTURE_BOOK_FORMATS`` so the two PDF
# pipelines describe page geometry the same way.
KDP_TRIM_SIZES: dict[str, tuple[float, float]] = {
    "5x8": (5.0, 8.0),
    "5.25x8": (5.25, 8.0),
    "5.5x8.5": (5.5, 8.5),
    "6x9": (6.0, 9.0),
    "7x10": (7.0, 10.0),
    "8.5x11": (8.5, 11.0),
}
DEFAULT_KDP_TRIM = "6x9"

# Margin presets (inches). KDP's minimum inside / outside margins scale
# with page count; these conservative presets clear KDP's largest
# (>550 pages) inside-margin recommendation at "wide".
KDP_MARGINS: dict[str, float] = {
    "narrow": 0.5,
    "normal": 0.75,
    "wide": 1.0,
}
DEFAULT_KDP_MARGIN = "normal"

# KDP bleed dimension is 0.125in (3 mm), uniform across all trims -
# identical to plugin-export's picture-book pipeline.
_BLEED_MM = 3.0


def resolve_kdp_trim(trim_id: str | None) -> tuple[str, float, float]:
    """Resolve a trim id to ``(canonical_id, width_in, height_in)``.

    Falls back silently to :data:`DEFAULT_KDP_TRIM` on missing, null,
    empty, or unknown values (same default-on-read shim as
    ``picture_book_pdf._resolve_picture_book_format``). The canonical id
    is what callers use for filename suffixes; the dimensions feed the
    CSS emit.
    """
    if isinstance(trim_id, str) and trim_id in KDP_TRIM_SIZES:
        width_in, height_in = KDP_TRIM_SIZES[trim_id]
        return trim_id, width_in, height_in
    width_in, height_in = KDP_TRIM_SIZES[DEFAULT_KDP_TRIM]
    return DEFAULT_KDP_TRIM, width_in, height_in


def resolve_kdp_margin(margin_id: str | None) -> float:
    """Resolve a margin preset id to inches; default on unknown."""
    if isinstance(margin_id, str) and margin_id in KDP_MARGINS:
        return KDP_MARGINS[margin_id]
    return KDP_MARGINS[DEFAULT_KDP_MARGIN]


def build_kdp_page_css(
    trim_id: str | None,
    margin_id: str | None,
    bleed_marks: bool = False,
) -> str:
    """Build the ``@page`` CSS block for a KDP manuscript PDF.

    Emits ``@page { size: <w>in <h>in; margin: <m>in; }`` plus, when
    ``bleed_marks`` is set (paperback / hardcover), ``bleed: 3mm;
    marks: crop;`` so WeasyPrint draws crop marks at the trim-box
    corners. The trim box stays at ``<w>in <h>in``; the bleed sits
    outside it per the CSS Paged Media spec, so the printable margin is
    unchanged.

    Args:
        trim_id: KDP trim id (one of :data:`KDP_TRIM_SIZES`). Unknown
            values fall back to :data:`DEFAULT_KDP_TRIM`.
        margin_id: margin preset (``narrow`` / ``normal`` / ``wide``).
            Unknown values fall back to :data:`DEFAULT_KDP_MARGIN`.
        bleed_marks: append the bleed + crop-marks rules (print only).

    Returns:
        The ``@page { ... }`` CSS as a string.
    """
    _id, width_in, height_in = resolve_kdp_trim(trim_id)
    margin_in = resolve_kdp_margin(margin_id)
    bleed_block = f"  bleed: {_BLEED_MM}mm;\n  marks: crop;\n" if bleed_marks else ""
    return (
        "@page {\n"
        f"  size: {width_in}in {height_in}in;\n"
        f"  margin: {margin_in}in;\n"
        f"{bleed_block}"
        "}\n"
    )


# Print-manuscript body styling. Serif body, chapter headings start a
# fresh page (except the first, so the manuscript doesn't open with a
# blank leaf), images never overflow the printable width.
_BODY_CSS = """
body { font-family: serif; font-size: 11pt; line-height: 1.5; }
h1 { font-size: 20pt; page-break-before: always; margin-top: 0; }
h1:first-of-type { page-break-before: avoid; }
h2 { font-size: 15pt; }
h3 { font-size: 13pt; }
img { max-width: 100%; }
"""


def _chapters_to_html(chapters: list[dict[str, Any]]) -> str:
    """Render TipTap-JSON chapters to an HTML body.

    Reuses plugin-export's ``tiptap_to_markdown`` converter and the
    ``markdown`` library (both already in the runtime), keeping a single
    TipTap-to-markup path rather than a second bespoke converter.
    Chapters are emitted in ``position`` order, each wrapped in a
    ``<section>`` with an ``<h1>`` title.
    """
    import markdown as markdown_lib
    from bibliogon_export.tiptap_to_md import tiptap_to_markdown

    sections: list[str] = []
    for chapter in sorted(chapters, key=lambda c: c.get("position") or 0):
        title = chapter.get("title") or ""
        content = chapter.get("content")
        body_md = tiptap_to_markdown(content) if isinstance(content, dict) else ""
        body_html = markdown_lib.markdown(body_md or "", extensions=["extra"])
        heading = f"<h1>{html_lib.escape(title)}</h1>" if title else ""
        sections.append(f"<section>{heading}\n{body_html}</section>")
    return "\n".join(sections)


def render_manuscript_pdf(
    book_data: dict[str, Any],
    chapters: list[dict[str, Any]],
    output_path: Path,
    *,
    trim_id: str | None,
    margin_id: str | None,
    bleed_marks: bool,
) -> Path:
    """Render a prose manuscript to a print-ready PDF via WeasyPrint.

    Args:
        book_data: Book ORM-as-dict (title is used for the document
            ``<title>``).
        chapters: TipTap-JSON chapter dicts (``title`` / ``content`` /
            ``position``). Order is resolved internally by position.
        output_path: where to write the PDF. The caller owns the temp
            dir lifecycle.
        trim_id: KDP trim id; unknown values fall back to ``6x9``.
        margin_id: margin preset; unknown values fall back to
            ``normal``.
        bleed_marks: emit crop / bleed marks (paperback / hardcover).

    Returns:
        ``output_path`` after WeasyPrint has written the PDF.

    Raises:
        ImportError: when WeasyPrint (or ``markdown``) is not installed.
    """
    from weasyprint import HTML

    page_css = build_kdp_page_css(trim_id, margin_id, bleed_marks)
    body_html = _chapters_to_html(chapters)
    title = html_lib.escape(book_data.get("title") or "")
    html_doc = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title>"
        f"<style>{page_css}{_BODY_CSS}</style></head>"
        f"<body>{body_html}</body></html>"
    )
    HTML(string=html_doc).write_pdf(target=str(output_path))
    return output_path
