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
import re
from html import escape
from pathlib import Path
from typing import Any

from bibliogon_export.picture_book_fonts import font_face_css, is_known_font

# WeasyPrint is imported lazily inside generate_picture_book_pdf
# so the rest of the plugin (chapter-based pipeline) stays
# importable when WeasyPrint's native dependencies are missing.
# Tests that don't exercise the PDF generator path don't pay the
# load cost either.


# --- KDP picture-book formats (PDF-KDP-FORMATS-01) ---

# Five KDP picture-book trim sizes shipped here. Format IDs use the
# inches-tuple convention (Q1 decision: short, self-describing,
# decoupled from KDP marketing rename risk). 8.5x8.5 is the MVP
# default; the other four extend the picture-book PDF pipeline beyond
# the v0.35.0 square-only shipping.
#
# Per-format margin tuning is intentionally NOT shipped here
# (Q4 decision): uniform 0.5in margin across all formats keeps the
# scope tight + matches KDP's conservative-safe recommendation. If a
# real submission rejection surfaces with a margin-related cause,
# file a follow-up item.
PICTURE_BOOK_FORMATS: dict[str, tuple[float, float]] = {
    "8.5x8.5": (8.5, 8.5),  # square (MVP default)
    "8x10": (8.0, 10.0),  # portrait
    "8.5x11": (8.5, 11.0),  # portrait, larger
    "11x8.5": (11.0, 8.5),  # landscape
    "10x8": (10.0, 8.0),  # landscape, smaller
}

DEFAULT_PICTURE_BOOK_FORMAT = "8.5x8.5"
_PAGE_MARGIN_IN = 0.5

# PDF-BLEED-MARKS-01: KDP bleed dimension is 0.125in (3 mm) uniform
# across all 5 picture-book formats. CSS Paged Media spec syntax:
# ``@page { bleed: 3mm; marks: crop; }``. WeasyPrint (66.0+, we
# pin to that range) emits the crop marks at the trim-box corners
# automatically. Q2 decision: marks-only ship; background-extends-
# into-bleed deferred to a follow-up filing if real print-shop
# demand surfaces.
_BLEED_MM = 3.0


def _resolve_picture_book_format(
    format_id: str | None,
) -> tuple[str, float, float]:
    """Resolve a format id to ``(canonical_id, width_in, height_in)``.

    Falls back silently to ``DEFAULT_PICTURE_BOOK_FORMAT`` on missing,
    null, empty, or unknown values (Q2 decision: same gamma-shim
    default-on-read pattern as the bubbles[0] wrapper from 4c-B-2).
    The canonical id is what callers use for filename suffixes; the
    dimensions feed the CSS emit.
    """
    if isinstance(format_id, str) and format_id in PICTURE_BOOK_FORMATS:
        w, h = PICTURE_BOOK_FORMATS[format_id]
        return format_id, w, h
    w, h = PICTURE_BOOK_FORMATS[DEFAULT_PICTURE_BOOK_FORMAT]
    return DEFAULT_PICTURE_BOOK_FORMAT, w, h


def _format_css(format_id: str, bleed_marks: bool = False) -> str:
    """Build the format-specific CSS block.

    Emits:
    - ``@page { size: <w>in <h>in; margin: 0.5in }``
    - ``:root { --page-w / --page-h / --content-h }`` for element-
      level use in the static CSS (Q5 decision: CSS variables over
      direct substitution).
    - When ``bleed_marks=True``: appends ``bleed: 3mm; marks: crop;``
      to the ``@page`` rule (PDF-BLEED-MARKS-01). WeasyPrint emits
      the crop marks at the trim-box corners + extends the painted
      area into the 3 mm bleed region. Trim box stays at
      ``<w>in <h>in`` — bleed is OUTSIDE that box per CSS Paged
      Media spec, so ``--content-h`` and the margin stay unchanged.

    The static ``_BASE_CSS`` references ``var(--content-h)`` on the
    ``.page`` rule so per-format height stays decoupled from the
    Python template.
    """
    _id, w, h = _resolve_picture_book_format(format_id)
    content_h = h - 2 * _PAGE_MARGIN_IN
    bleed_block = (
        f"    bleed: {_BLEED_MM}mm;\n    marks: crop;\n"
        if bleed_marks
        else ""
    )
    return (
        ":root {\n"
        f"    --page-w: {w}in;\n"
        f"    --page-h: {h}in;\n"
        f"    --content-h: {content_h}in;\n"
        "}\n"
        "@page {\n"
        f"    size: {w}in {h}in;\n"
        f"    margin: {_PAGE_MARGIN_IN}in;\n"
        f"{bleed_block}"
        "}\n"
    )


# --- CSS rendering ---


_BASE_CSS = """
/* PB-PHASE4 Session 6 picture-book PDF CSS.
 * Matches Session 4c PageCanvas layout primitives so the
 * in-editor view + the printed PDF render the same spatial
 * decisions. Mirror, not duplicate: the editor's
 * .module.css is the source of truth for the in-app render;
 * this CSS is the print-render of the same model.
 *
 * PDF-KDP-FORMATS-01 (2026-05-19): the ``@page { size: ... }``
 * rule + the ``.page`` content-height are emitted DYNAMICALLY by
 * ``_format_css(format_id)`` and prepended below this static block
 * at render-time. The static block references ``var(--content-h)``
 * for the element-level coupling; the dynamic block sets that
 * variable per format.
 */

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
    height: var(--content-h);  /* set by _format_css per PDF-KDP-FORMATS-01 */
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

/* Picture-Book Layout Expansion Phase 1 C3 (2026-05-28). Mirror
 * grids + full-bleed-no-text. Geometry mirrors the editor's
 * PageCanvas.module.css C2 entries so what you see in the editor
 * is what WeasyPrint embeds in the PDF. */

.page--image_bottom_text_top {
    grid-template-areas:
        "text"
        "image";
    grid-template-columns: 1fr;
    grid-template-rows: 30% 70%;
}

.page--image_bottom_text_top .region-image {
    border-top: 1pt solid #ccc;
}

.page--image_right_text_left {
    grid-template-areas: "text image";
    grid-template-columns: 40% 60%;
    grid-template-rows: 1fr;
}

.page--image_right_text_left .region-image {
    border-left: 1pt solid #ccc;
}

.page--image_full_no_text {
    grid-template-areas: "image";
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
}

.page--image_full_no_text .region-image img {
    object-fit: cover;
}

/* Picture-Book Layout Expansion Phase 2 C2 (2026-05-28).
 * two_images_text_center: PRIMARY image on top (40 %), centred
 * text band (20 %), SECONDARY image on the bottom (40 %). The
 * SECONDARY image lives in layout_config[layout].secondary_image
 * _asset_id (M1 storage); the walker resolves it via
 * _read_secondary_image_asset_id and emits a second
 * .region-image-secondary block after the text region. The
 * primary image keeps its .region-image rules + objectFit
 * handling; the secondary image mirrors the same shape so PDF +
 * editor render the same content. */

.page--two_images_text_center {
    grid-template-areas:
        "image"
        "text"
        "imageSecondary";
    grid-template-columns: 1fr;
    grid-template-rows: 40% 20% 40%;
}

.page--two_images_text_center .region-image-secondary {
    grid-area: imageSecondary;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    border-top: 1pt solid #ccc;
}

.page--two_images_text_center .region-image-secondary img {
    max-width: 100%;
    max-height: 100%;
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
        # Phase 1 C3 (2026-05-28). Mirrors + full-bleed-no-text.
        "image_bottom_text_top",
        "image_right_text_left",
        "image_full_no_text",
        # Phase 2 C2 (2026-05-28). Multi-image layout.
        "two_images_text_center",
    }
    if layout not in valid:
        # Defensive default: fall back to the most generic layout.
        return "page--image_top_text_bottom"
    return f"page--{layout}"


# Picture-Book Layout Expansion Phase 2 C2 (2026-05-28). Multi-image
# layouts use the M1 storage strategy: PRIMARY image stays on
# Page.image_asset_id; SECONDARY image lives in
# layout_config[layout].secondary_image_asset_id via
# _read_secondary_image_asset_id. The walker emits a second
# .region-image-secondary block after the text region for these
# layouts. C2 ships two_images_text_center; C3..C5 extend this set
# as each layout's CSS + dispatch lands.
_MULTI_IMAGE_LAYOUTS: frozenset[str] = frozenset(
    {
        "two_images_text_center",
    }
)


# --- Fix B (PICTURE-BOOK-TEXT-CONFIGURATION-01, 4c-B sub-item) ---
#
# Per-layout namespace helpers. Mirror the TypeScript
# ``frontend/src/utils/layoutConfig.ts`` exactly so in-editor render
# + PDF render resolve the same per-layout settings.
#
# Pre-Fix-B layout_config was a flat dict accumulating cross-layout
# keys. Fix B namespaces by layout: layout_config[layout] holds the
# layout's settings; sibling layouts' namespaces survive switches.
# Legacy-flat configs are transparently treated as the current
# layout's namespace (auto-migrated on next write through the
# frontend's writeLayoutNamespace).

_KNOWN_LAYOUTS: frozenset[str] = frozenset(
    {
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
        "comic_panel_grid",
        # Picture-Book Layout Expansion Phase 1 (2026-05-28).
        # Per-layout CSS rules + ``_render_page`` branches arrive
        # in C3; this commit only extends the namespace whitelist
        # so layout_config namespaces survive layout switches into
        # these new layouts without the legacy-flat back-compat
        # path treating them as unknown.
        "image_bottom_text_top",
        "image_right_text_left",
        "image_full_no_text",
        # Picture-Book Layout Expansion Phase 2 C1 (2026-05-28).
        # Multi-image layouts using the M1 storage strategy: PRIMARY
        # image stays on Page.image_asset_id (unchanged); SECONDARY
        # image lives in layout_config[layout].secondary_image_asset_id
        # via _read_secondary_image_asset_id (below). Subsequent
        # commits add the per-layout CSS rules + _image_layout_style
        # branches + _render_page branches; this commit only extends
        # the namespace whitelist so layout_config namespaces survive
        # layout switches into these new layouts.
        "two_images_text_center",
        "split_horizontal",
        "split_vertical",
        "image_border_text_center",
    }
)


def _looks_namespaced(config: dict[str, Any] | None) -> bool:
    """True iff at least one top-level key matches a known layout
    name AND its value is a dict. Mirrors ``looksNamespaced`` in
    frontend/src/utils/layoutConfig.ts."""
    if not isinstance(config, dict):
        return False
    for key, value in config.items():
        if key not in _KNOWN_LAYOUTS:
            continue
        if isinstance(value, dict):
            return True
    return False


def _read_layout_namespace(
    config: dict[str, Any] | None,
    layout: str,
) -> dict[str, Any] | None:
    """Extract the active layout's namespace. Mirrors
    ``readLayoutNamespace`` in frontend/src/utils/layoutConfig.ts.

    - Namespaced config: returns ``config[layout]`` if present + dict.
    - Legacy-flat config: returns the whole flat dict (back-compat).
    - None / not-a-dict / namespaced-but-layout-absent: returns None.
    """
    if not isinstance(config, dict):
        return None
    if _looks_namespaced(config):
        namespaced = config.get(layout)
        if isinstance(namespaced, dict):
            return namespaced
        return None
    # Legacy flat shape: treat the whole config as the current
    # layout's namespace. The frontend's writeLayoutNamespace
    # migrates it on next write.
    return config


def _read_secondary_image_asset_id(
    config: dict[str, Any] | None,
    layout: str,
) -> str | None:
    """Extract the SECONDARY image asset id from a multi-image
    layout's namespace (Picture-Book Layout Expansion Phase 2 — M1
    storage). Mirrors the TypeScript ``readSecondaryImageAssetId`` in
    ``frontend/src/utils/layoutConfig.ts``.

    Phase 2 multi-image layouts (``two_images_text_center``,
    ``split_horizontal``, ``split_vertical``,
    ``image_border_text_center``) keep the PRIMARY image on
    ``Page.image_asset_id`` (unchanged from single-image layouts) and
    store the SECONDARY image's asset id under
    ``layout_config[layout].secondary_image_asset_id``.

    Returns ``None`` when:
    - config is None or not a dict
    - layout has no namespace
    - namespace has no ``secondary_image_asset_id`` key
    - the stored value is not a string (defensive shape-drift guard)
    """
    namespace = _read_layout_namespace(config, layout)
    if namespace is None:
        return None
    value = namespace.get("secondary_image_asset_id")
    return value if isinstance(value, str) else None


def _read_bubble_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """4c-B-2 C1 read-path shim. Mirrors the TypeScript
    ``readBubbleConfig`` in ``frontend/src/components/PageCanvas.tsx``
    and ``LayoutConfigSpeechBubble.tsx``: per-bubble fields live
    under ``layout_config.bubbles[0]``; flat top-level keys are
    honoured as a legacy fallback. ``bubbles[0]`` precedence is
    enforced by spreading it AFTER the flat keys.
    """
    if not isinstance(config, dict):
        return {}
    flat = {k: v for k, v in config.items() if k != "bubbles"}
    bubbles = config.get("bubbles")
    bubbles_zero: dict[str, Any] = {}
    if isinstance(bubbles, list) and bubbles and isinstance(bubbles[0], dict):
        bubbles_zero = bubbles[0]
    return {**flat, **bubbles_zero}


def _hex_to_rgb(hex_str: Any) -> tuple[int, int, int] | None:
    """4c-B-2 C2: parse ``#rrggbb`` / ``rrggbb`` to an RGB triple.
    Mirrors the TypeScript ``hexToRgb`` in ``PageCanvas.tsx`` so
    in-editor + PDF render the same composed ``rgba(...)`` values.
    """
    if not isinstance(hex_str, str):
        return None
    match = re.match(r"^#?([a-fA-F0-9]{6})$", hex_str.strip())
    if not match:
        return None
    value = int(match.group(1), 16)
    return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)


def _speech_bubble_style(config: dict[str, Any] | None) -> str:
    """Compute the inline-style for a speech_bubble page's bubble.

    Mirrors PageCanvas.tsx's speechBubbleInlineStyle so the
    in-editor view + the printed PDF render the same bubble
    position + opacity + size. anchor_position default is
    bottom-center (Session 4 D2a).
    """
    # 4c-B-2 C1: read through bubbles[0] wrapper with flat fallback.
    merged = _read_bubble_config(config)
    anchor_raw = merged.get("anchor_position")
    anchor = (
        anchor_raw
        if isinstance(anchor_raw, str)
        else "bottom-center"
    )
    opacity_raw = merged.get("opacity")
    if isinstance(opacity_raw, (int, float)):
        opacity = max(0.3, min(1.0, float(opacity_raw)))
    else:
        opacity = 1.0
    # PB-PHASE4 Session 4c-B-1 smoke Bug 1 (2026-05-18):
    # bubble_width replaces legacy ``size`` as the canonical width
    # key; bubble_height is the new height knob. Backward-compat:
    # read ``size`` as a fallback for bubble_width when the new
    # key is absent. bubble_height has no legacy fallback (new
    # property; default 30).
    width_raw = merged.get("bubble_width")
    if not isinstance(width_raw, (int, float)):
        width_raw = merged.get("size")
    if isinstance(width_raw, (int, float)):
        width_pct = max(20, min(80, int(width_raw)))
    else:
        width_pct = 40
    height_raw = merged.get("bubble_height")
    if isinstance(height_raw, (int, float)):
        height_pct = max(15, min(60, int(height_raw)))
    else:
        height_pct = 30

    # 4c-B-2 C2: Tier 1 ``background_color`` composes with
    # ``opacity`` into a single rgba() value. Default white keeps
    # pre-C2 pages rendering identically.
    bg_rgb = _hex_to_rgb(merged.get("background_color")) or (255, 255, 255)
    bg = f"rgba({bg_rgb[0]}, {bg_rgb[1]}, {bg_rgb[2]}, {opacity})"
    width = f"width: {width_pct}%;"
    height = f"height: {height_pct}%;"

    # 4c-B-2 C2: Tier 1 Visual Style emit. Mirrors the TypeScript
    # branch in PageCanvas.tsx::speechBubbleInlineStyle so the
    # printed PDF + the in-editor view stay visually in sync.
    border_color_rgb = _hex_to_rgb(merged.get("border_color")) or (0, 0, 0)
    border_color_css = (
        f"rgb({border_color_rgb[0]}, {border_color_rgb[1]}, {border_color_rgb[2]})"
    )
    border_width_raw = merged.get("border_width")
    if isinstance(border_width_raw, (int, float)):
        border_width_px = max(0, min(8, int(border_width_raw)))
    else:
        border_width_px = 2
    border_style_raw = merged.get("border_style")
    border_style = (
        border_style_raw
        if border_style_raw in {"solid", "dashed", "dotted", "none"}
        else "solid"
    )
    border_radius_raw = merged.get("border_radius")
    if isinstance(border_radius_raw, (int, float)):
        border_radius_pct = max(0, min(50, int(border_radius_raw)))
    else:
        border_radius_pct = 50
    shadow_on = merged.get("shadow")
    shadow_on = shadow_on if isinstance(shadow_on, bool) else True
    shadow_intensity_raw = merged.get("shadow_intensity")
    if isinstance(shadow_intensity_raw, (int, float)):
        shadow_intensity = max(0, min(10, int(shadow_intensity_raw)))
    else:
        shadow_intensity = 5
    # Shadow intensity 0-10 maps to offset_y = intensity/2 px,
    # blur = intensity*2 px, 30% black drop-shadow.
    if shadow_on:
        box_shadow = (
            f"0 {shadow_intensity / 2}px {shadow_intensity * 2}px "
            "rgba(0, 0, 0, 0.3)"
        )
    else:
        box_shadow = "none"
    # PADDING-FONT-STYLE-01 C1: uniform padding emit. Default 12 pt
    # mirrors the TS default; overrides the static CSS rule
    # ``.page--speech_bubble .region-text { padding: 10pt 14pt }``
    # by inline-style specificity.
    padding_raw = merged.get("padding")
    if isinstance(padding_raw, (int, float)):
        padding_px = max(0, min(32, int(padding_raw)))
    else:
        padding_px = 12

    tier1 = (
        f"border: {border_width_px}px {border_style} {border_color_css};"
        f" border-radius: {border_radius_pct}%;"
        f" box-shadow: {box_shadow};"
        f" padding: {padding_px}pt;"
    )

    # 4c-B-2 C3: Tier 2 Typography emit. Mirrors PageCanvas.tsx
    # speechBubbleInlineStyle so the printed PDF matches the
    # in-editor view. Defaults: Atkinson Hyperlegible 14 pt normal
    # black centered.
    font_family_raw = merged.get("font_family")
    font_family = (
        font_family_raw
        if isinstance(font_family_raw, str) and font_family_raw
        else "Atkinson Hyperlegible"
    )
    font_size_raw = merged.get("font_size")
    if isinstance(font_size_raw, (int, float)):
        font_size_pt = max(10, min(32, int(font_size_raw)))
    else:
        font_size_pt = 14
    font_weight_raw = merged.get("font_weight")
    font_weight = (
        font_weight_raw
        if font_weight_raw in {"normal", "bold"}
        else "normal"
    )
    # PADDING-FONT-STYLE-01 C2: italic boolean -> CSS font-style.
    italic_raw = merged.get("italic")
    font_style = "italic" if italic_raw is True else "normal"
    text_color_rgb = _hex_to_rgb(merged.get("text_color")) or (0, 0, 0)
    text_color_css = (
        f"rgb({text_color_rgb[0]}, {text_color_rgb[1]}, {text_color_rgb[2]})"
    )
    text_align_raw = merged.get("text_align")
    text_align = (
        text_align_raw
        if text_align_raw in {"left", "center", "right"}
        else "center"
    )
    tier2 = (
        f"font-family: '{font_family}', sans-serif;"
        f" font-size: {font_size_pt}pt;"
        f" font-weight: {font_weight};"
        f" font-style: {font_style};"
        f" color: {text_color_css};"
        f" text-align: {text_align};"
    )

    reset = "top: auto; right: auto; bottom: auto; left: auto;"
    # PB-PHASE4 Session 4c-B-1 smoke Bug 1 (2026-05-18): added
    # the 3 edge-midpoint positions (top-center, middle-left,
    # middle-right) that Finding A's frontend shipped but the
    # backend silently kept missing — would have rendered as
    # bottom-center in the PDF for those 3 anchors. Mirrors
    # the frontend switch in PageCanvas.tsx::speechBubbleInlineStyle.
    positions = {
        "top-left": "top: 16pt; left: 16pt; transform: none;",
        "top-center": (
            "top: 16pt; left: 50%; transform: translateX(-50%);"
        ),
        "top-right": "top: 16pt; right: 16pt; transform: none;",
        "middle-left": (
            "top: 50%; left: 16pt; transform: translateY(-50%);"
        ),
        "center": (
            "top: 50%; left: 50%; transform: translate(-50%, -50%);"
        ),
        "middle-right": (
            "top: 50%; right: 16pt; transform: translateY(-50%);"
        ),
        "bottom-left": "bottom: 16pt; left: 16pt; transform: none;",
        "bottom-center": (
            "bottom: 16pt; left: 50%; transform: translateX(-50%);"
        ),
        "bottom-right": (
            "bottom: 16pt; right: 16pt; transform: none;"
        ),
    }
    pos = positions.get(anchor, positions["bottom-center"])
    return f"{reset} {pos} background: {bg}; {width} {height} {tier1} {tier2}"


def _compute_tier_text_style(config: dict[str, Any] | None) -> str:
    """Compute the Tier 1 (Visual Style) + Tier 2 (Typography)
    inline-style string for a non-bubble text container.

    PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 2 C3. Mirrors the
    frontend ``computeTierTextStyles`` in PageCanvas.tsx. Returns
    ONLY the Tier subset — callers compose layout-specific
    background + positioning on top.

    Used by image_full_text_overlay (Session 1 C6), and Session 2
    C3 extends to image_top_text_bottom + image_left_text_right.
    speech_bubble has its own derivation inside
    _speech_bubble_style that intentionally diverges (positioning
    + width/height defaults + bg-with-opacity composition).

    Defaults — Tier fields ABSENT means the corresponding CSS
    property is NOT emitted (CSS-module default takes effect).
    Border gated on width > 0 AND style != "none". Shadow gated
    on the shadow boolean. Padding emits only when set. Tier 2
    fields ABSENT also leave CSS-module defaults.
    """
    if not isinstance(config, dict):
        return ""

    tier1_parts: list[str] = []
    border_color_rgb = _hex_to_rgb(config.get("border_color")) or (0, 0, 0)
    border_width_raw = config.get("border_width")
    border_width = (
        max(0, min(8, int(border_width_raw)))
        if isinstance(border_width_raw, (int, float))
        else 0
    )
    border_style_raw = config.get("border_style")
    border_style = (
        border_style_raw
        if border_style_raw in {"solid", "dashed", "dotted", "none"}
        else "none"
    )
    if border_width > 0 and border_style != "none":
        tier1_parts.append(
            f"border: {border_width}px {border_style} "
            f"rgb({border_color_rgb[0]}, {border_color_rgb[1]}, {border_color_rgb[2]});"
        )
    border_radius_raw = config.get("border_radius")
    if isinstance(border_radius_raw, (int, float)) and border_radius_raw > 0:
        tier1_parts.append(
            f"border-radius: {max(0, min(50, int(border_radius_raw)))}%;"
        )
    shadow_on = config.get("shadow")
    if isinstance(shadow_on, bool) and shadow_on:
        shadow_intensity_raw = config.get("shadow_intensity")
        shadow_intensity = (
            max(0, min(10, int(shadow_intensity_raw)))
            if isinstance(shadow_intensity_raw, (int, float))
            else 5
        )
        tier1_parts.append(
            f"box-shadow: 0 {shadow_intensity / 2}px "
            f"{shadow_intensity * 2}px rgba(0, 0, 0, 0.3);"
        )
    padding_raw = config.get("padding")
    if isinstance(padding_raw, (int, float)):
        tier1_parts.append(
            f"padding: {max(0, min(32, int(padding_raw)))}px;"
        )

    tier2_parts: list[str] = []
    font_family_raw = config.get("font_family")
    if isinstance(font_family_raw, str) and font_family_raw:
        tier2_parts.append(f"font-family: {font_family_raw};")
    font_size_raw = config.get("font_size")
    if isinstance(font_size_raw, (int, float)):
        tier2_parts.append(
            f"font-size: {max(10, min(32, int(font_size_raw)))}pt;"
        )
    font_weight_raw = config.get("font_weight")
    if font_weight_raw in ("bold", "normal"):
        tier2_parts.append(f"font-weight: {font_weight_raw};")
    italic_raw = config.get("italic")
    if isinstance(italic_raw, bool):
        tier2_parts.append(
            f"font-style: {'italic' if italic_raw else 'normal'};"
        )
    text_color_rgb = _hex_to_rgb(config.get("text_color"))
    if text_color_rgb is not None:
        tier2_parts.append(
            f"color: rgb({text_color_rgb[0]}, {text_color_rgb[1]}, {text_color_rgb[2]});"
        )
    text_align_raw = config.get("text_align")
    if text_align_raw in ("left", "center", "right"):
        tier2_parts.append(f"text-align: {text_align_raw};")

    return " ".join(tier1_parts + tier2_parts)


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

    if layout in ("image_top_text_bottom", "image_bottom_text_top"):
        # Phase 1 C3 mirror: image_bottom_text_top shares the
        # image_position + image_fit + Tier1/2 wiring with its
        # parent. The grid-template-rows swap (70/30 vs 30/70)
        # lives in the CSS rule, not here.
        pos = config.get("image_position")
        if pos == "left":
            region_image_style = "justify-content: flex-start;"
        elif pos == "right":
            region_image_style = "justify-content: flex-end;"
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"
        # Session 2 C3: Tier 1+2 inline-style on the text region.
        # Mirrors PageCanvas.tsx computeTierTextStyles wiring.
        region_text_style = _compute_tier_text_style(config)

    elif layout in ("image_left_text_right", "image_right_text_left"):
        # Phase 1 C3 mirror: image_right_text_left flips the column
        # order so the IMAGE stays at its dominant ``split_ratio``
        # share (default 60 %) but lives on the right side. Same
        # stored field; emit ``${100 - ratio}% ${ratio}%`` for the
        # mirror so the text column comes first.
        ratio_raw = config.get("split_ratio")
        ratio = (
            max(50, min(70, int(ratio_raw)))
            if isinstance(ratio_raw, (int, float))
            else 60
        )
        if layout == "image_left_text_right":
            canvas_style = f"grid-template-columns: {ratio}% {100 - ratio}%;"
        else:
            canvas_style = f"grid-template-columns: {100 - ratio}% {ratio}%;"
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"
        # Session 2 C3: Tier 1+2 inline-style on the text region.
        region_text_style = _compute_tier_text_style(config)

    elif layout == "image_full_no_text":
        # Phase 1 C3: full-bleed image, no text region. Only
        # image_fit applies; the text region is suppressed at the
        # ``_render_page`` level (mirror of how text_only
        # suppresses the image region).
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"

    elif layout == "two_images_text_center":
        # Phase 2 C2 (2026-05-28): multi-image layout. Tier-Property
        # text band in the centre (40/20/40 grid rows). The secondary
        # image region is rendered separately in ``_render_page``;
        # this branch only contributes the text region's Tier 1+2
        # style (mirrors the existing image_top_text_bottom +
        # image_left_text_right wiring) and any image_fit override
        # for both images. Per the M1 plan, both images share the
        # same image_fit field — splitting per-image_fit is a Phase 3
        # decision.
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"
        region_text_style = _compute_tier_text_style(config)

    elif layout == "image_full_text_overlay":
        pos = config.get("text_position")
        opacity_raw = config.get("text_backdrop_opacity")
        opacity = (
            max(0.3, min(0.8, float(opacity_raw)))
            if isinstance(opacity_raw, (int, float))
            else 0.45
        )
        # PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 +
        # PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C6:
        # Tier 1 background_color composes with the existing
        # text_backdrop_opacity. Default #000000 keeps legacy
        # rendering identical; any custom color tints the
        # backdrop without dropping the opacity dimension.
        # Mirrors PageCanvas.tsx overlayTextStyle derivation.
        bg_rgb = _hex_to_rgb(config.get("background_color")) or (0, 0, 0)
        bg = f"background: rgba({bg_rgb[0]}, {bg_rgb[1]}, {bg_rgb[2]}, {opacity});"

        # Session 2 C3: Tier 1+2 derivation extracted into
        # _compute_tier_text_style. Same subset emitted as for
        # image_top + image_left; layout-specific bg + positioning
        # + width/height stay inline below.
        tier_extras = _compute_tier_text_style(config)

        # C7 Bug D scope-add: text_container_width +
        # text_container_height. Width defaults to 100%; height
        # defaults to position-derived (middle → 70%; top/bottom
        # → auto). Setting either overrides via explicit %.
        text_container_width_raw = config.get("text_container_width")
        if isinstance(text_container_width_raw, (int, float)):
            width_pct = max(30, min(100, int(text_container_width_raw)))
            side_offset = (100 - width_pct) / 2
            width_style = f"left: {side_offset}%; right: {side_offset}%; "
        else:
            width_style = "left: 0; right: 0; "

        text_container_height_raw = config.get("text_container_height")
        if isinstance(text_container_height_raw, (int, float)):
            height_pct = max(15, min(100, int(text_container_height_raw)))
            explicit_max_height = f"max-height: {height_pct}%;"
        else:
            explicit_max_height = None

        if pos == "top":
            max_h = explicit_max_height or ""
            region_text_style = (
                f"top: 0; bottom: auto; {width_style}{bg} {max_h} {tier_extras}"
            ).strip()
        elif pos == "middle":
            max_h = explicit_max_height or "max-height: 70%;"
            region_text_style = (
                f"top: 50%; bottom: auto; transform: translateY(-50%); "
                f"{max_h} {width_style}{bg} {tier_extras}"
            ).strip()
        else:
            max_h = explicit_max_height or ""
            region_text_style = (
                f"top: auto; bottom: 0; {width_style}{bg} {max_h} {tier_extras}"
            ).strip()

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
    inner = (
        "".join(_render_tiptap_node(c) for c in children)
        if isinstance(children, list)
        else ""
    )

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
        inner = f'<span style="font-family: \'{font_family}\'">{inner}</span>'
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

    # Phase 1 C3 (2026-05-28): image_full_no_text suppresses the
    # TEXT region entirely (mirror of text_only suppressing the
    # image region). Per adjudicated Q5: text_content stays in
    # storage but does NOT render for this layout — switching back
    # to a text-bearing layout restores the text.
    text_region_html = ""
    if layout != "image_full_no_text":
        text_region_html = (
            f'<div class="region region-text"{text_attr}>'
            f'{text_html}'
            f'</div>'
        )

    # Phase 2 C2 (2026-05-28): multi-image layouts emit a SECONDARY
    # image region after the text region. The secondary asset id
    # lives in layout_config[layout].secondary_image_asset_id via
    # _read_secondary_image_asset_id (M1 storage). When the asset is
    # missing OR the asset id doesn't resolve to a URL, the region
    # still renders as an empty div so the grid template's third
    # row stays present (mirrors the editor's placeholder pattern).
    image_secondary_region_html = ""
    if layout in _MULTI_IMAGE_LAYOUTS:
        secondary_asset_id = _read_secondary_image_asset_id(
            raw_config, layout
        )
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
                        f'<img style="{image_style}" '
                        f'src="{escape(secondary_url)}" alt="" />'
                    )
                else:
                    image_secondary_html = (
                        f'<img src="{escape(secondary_url)}" alt="" />'
                    )
        image_secondary_region_html = (
            f'<div class="region region-image-secondary">'
            f'{image_secondary_html}'
            f'</div>'
        )

    return (
        f'<section class="page {css_class}"{canvas_attr}>'
        f'{image_region_html}'
        f'{text_region_html}'
        f'{image_secondary_region_html}'
        f'</section>'
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
        meta_tags.append(
            f'<meta name="description" content="{escape(description)}" />'
        )
    # PDF-BLEED-MARKS-01 Q3: extend the Producer metadata with a
    # ``(bleed)`` suffix when bleed is on. Downstream tools that
    # inspect PDF metadata (KDP, print shops, archivers) see the
    # marker without needing a custom field.
    producer = (
        "Bibliogon picture-book PDF (bleed)"
        if picture_book_bleed_marks
        else "Bibliogon picture-book PDF"
    )
    meta_tags.append(
        f'<meta name="generator" content="{escape(producer)}" />'
    )
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
