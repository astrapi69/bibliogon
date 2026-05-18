"""Picture-book PDF generation via WeasyPrint (PB-PHASE4 Session 6).

The chapter-based pipeline in :mod:`pandoc_runner` cannot render
picture-books — picture-books carry zero chapters and N
:class:`app.models.Page` rows. This module is the parallel path:
WeasyPrint takes a server-rendered HTML+CSS document and produces
KDP-ready print PDF. CSS Grid + paged-media match Session 4c's
PageCanvas layout primitives so the visual rendering ports
cleanly between the in-app editor and the printable PDF.

D3 MVP scope (Session 6 Pre-Inspection): 8.5×8.5 square only. RGB
color, 0.5" safe-area margins, no bleed marks. Atkinson Hyperlegible
font (OFL-licensed, embedded). Multi-format support (8×10, 8.5×11,
landscape, with-bleed) deferred to
``PICTURE-BOOK-PDF-KDP-FORMATS-01`` + ``...BLEED-MARKS-01``.

Commit 1 (this commit) ships the SKELETON: renders N picture-book
pages from the ``pages`` list, one per ``@page`` break. NO front-
matter (cover + title page) and NO PDF-metadata embedding yet —
those land in Commit 3.

D7 closure: the dead ``kinderbuch.css`` template at
``plugins/bibliogon-plugin-kinderbuch/.../templates/kinderbuch.css``
was deleted in this commit. That template was authored
speculatively for a never-materialised EPUB pipeline + used
hyphenated layout names (``image-top-text-bottom``) while the
backend schema uses underscores (``image_top_text_bottom``). It
was the 4th documented instance of the half-wired-feature-
lifecycle pattern (file exists, NO consumer). Clean replacement
ships fresh here.
"""

from __future__ import annotations

import json
from html import escape
from pathlib import Path
from typing import Any

from bibliogon_export.picture_book_fonts import font_face_css

# WeasyPrint is imported lazily inside generate_picture_book_pdf
# so the rest of the plugin (chapter-based pipeline) stays
# importable when WeasyPrint's native dependencies are missing.
# Tests that don't exercise the PDF generator path don't pay the
# load cost either.


# --- CSS rendering ---


_BASE_CSS = """
/* PB-PHASE4 Session 6 picture-book PDF CSS.
 * Matches Session 4c PageCanvas layout primitives so the
 * in-editor view + the printed PDF render the same spatial
 * decisions. Mirror, not duplicate: the editor's
 * .module.css is the source of truth for the in-app render;
 * this CSS is the print-render of the same model.
 */

@page {
    size: 8.5in 8.5in;
    margin: 0.5in;
}

/* PB-PHASE4 Session 4c-B-1 Finding G3 (2026-05-19): the
 * @font-face rules for the 5 OFL fonts are now BUILT
 * DYNAMICALLY by ``picture_book_fonts.font_face_css()`` and
 * concatenated below this static block at render-time. They
 * use ``src: url(file://...)`` pointing at the bundled font
 * files under ``../fonts/`` for KDP-grade embedded fonts
 * (D10). Pre-Finding-G code shipped a single hardcoded
 * @font-face for Atkinson Hyperlegible with ``src: local()``
 * — fragile in containers without the font installed. */

html, body {
    margin: 0;
    padding: 0;
    font-family: "Atkinson Hyperlegible", "Andika", sans-serif;
    font-size: 16pt;
    line-height: 1.4;
    color: black;
    background: white;
}

.page {
    page-break-after: always;
    width: 100%;
    height: 7.5in;  /* 8.5in - 2 * 0.5in margin */
    display: grid;
    position: relative;
    overflow: hidden;
}

.page:last-child {
    page-break-after: auto;
}

.region {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
}

.region-image {
    grid-area: image;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.region-text {
    grid-area: text;
    display: flex;
    flex-direction: column;
    padding: 12pt;
}

.region-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

/* --- Per-layout grid templates --- */

.page--image_top_text_bottom {
    grid-template-areas:
        "image"
        "text";
    grid-template-columns: 1fr;
    grid-template-rows: 70% 30%;
}

.page--image_top_text_bottom .region-image {
    border-bottom: 1pt solid #ccc;
}

.page--image_left_text_right {
    grid-template-areas: "image text";
    grid-template-columns: 60% 40%;
    grid-template-rows: 1fr;
}

.page--image_left_text_right .region-image {
    border-right: 1pt solid #ccc;
}

.page--image_full_text_overlay,
.page--speech_bubble {
    grid-template-areas: "image";
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
}

.page--image_full_text_overlay .region-image img,
.page--speech_bubble .region-image img {
    object-fit: cover;
}

.page--image_full_text_overlay .region-text {
    grid-area: unset;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.45);
    color: white;
    padding: 14pt 18pt;
    max-height: 35%;
}

.page--speech_bubble .region-text {
    grid-area: unset;
    position: absolute;
    width: 40%;
    background: white;
    color: black;
    padding: 10pt 14pt;
    border-radius: 16pt;
    box-shadow: 0 2pt 8pt rgba(0, 0, 0, 0.18);
    bottom: 16pt;
    left: 50%;
    transform: translateX(-50%);
}

.page--text_only {
    grid-template-areas: "text";
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
}

.page--text_only .region-text {
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24pt 32pt;
}
"""


def _layout_class(layout: str) -> str:
    """Map the PageLayout enum string to its CSS class."""
    valid = {
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
    }
    if layout not in valid:
        # Defensive default: fall back to the most generic layout.
        return "page--image_top_text_bottom"
    return f"page--{layout}"


def _speech_bubble_style(config: dict[str, Any] | None) -> str:
    """Compute the inline-style for a speech_bubble page's bubble.

    Mirrors PageCanvas.tsx's speechBubbleInlineStyle so the
    in-editor view + the printed PDF render the same bubble
    position + opacity + size. anchor_position default is
    bottom-center (Session 4 D2a).
    """
    if not isinstance(config, dict):
        config = {}
    anchor_raw = config.get("anchor_position")
    anchor = (
        anchor_raw
        if isinstance(anchor_raw, str)
        else "bottom-center"
    )
    opacity_raw = config.get("opacity")
    if isinstance(opacity_raw, (int, float)):
        opacity = max(0.3, min(1.0, float(opacity_raw)))
    else:
        opacity = 1.0
    size_raw = config.get("size")
    if isinstance(size_raw, (int, float)):
        size_pct = max(20, min(60, int(size_raw)))
    else:
        size_pct = 40

    bg = f"rgba(255, 255, 255, {opacity})"
    width = f"width: {size_pct}%;"

    reset = "top: auto; right: auto; bottom: auto; left: auto;"
    positions = {
        "top-left": "top: 16pt; left: 16pt; transform: none;",
        "top-right": "top: 16pt; right: 16pt; transform: none;",
        "bottom-left": "bottom: 16pt; left: 16pt; transform: none;",
        "bottom-right": "bottom: 16pt; right: 16pt; transform: none;",
        "center": (
            "top: 50%; left: 50%; transform: translate(-50%, -50%);"
        ),
        "bottom-center": (
            "bottom: 16pt; left: 50%; transform: translateX(-50%);"
        ),
    }
    pos = positions.get(anchor, positions["bottom-center"])
    return f"{reset} {pos} background: {bg}; {width}"


def _image_layout_style(layout: str, config: dict[str, Any] | None) -> dict[str, str]:
    """Compute inline-style overrides for non-speech-bubble layouts.

    Returns a dict with keys 'canvas_style', 'region_image_style',
    'image_style', 'region_text_style' — only the relevant ones
    per layout are non-empty. Mirrors PageCanvas.tsx's per-layout
    inline style derivation.
    """
    if not isinstance(config, dict):
        config = {}
    canvas_style = ""
    region_image_style = ""
    image_style = ""
    region_text_style = ""

    if layout == "image_top_text_bottom":
        pos = config.get("image_position")
        if pos == "left":
            region_image_style = "justify-content: flex-start;"
        elif pos == "right":
            region_image_style = "justify-content: flex-end;"
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"

    elif layout == "image_left_text_right":
        ratio_raw = config.get("split_ratio")
        ratio = (
            max(50, min(70, int(ratio_raw)))
            if isinstance(ratio_raw, (int, float))
            else 60
        )
        canvas_style = f"grid-template-columns: {ratio}% {100 - ratio}%;"
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"

    elif layout == "image_full_text_overlay":
        pos = config.get("text_position")
        opacity_raw = config.get("text_backdrop_opacity")
        opacity = (
            max(0.3, min(0.8, float(opacity_raw)))
            if isinstance(opacity_raw, (int, float))
            else 0.45
        )
        bg = f"background: rgba(0, 0, 0, {opacity});"
        if pos == "top":
            region_text_style = f"top: 0; bottom: auto; {bg}"
        elif pos == "middle":
            region_text_style = (
                f"top: 50%; bottom: auto; transform: translateY(-50%); max-height: 70%; {bg}"
            )
        else:
            region_text_style = f"top: auto; bottom: 0; {bg}"

    return {
        "canvas_style": canvas_style,
        "region_image_style": region_image_style,
        "image_style": image_style,
        "region_text_style": region_text_style,
    }


def _extract_plain_text(text_content: str | None) -> str:
    """Defensive plain-text extraction from a ``page.text_content``
    value that may be a legacy plain string OR a JSON-shaped TipTap
    document.

    Mirrors the frontend ``extractPlainText`` helper in
    ``frontend/src/components/PageCanvas.tsx``. Same lossy-extraction
    semantics: walk the TipTap doc, harvest every ``text`` field,
    join paragraph boundaries with newlines. Formatting marks
    (bold/italic/heading-level/etc.) are dropped — the PDF render
    in this MVP path emits plain text. A future
    ``PICTURE-BOOK-PDF-TIPTAP-RENDER-01`` (P3) backlog item builds a
    proper TipTap-to-HTML walker that surfaces bold/italic/headings
    as ``<strong>``/``<em>``/``<h*>`` in the printed PDF.

    Why this helper exists: PB-PHASE4 Session 4c-B-1 introduced
    TipTap rich-text editing for 3 picture-book layouts
    (image_top_text_bottom, image_left_text_right, text_only).
    Those layouts persist ``text_content`` as a JSON-serialized
    TipTap doc. Without this defensive read, the PDF generator
    would emit the raw JSON string inside ``<p>``, showing the
    user something like ``{"type":"doc","content":[...]}``
    instead of their authored text. The frontend Tier-Property
    branch has the same issue (textarea displays raw JSON);
    fixed there too via the same shape of helper.
    """
    if not text_content:
        return ""
    stripped = text_content.lstrip()
    if not stripped.startswith("{"):
        return text_content
    try:
        parsed = json.loads(text_content)
    except (json.JSONDecodeError, TypeError):
        return text_content
    if not isinstance(parsed, dict) or parsed.get("type") != "doc":
        return text_content

    pieces: list[str] = []

    def _walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        node_type = node.get("type")
        if node_type == "text" and isinstance(node.get("text"), str):
            pieces.append(node["text"])
            return
        children = node.get("content")
        if isinstance(children, list):
            before = len(pieces)
            for child in children:
                _walk(child)
            # Block-level boundaries (paragraph + heading) get a
            # newline between siblings so the rendered text
            # preserves block structure visually.
            if node_type == "paragraph" or (
                isinstance(node_type, str) and node_type.startswith("heading")
            ):
                if len(pieces) > before:
                    pieces.append("\n")

    _walk(parsed)
    return "".join(pieces).rstrip("\n")


def _render_page(page: dict[str, Any], assets_map: dict[str, str]) -> str:
    """Render one picture-book page as an HTML <section>.

    ``page`` is the API shape (PageOut deserialized): id, position,
    layout, text_content, image_asset_id, layout_config.
    ``assets_map`` maps asset_id -> file:// URL for WeasyPrint.

    PB-PHASE4 Session 4c-B-1 fix C: ``text_content`` for TipTap
    layouts is a JSON-serialized TipTap doc. We defensively
    extract plain text via ``_extract_plain_text`` so the PDF
    emits the user's authored text instead of raw JSON. Proper
    TipTap-to-HTML rendering (preserving bold/italic/headings)
    lands as PICTURE-BOOK-PDF-TIPTAP-RENDER-01 (P3).
    """
    layout = page.get("layout", "image_top_text_bottom")
    text_content = escape(_extract_plain_text(page.get("text_content")))
    image_asset_id = page.get("image_asset_id")
    config = page.get("layout_config")
    css_class = _layout_class(layout)

    image_html = ""
    if image_asset_id:
        img_url = assets_map.get(str(image_asset_id))
        if img_url:
            image_html = f'<img src="{escape(img_url)}" alt="" />'

    # Per-layout inline-style customization.
    if layout == "speech_bubble":
        canvas_style = ""
        region_image_style = ""
        image_style = ""
        region_text_style = _speech_bubble_style(config)
    elif layout == "text_only":
        canvas_style = region_image_style = image_style = region_text_style = ""
    else:
        styles = _image_layout_style(layout, config)
        canvas_style = styles["canvas_style"]
        region_image_style = styles["region_image_style"]
        image_style = styles["image_style"]
        region_text_style = styles["region_text_style"]

    # Inject the image_style by re-wrapping image_html. Easier than
    # threading through _render_page's main string.
    if image_html and image_style:
        image_html = image_html.replace(
            "<img ", f'<img style="{image_style}" '
        )

    # text_only suppresses the image region entirely. Other layouts
    # show it (with placeholder if no image attached).
    image_region_html = ""
    if layout != "text_only":
        image_region_html = (
            f'<div class="region region-image" '
            f'style="{region_image_style}">{image_html}</div>'
        )

    canvas_attr = f' style="{canvas_style}"' if canvas_style else ""
    text_attr = (
        f' style="{region_text_style}"' if region_text_style else ""
    )

    return (
        f'<section class="page {css_class}"{canvas_attr}>'
        f'{image_region_html}'
        f'<div class="region region-text"{text_attr}>'
        f'<p>{text_content}</p>'
        f'</div>'
        f'</section>'
    )


def _build_html(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    assets_map: dict[str, str],
) -> str:
    """Build the full HTML document for WeasyPrint.

    PDF metadata embedding (PB-PHASE4 Session 6 Commit 3):
    WeasyPrint reads the following HTML head fields into the
    generated PDF's metadata dictionary:

    - ``<title>``                       -> PDF Title
    - ``<meta name="author">``          -> PDF Author
    - ``<meta name="description">``     -> PDF Subject (Description)
    - ``<meta name="generator">``       -> PDF Producer
    - ``<html lang="...">``             -> PDF /Lang (accessibility)

    Empty/missing values are omitted entirely (NOT rendered as
    empty meta tags) so the resulting PDF metadata stays clean
    rather than carrying empty-string artifacts.
    """
    title = escape(book_data.get("title") or "Picture Book")
    author = (book_data.get("author") or "").strip()
    description = (book_data.get("description") or "").strip()
    language = (book_data.get("language") or "de").strip() or "de"

    meta_tags: list[str] = []
    if author:
        meta_tags.append(f'<meta name="author" content="{escape(author)}" />')
    if description:
        meta_tags.append(
            f'<meta name="description" content="{escape(description)}" />'
        )
    meta_tags.append('<meta name="generator" content="Bibliogon picture-book PDF" />')
    meta_html = "".join(meta_tags)

    pages_html = "\n".join(_render_page(p, assets_map) for p in pages)
    # PB-PHASE4 Session 4c-B-1 Finding G3: prepend the 5
    # dynamically-generated @font-face rules to the static CSS
    # block. Calling font_face_css() here (NOT at module import
    # time) defers the disk-read of font file paths until a PDF
    # is actually rendered, which keeps the module importable in
    # environments without the bundled fonts (e.g. test fixtures).
    style_css = f"{font_face_css()}\n{_BASE_CSS}"
    return (
        "<!DOCTYPE html>"
        f'<html lang="{escape(language)}">'
        "<head>"
        '<meta charset="utf-8" />'
        f"<title>{title}</title>"
        f"{meta_html}"
        f"<style>{style_css}</style>"
        "</head>"
        "<body>"
        f"{pages_html}"
        "</body>"
        "</html>"
    )


def _build_assets_map(
    assets: list[dict[str, Any]],
    upload_dir: Path,
) -> dict[str, str]:
    """Resolve each asset_id to a file:// URL for WeasyPrint.

    The persisted assets table carries 'path' (filesystem location
    relative to the book's upload dir, or absolute). For
    file://-loading the path must be absolute. Empty entries are
    skipped silently — pages with image_asset_id pointing at a
    missing asset render as placeholder-less (no <img> emitted).
    """
    out: dict[str, str] = {}
    for asset in assets:
        asset_id = asset.get("id")
        path_str = asset.get("path") or ""
        if not asset_id or not path_str:
            continue
        path = Path(path_str)
        if not path.is_absolute():
            path = upload_dir / path
        if path.exists():
            out[str(asset_id)] = path.resolve().as_uri()
    return out


def generate_picture_book_pdf(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    upload_dir: Path,
    output_path: Path,
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
    html_str = _build_html(book_data, pages, assets_map)
    HTML(string=html_str, base_url=str(upload_dir)).write_pdf(
        target=str(output_path),
    )
    return output_path
