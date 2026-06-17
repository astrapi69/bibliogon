"""HTML page rendering for picture-book PDF (TipTap + page layout).

Renders TipTap rich-text into print HTML and assembles each
:class:`app.models.Page` into a positioned page block, then the full
HTML document. Consumes :mod:`.styles`, :mod:`.layout`, and the
embedded-font CSS helpers.
"""

from __future__ import annotations

import json
import re
from html import escape
from typing import Any

from bibliogon_export.picture_book_fonts import font_face_css, is_known_font

from .layout import (
    _MULTI_IMAGE_LAYOUTS,
    _layout_class,
    _read_layout_namespace,
    _read_secondary_image_asset_id,
)
from .styles import (
    _BASE_CSS,
    DEFAULT_PICTURE_BOOK_FORMAT,
    _format_css,
    _image_layout_style,
    _speech_bubble_style,
)


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


def _render_tiptap_doc(text_content: str | None) -> str:
    """Render a ``page.text_content`` value as printable HTML.

    PB-PHASE4 Session 4c-B-1 Finding G4 (closes
    ``PICTURE-BOOK-PDF-TIPTAP-RENDER-01``). Replaces the bare
    ``escape(_extract_plain_text(...))`` path with a proper
    TipTap walker that preserves the D1 MVP marks shipped in
    Finding G1 + G2:

    - ``textStyle`` mark with ``fontFamily`` attr → ``<span
      style="font-family: ...">``. Only honors the 5 canonical
      OFL font ids via :func:`is_known_font`; unknown values
      fall through silently (defensive against malformed
      marks reaching the renderer, e.g. from manual JSON edits
      OR a future upstream-TipTap change).
    - ``bold`` mark → ``<strong>``
    - ``italic`` mark → ``<em>``
    - ``underline`` mark → ``<u>``
    - ``textAlign`` attr on ``paragraph`` / ``heading`` →
      ``style="text-align: <value>"`` on the wrapping element.
    - Heading level 1-3 (D1 MVP) → ``<h1>`` / ``<h2>`` / ``<h3>``.
      Levels 4-6 fall back to ``<h6>`` (TipTap's max).
    - ``bulletList`` → ``<ul>`` / ``orderedList`` → ``<ol>``.
      ``listItem`` → ``<li>``. Nested lists are supported.

    Three input shapes accepted (D11 backward-compat):

    1. ``None`` or empty → empty string. Pages without text
       render the region without children; the surrounding
       ``<div class="region region-text">`` carries no
       content.
    2. Plain string (Tier-Property layouts:
       speech_bubble + image_full_text_overlay store text as
       a raw string) → wrapped in a single ``<p>``. Same
       output as the pre-Finding-G ``<p>{escaped}</p>``
       behavior.
    3. JSON-serialized TipTap doc (TipTap layouts:
       image_top_text_bottom + image_left_text_right +
       text_only) → walked + emitted as proper structured
       HTML with marks + alignment + headings + lists
       preserved.

    Mark precedence + nesting: the walker wraps mark tags in
    a stable order from outer to inner — bold → italic →
    underline → fontFamily span. Different orderings would
    produce visually identical PDFs (HTML cascade is
    commutative for these properties) but the stable order
    keeps the rendered HTML diffable + the per-mark test
    assertions deterministic.

    Unknown node types degrade to a ``<div>`` with the
    recursively-rendered children. Defensive: a future TipTap
    upgrade introducing a new node type produces best-effort
    output rather than dropping content silently.
    """
    if not text_content:
        return ""

    # Plain-string input (Tier-Property layouts + D11 legacy
    # pages from before TipTap-rich layouts existed): wrap in
    # a single <p> and escape. Matches the pre-Finding-G shape
    # so existing pytest assertions on Tier-Property pages
    # continue to hold.
    stripped = text_content.lstrip()
    if not stripped.startswith("{"):
        return f"<p>{escape(text_content)}</p>"

    try:
        parsed = json.loads(text_content)
    except (json.JSONDecodeError, TypeError):
        return f"<p>{escape(text_content)}</p>"
    if not isinstance(parsed, dict) or parsed.get("type") != "doc":
        return f"<p>{escape(text_content)}</p>"

    return _render_tiptap_node(parsed)


def _render_tiptap_node(node: Any) -> str:
    """Recursive walker. Top-level call is on the ``doc``
    node; recursion descends into ``content`` arrays.

    Returns the HTML for ``node`` + its descendants. Does NOT
    escape — text nodes escape their own ``text`` field, and
    structural tags emit fixed HTML without user input. Mark
    wrappers also emit fixed tag names (``<strong>``, etc.).
    """
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type", "")

    # Text node: emit text + wrap in mark tags.
    if node_type == "text":
        text = node.get("text")
        if not isinstance(text, str):
            return ""
        return _wrap_text_with_marks(text, node.get("marks") or [])

    # Container: render children + wrap in appropriate tag.
    children = node.get("content")
    inner = "".join(_render_tiptap_node(c) for c in children) if isinstance(children, list) else ""

    # Top-level doc: just emit inner (no wrapper tag — the
    # caller's <div class="region-text"> is the container).
    if node_type == "doc":
        return inner

    # Heading: clamp level into 1-6 + style with textAlign.
    if node_type == "heading":
        attrs = node.get("attrs") or {}
        level_raw = attrs.get("level")
        try:
            level = int(level_raw) if level_raw is not None else 1
        except (TypeError, ValueError):
            level = 1
        level = max(1, min(6, level))
        align_attr = _text_align_attr(attrs.get("textAlign"))
        return f"<h{level}{align_attr}>{inner}</h{level}>"

    # Paragraph: textAlign attr → inline style.
    if node_type == "paragraph":
        attrs = node.get("attrs") or {}
        align_attr = _text_align_attr(attrs.get("textAlign"))
        return f"<p{align_attr}>{inner}</p>"

    # Lists.
    if node_type == "bulletList":
        return f"<ul>{inner}</ul>"
    if node_type == "orderedList":
        return f"<ol>{inner}</ol>"
    if node_type == "listItem":
        return f"<li>{inner}</li>"

    # Hard break (line break within a paragraph).
    if node_type == "hardBreak":
        return "<br />"

    # Unknown / future node types: fall through with a <div>
    # so content is preserved + future TipTap upgrades don't
    # silently drop nodes. The <div> is a safer default than
    # <p> because some new TipTap nodes (e.g. tables) carry
    # block-level children that would be invalid inside <p>.
    return f"<div>{inner}</div>"


def _wrap_text_with_marks(text: str, marks: list[Any]) -> str:
    """Wrap ``text`` in the appropriate mark tags.

    Order: bold (outer) → italic → underline → fontFamily
    (inner). Stable ordering keeps test assertions
    deterministic + matches typical TipTap mark precedence.
    """
    escaped = escape(text)
    has_bold = False
    has_italic = False
    has_underline = False
    font_family: str | None = None

    for mark in marks:
        if not isinstance(mark, dict):
            continue
        mark_type = mark.get("type")
        if mark_type == "bold":
            has_bold = True
        elif mark_type == "italic":
            has_italic = True
        elif mark_type == "underline":
            has_underline = True
        elif mark_type == "textStyle":
            attrs = mark.get("attrs") or {}
            candidate = attrs.get("fontFamily")
            # Defensive: honor only known catalog ids. Unknown
            # font ids (e.g. "Helvetica" injected via malformed
            # JSON) fall through to the default render. D11
            # backward-compat path.
            if isinstance(candidate, str) and is_known_font(candidate):
                font_family = candidate

    inner = escaped
    if font_family:
        inner = f"<span style=\"font-family: '{font_family}'\">{inner}</span>"
    if has_underline:
        inner = f"<u>{inner}</u>"
    if has_italic:
        inner = f"<em>{inner}</em>"
    if has_bold:
        inner = f"<strong>{inner}</strong>"
    return inner


def _text_align_attr(value: Any) -> str:
    """Build the ``style="text-align: ..."`` attribute fragment,
    or empty string when no alignment is set / value is invalid."""
    if value not in {"left", "center", "right", "justify"}:
        return ""
    return f' style="text-align: {value}"'


def _render_collage_page(page: dict[str, Any], assets_map: dict[str, str]) -> str:
    """Phase 3 C5 (2026-05-28). Render a collage page: N freely-
    positioned images + N text regions at absolute percentage
    coords. M1 rich-JSON storage in
    ``layout_config.collage.{images, text_regions, background_color}``.

    Mirrors the editor's ``frontend/src/components/CollageCanvas.tsx``
    rendering 1:1 — same coord system, same field shape, same
    optional-field fallbacks. The walker is the source of truth for
    PDF output; this function MUST emit pixel-equivalent geometry to
    what the editor canvas renders for the same row.
    """
    raw_config = page.get("layout_config")
    namespace = _read_layout_namespace(raw_config, "collage") or {}
    images_raw = namespace.get("images")
    text_regions_raw = namespace.get("text_regions")
    background_color = namespace.get("background_color")

    images_list: list[dict[str, Any]] = (
        [img for img in images_raw if isinstance(img, dict)] if isinstance(images_raw, list) else []
    )
    text_regions_list: list[dict[str, Any]] = (
        [tr for tr in text_regions_raw if isinstance(tr, dict)]
        if isinstance(text_regions_raw, list)
        else []
    )

    # Canvas style: position relative (set in CSS), optional
    # background_color override.
    canvas_style_parts: list[str] = []
    if isinstance(background_color, str) and re.match(r"^#[0-9a-fA-F]{6}$", background_color):
        canvas_style_parts.append(f"background: {background_color};")
    canvas_style = " ".join(canvas_style_parts)
    canvas_attr = f' style="{canvas_style}"' if canvas_style else ""

    # Per-image rendering: positioned wrapper + <img> with
    # object-fit. Mirrors the editor's CollageImageItem.
    def _clamp_pct(value: Any, fallback: float) -> float:
        if isinstance(value, (int, float)):
            v = float(value)
            if v != v:  # NaN guard
                return fallback
            return max(0.0, min(100.0, v))
        return fallback

    def _clamp_rotation(value: Any) -> float:
        if not isinstance(value, (int, float)):
            return 0.0
        v = float(value) % 360.0
        if v > 180.0:
            v -= 360.0
        if v < -180.0:
            v += 360.0
        return v

    images_html_parts: list[str] = []
    for image in images_list:
        x_pct = _clamp_pct(image.get("x_pct"), 0.0)
        y_pct = _clamp_pct(image.get("y_pct"), 0.0)
        width_pct = _clamp_pct(image.get("width_pct"), 30.0)
        height_pct = _clamp_pct(image.get("height_pct"), 30.0)
        z_index = int(image["z_index"]) if isinstance(image.get("z_index"), (int, float)) else 1
        rotation_deg = _clamp_rotation(image.get("rotation_deg"))
        fit = image["fit"] if image.get("fit") == "contain" else "cover"

        wrapper_style_parts = [
            "position: absolute;",
            f"left: {x_pct}%;",
            f"top: {y_pct}%;",
            f"width: {width_pct}%;",
            f"height: {height_pct}%;",
            f"z-index: {z_index};",
            "overflow: hidden;",
        ]
        if rotation_deg != 0.0:
            wrapper_style_parts.append(f"transform: rotate({rotation_deg}deg);")
        wrapper_style = " ".join(wrapper_style_parts)

        asset_id = image.get("asset_id")
        inner_html = ""
        if isinstance(asset_id, str):
            img_url = assets_map.get(asset_id)
            if img_url:
                img_style = f"width: 100%; height: 100%; display: block; object-fit: {fit};"
                inner_html = f'<img src="{escape(img_url)}" alt="" style="{img_style}" />'
        # Missing asset_id or unresolved URL: empty wrapper (the
        # grid slot still occupies its position; user can fix in
        # the editor).
        images_html_parts.append(
            f'<div class="collage-image" style="{wrapper_style}">{inner_html}</div>'
        )

    # Per-text-region rendering: absolute-positioned div with
    # content. Tier1/Tier2 styling fields are accepted in the M1
    # schema; full styling-derivation deferred to a follow-up.
    text_regions_html_parts: list[str] = []
    for region in text_regions_list:
        rx = _clamp_pct(region.get("x_pct"), 0.0)
        ry = _clamp_pct(region.get("y_pct"), 0.0)
        rw = _clamp_pct(region.get("width_pct"), 40.0)
        rh = _clamp_pct(region.get("height_pct"), 15.0)
        rz = int(region["z_index"]) if isinstance(region.get("z_index"), (int, float)) else 1
        content = region["content"] if isinstance(region.get("content"), str) else ""
        text_style = (
            f"position: absolute; left: {rx}%; top: {ry}%; "
            f"width: {rw}%; height: {rh}%; z-index: {rz}; "
            f"overflow: hidden; display: flex; "
            f"align-items: center; justify-content: center; "
            f"box-sizing: border-box; padding: 8pt; "
            f"background: rgba(255, 255, 255, 0.8); color: black; "
            f"font-size: 10pt; white-space: pre-wrap; "
            f"word-break: break-word;"
        )
        text_regions_html_parts.append(
            f'<div class="collage-text-region" style="{text_style}">{escape(content)}</div>'
        )

    return (
        f'<section class="page page--collage"{canvas_attr}>'
        f"{''.join(images_html_parts)}"
        f"{''.join(text_regions_html_parts)}"
        f"</section>"
    )


def _render_page(page: dict[str, Any], assets_map: dict[str, str]) -> str:
    """Render one picture-book page as an HTML <section>.

    ``page`` is the API shape (PageOut deserialized): id, position,
    layout, text_content, image_asset_id, layout_config.
    ``assets_map`` maps asset_id -> file:// URL for WeasyPrint.

    PB-PHASE4 Session 4c-B-1 Finding G4 (closes
    ``PICTURE-BOOK-PDF-TIPTAP-RENDER-01``): ``text_content`` for
    TipTap layouts is a JSON-serialized TipTap doc. We render it
    via :func:`_render_tiptap_doc` which walks the doc + emits
    proper structured HTML preserving bold/italic/underline +
    headings 1-3 + lists + alignment + font-family marks (the
    full D1 MVP mark set). Plain-string ``text_content`` (Tier-
    Property layouts: speech_bubble + image_full_text_overlay)
    pass through as ``<p>{escaped}</p>`` — same shape as the
    pre-Finding-G output, so existing pytest assertions on
    those layouts continue to hold.
    """
    layout = page.get("layout", "image_top_text_bottom")
    # Phase 3 C5 (2026-05-28). Collage early-dispatches to its
    # dedicated renderer — the per-element absolute positioning
    # doesn't fit the grid-based pipeline the other layouts share.
    if layout == "collage":
        return _render_collage_page(page, assets_map)

    text_html = _render_tiptap_doc(page.get("text_content"))
    image_asset_id = page.get("image_asset_id")
    raw_config = page.get("layout_config")
    # Fix B: extract the active layout's namespace before passing
    # to the per-layout style functions. Legacy-flat configs return
    # the whole dict (transparent back-compat); namespaced configs
    # return the layout's own bucket. speech_bubble's bubbles[0]
    # wrapper lives INSIDE the namespace and is read by
    # _read_bubble_config inside _speech_bubble_style.
    config = _read_layout_namespace(raw_config, layout)
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
        image_html = image_html.replace("<img ", f'<img style="{image_style}" ')

    # text_only suppresses the image region entirely. Other layouts
    # show it (with placeholder if no image attached).
    image_region_html = ""
    if layout != "text_only":
        image_region_html = (
            f'<div class="region region-image" style="{region_image_style}">{image_html}</div>'
        )

    canvas_attr = f' style="{canvas_style}"' if canvas_style else ""
    text_attr = f' style="{region_text_style}"' if region_text_style else ""

    # Phase 1 C3 (2026-05-28): image_full_no_text suppresses the
    # TEXT region entirely (mirror of text_only suppressing the
    # image region). Per adjudicated Q5: text_content stays in
    # storage but does NOT render for this layout — switching back
    # to a text-bearing layout restores the text.
    text_region_html = ""
    if layout != "image_full_no_text":
        text_region_html = f'<div class="region region-text"{text_attr}>{text_html}</div>'
    if layout == "speech_bubble":
        text_region_html = f'<div class="bubble-host">{text_region_html}</div>'

    # Phase 2 C2 (2026-05-28): multi-image layouts emit a SECONDARY
    # image region after the text region. The secondary asset id
    # lives in layout_config[layout].secondary_image_asset_id via
    # _read_secondary_image_asset_id (M1 storage). When the asset is
    # missing OR the asset id doesn't resolve to a URL, the region
    # still renders as an empty div so the grid template's third
    # row stays present (mirrors the editor's placeholder pattern).
    image_secondary_region_html = ""
    if layout in _MULTI_IMAGE_LAYOUTS:
        secondary_asset_id = _read_secondary_image_asset_id(raw_config, layout)
        image_secondary_html = ""
        if secondary_asset_id:
            secondary_url = assets_map.get(str(secondary_asset_id))
            if secondary_url:
                # Both images share the same image_style override
                # (image_fit). C3 + C4 + C5 may differentiate per
                # image-slot if the per-layout config plan calls for
                # it; C2's two_images_text_center treats both images
                # uniformly.
                if image_style:
                    image_secondary_html = (
                        f'<img style="{image_style}" src="{escape(secondary_url)}" alt="" />'
                    )
                else:
                    image_secondary_html = f'<img src="{escape(secondary_url)}" alt="" />'
        image_secondary_region_html = (
            f'<div class="region region-image-secondary">{image_secondary_html}</div>'
        )

    return (
        f'<section class="page {css_class}"{canvas_attr}>'
        f"{image_region_html}"
        f"{text_region_html}"
        f"{image_secondary_region_html}"
        f"</section>"
    )


def _build_html(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    assets_map: dict[str, str],
    picture_book_format: str = DEFAULT_PICTURE_BOOK_FORMAT,
    picture_book_bleed_marks: bool = False,
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
        meta_tags.append(f'<meta name="description" content="{escape(description)}" />')
    # PDF-BLEED-MARKS-01 Q3: extend the Producer metadata with a
    # ``(bleed)`` suffix when bleed is on. Downstream tools that
    # inspect PDF metadata (KDP, print shops, archivers) see the
    # marker without needing a custom field.
    producer = (
        "Bibliogon picture-book PDF (bleed)"
        if picture_book_bleed_marks
        else "Bibliogon picture-book PDF"
    )
    meta_tags.append(f'<meta name="generator" content="{escape(producer)}" />')
    meta_html = "".join(meta_tags)

    pages_html = "\n".join(_render_page(p, assets_map) for p in pages)
    # PB-PHASE4 Session 4c-B-1 Finding G3: prepend the 5
    # dynamically-generated @font-face rules to the static CSS
    # block. Calling font_face_css() here (NOT at module import
    # time) defers the disk-read of font file paths until a PDF
    # is actually rendered, which keeps the module importable in
    # environments without the bundled fonts (e.g. test fixtures).
    # PDF-KDP-FORMATS-01: prepend the format-specific @page rule +
    # CSS variables for content sizing. Default 8.5x8.5 keeps the
    # MVP rendering unchanged. Ordering: @font-face first (per the
    # existing G3 test contract), then the format block, then the
    # static base. The at-rules are order-independent for cascade
    # purposes; the test contract is the constraint that pins
    # ordering here.
    # PDF-BLEED-MARKS-01: the same _format_css call accepts the
    # bleed_marks flag. Default False keeps pre-C1 emit unchanged.
    style_css = (
        f"{font_face_css()}\n"
        f"{_format_css(picture_book_format, picture_book_bleed_marks)}\n"
        f"{_BASE_CSS}"
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
