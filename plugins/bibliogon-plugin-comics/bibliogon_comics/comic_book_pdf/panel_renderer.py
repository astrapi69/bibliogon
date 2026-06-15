"""Panel + page HTML assembly for comic-book PDF.

Renders each comic panel (with its bubbles), assembles a page from the
resolved grid template, and builds the full HTML document. Consumes the
grid-template layout (:mod:`.layout`), the bubble renderer
(:mod:`.bubble_renderer`), and the picture-book KDP format + font CSS
helpers (legitimate ``comics -> export`` dependency).
"""

from __future__ import annotations

import json
from html import escape
from typing import Any

from bibliogon_export.picture_book_fonts import font_face_css
from bibliogon_export.picture_book_pdf import (
    DEFAULT_PICTURE_BOOK_FORMAT,
    _format_css,
)

from .bubble_renderer import _render_comic_bubble
from .layout import _GRID_TEMPLATE_CSS, _resolve_comic_grid_template


def _render_comic_panel(
    panel: dict[str, Any],
    panel_bubbles: list[dict[str, Any]],
    assets_map: dict[str, str],
) -> str:
    """Render one comic_panels row as an HTML element.

    Panel row shape (matches ``ComicPanelOut`` Pydantic schema):
    - id, page_id, position
    - image_asset_id: optional FK
    - bounds: {x_pct, y_pct, width_pct, height_pct} (panel position
      WITHIN the page; for grid templates the grid cell governs
      placement, bounds is for future absolute-positioning)
    - panel_config: optional JSON (border-style + gutter + future
      polish)

    ``panel_bubbles`` is the pre-filtered subset of all comic_bubbles
    rows where ``panel_id == panel.id``. Caller filters; we just
    render in position order.
    """
    image_asset_id = panel.get("image_asset_id")
    image_html = ""
    if image_asset_id:
        img_url = assets_map.get(str(image_asset_id))
        if img_url:
            image_html = (
                f'<img class="comic-panel-image" '
                f'src="{escape(img_url)}" alt="" '
                'style="width: 100%; height: 100%; '
                'object-fit: cover; display: block;" />'
            )

    config = panel.get("panel_config") or {}
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except json.JSONDecodeError:
            config = {}
    if not isinstance(config, dict):
        config = {}

    # Panel-config CSS overrides (subset MVP; Session 3 polish
    # adds more knobs like gutter / motion-lines).
    panel_css_parts = ["border: 1pt solid black;", "position: relative;"]
    if isinstance(config.get("border_style"), str):
        # Replace the default border style.
        panel_css_parts[0] = f"border: 1pt {config['border_style']} black;"

    bubbles_html = "".join(_render_comic_bubble(b) for b in panel_bubbles)

    return (
        f'<div class="comic-panel" '
        f'style="{" ".join(panel_css_parts)} '
        'overflow: hidden;">'
        f"{image_html}"
        f"{bubbles_html}"
        f"</div>"
    )


# --- Page-level render ---


def _render_comic_page(
    page: dict[str, Any],
    page_panels: list[dict[str, Any]],
    panel_bubbles_map: dict[str, list[dict[str, Any]]],
    assets_map: dict[str, str],
) -> str:
    """Render one comic-book page as a CSS Grid of panels.

    Grid template comes from ``Page.layout_config.comic_grid_template``
    per Q1 β. Panels fill grid cells in position order. ``bubbles``
    are nested inside their panels via ``panel_bubbles_map``.
    """
    layout_config = page.get("layout_config")
    if isinstance(layout_config, str):
        try:
            layout_config = json.loads(layout_config)
        except json.JSONDecodeError:
            layout_config = None

    template_id = _resolve_comic_grid_template(layout_config)
    grid_css = _GRID_TEMPLATE_CSS[template_id]

    panels_html = "".join(
        _render_comic_panel(panel, panel_bubbles_map.get(panel.get("id", ""), []), assets_map)
        for panel in page_panels
    )

    return (
        f'<section class="comic-page" '
        f'data-page-id="{escape(str(page.get("id", "")))}" '
        f'data-grid-template="{escape(template_id)}">'
        f'<div class="comic-page-grid" style="'
        f"display: grid; {grid_css} "
        f"width: 100%; height: 100%; "
        f"gap: 6pt; padding: 0;"
        f'">'
        f"{panels_html}"
        f"</div>"
        f"</section>"
    )


# --- Page-level CSS (per-page-break) ---

_COMIC_BASE_CSS = """
/* Comic-book PDF base CSS (plugin-comics Session 2 C3). */

html, body {
    margin: 0;
    padding: 0;
    font-family: 'Atkinson Hyperlegible', sans-serif;
    color: black;
    background: white;
}

.comic-page {
    page-break-after: always;
    width: 100%;
    height: var(--content-h);
    display: block;
    position: relative;
    overflow: hidden;
}

.comic-page:last-child {
    page-break-after: auto;
}

.comic-page-grid {
    box-sizing: border-box;
}

.comic-panel {
    box-sizing: border-box;
}
"""


def _build_comic_html(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    panels: list[dict[str, Any]],
    bubbles: list[dict[str, Any]],
    assets_map: dict[str, str],
    picture_book_format: str = DEFAULT_PICTURE_BOOK_FORMAT,
    picture_book_bleed_marks: bool = False,
) -> str:
    """Assemble the full HTML doc for a comic book.

    The dispatch site queries panels + bubbles separately (they
    live in their own tables; comic_panels.page_id → pages.id;
    comic_bubbles.panel_id → comic_panels.id). This function takes
    all four lists + groups them in Python for rendering.

    PDF metadata: same shape as picture-book — title + author +
    description + generator + lang. Producer extended with
    ``(bleed)`` suffix when bleed=true per PDF-BLEED-MARKS-01 Q3.
    """
    title = escape(book_data.get("title") or "Comic Book")
    author = (book_data.get("author") or "").strip()
    description = (book_data.get("description") or "").strip()
    language = (book_data.get("language") or "de").strip() or "de"

    meta_tags: list[str] = []
    if author:
        meta_tags.append(f'<meta name="author" content="{escape(author)}" />')
    if description:
        meta_tags.append(f'<meta name="description" content="{escape(description)}" />')
    producer = (
        "Bibliogon comic-book PDF (bleed)"
        if picture_book_bleed_marks
        else "Bibliogon comic-book PDF"
    )
    meta_tags.append(f'<meta name="generator" content="{escape(producer)}" />')
    meta_html = "".join(meta_tags)

    # Pre-index panels by page_id + bubbles by panel_id for O(1)
    # lookup during the per-page render. Stable order: panels by
    # ``position``, bubbles by ``position``.
    panels_by_page: dict[str, list[dict[str, Any]]] = {}
    for panel in sorted(panels, key=lambda p: p.get("position", 0)):
        page_id = str(panel.get("page_id", ""))
        panels_by_page.setdefault(page_id, []).append(panel)

    bubbles_by_panel: dict[str, list[dict[str, Any]]] = {}
    for bubble in sorted(bubbles, key=lambda b: b.get("position", 0)):
        panel_id = str(bubble.get("panel_id", ""))
        bubbles_by_panel.setdefault(panel_id, []).append(bubble)

    pages_html = "\n".join(
        _render_comic_page(
            page,
            panels_by_page.get(str(page.get("id", "")), []),
            bubbles_by_panel,
            assets_map,
        )
        for page in pages
    )

    # CSS ordering: @font-face FIRST (per the existing G3 test
    # contract in picture_book_pdf), then the format block (which
    # carries @page + :root CSS variables), then the comic-base.
    style_css = (
        f"{font_face_css()}\n"
        f"{_format_css(picture_book_format, picture_book_bleed_marks)}\n"
        f"{_COMIC_BASE_CSS}"
    )

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
