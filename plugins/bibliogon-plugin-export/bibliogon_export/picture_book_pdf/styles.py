"""CSS + style computation for picture-book PDF rendering.

KDP trim-size formats, the base ``@page`` CSS, and the per-element
style builders (speech-bubble, tier-text, image-layout). Consumes the
layout-config readers in :mod:`.layout`.
"""

from __future__ import annotations

import re
from typing import Any

from .layout import _read_bubble_config

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
    bleed_block = f"    bleed: {_BLEED_MM}mm;\n    marks: crop;\n" if bleed_marks else ""
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

/* Phase 2 C3 (2026-05-28). split_horizontal: two equal-width
 * images side by side (50 / 50), Tier-Property caption below
 * spanning both columns. The grid template mirrors the editor's
 * .canvasLayoutSplitHorizontal so the in-editor view + PDF
 * render the same content. */

.page--split_horizontal {
    grid-template-areas:
        "image imageSecondary"
        "text text";
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 75% 25%;
}

.page--split_horizontal .region-image {
    border-right: 1pt solid #ccc;
}

.page--split_horizontal .region-image-secondary {
    grid-area: imageSecondary;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
}

.page--split_horizontal .region-image-secondary img {
    max-width: 100%;
    max-height: 100%;
}

.page--split_horizontal .region-text {
    border-top: 1pt solid #ccc;
}

/* Phase 2 C4 (2026-05-28). split_vertical: two equal-height
 * images directly stacked + thin caption strip at the bottom.
 * Images render adjacent (no separator border) so the spread
 * reads as a single visual unit. */

.page--split_vertical {
    grid-template-areas:
        "image"
        "imageSecondary"
        "text";
    grid-template-columns: 1fr;
    grid-template-rows: 45% 45% 10%;
}

.page--split_vertical .region-image-secondary {
    grid-area: imageSecondary;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
}

.page--split_vertical .region-image-secondary img {
    max-width: 100%;
    max-height: 100%;
}

.page--split_vertical .region-text {
    border-top: 1pt solid #ccc;
}

/* Phase 2 C5 (2026-05-28). image_border_text_center: PRIMARY image
 * fills the entire page (single-image layout, NOT in
 * _MULTI_IMAGE_LAYOUTS); text region is an absolutely-positioned
 * centred panel with semi-transparent backdrop. The image showing
 * around the panel produces the "frame / border" visual. Mirrors
 * the editor's .canvasLayoutImageBorderTextCenter. */

.page--image_border_text_center {
    grid-template-areas: "image";
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
}

.page--image_border_text_center .region-text {
    position: absolute;
    top: 15%;
    bottom: 15%;
    left: 15%;
    right: 15%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1em;
    border-radius: 4pt;
    color: white;
}

/* Phase 3 C1 (2026-05-28). Collage layout: N freely-positioned
 * images + N optional text regions at absolute percentage-based
 * coords. C1 ships the page container class only — the per-image
 * + per-text-region rendering branches (with absolute positioning
 * + rotation + z-index ordering) land in C5 alongside the
 * walker's ``_render_page`` collage branch.
 *
 * Distinct from the grid-based picture-book layouts: position
 * relative on the page container, every collage child
 * absolutely positioned inside it. The grid-template-* rules
 * intentionally omitted — the children use top/left/width/height
 * percentages instead. */

.page--collage {
    position: relative;
}
"""


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
    anchor = anchor_raw if isinstance(anchor_raw, str) else "bottom-center"
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
    border_color_css = f"rgb({border_color_rgb[0]}, {border_color_rgb[1]}, {border_color_rgb[2]})"
    border_width_raw = merged.get("border_width")
    if isinstance(border_width_raw, (int, float)):
        border_width_px = max(0, min(8, int(border_width_raw)))
    else:
        border_width_px = 2
    border_style_raw = merged.get("border_style")
    border_style = (
        border_style_raw if border_style_raw in {"solid", "dashed", "dotted", "none"} else "solid"
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
        box_shadow = f"0 {shadow_intensity / 2}px {shadow_intensity * 2}px rgba(0, 0, 0, 0.3)"
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
    font_weight = font_weight_raw if font_weight_raw in {"normal", "bold"} else "normal"
    # PADDING-FONT-STYLE-01 C2: italic boolean -> CSS font-style.
    italic_raw = merged.get("italic")
    font_style = "italic" if italic_raw is True else "normal"
    text_color_rgb = _hex_to_rgb(merged.get("text_color")) or (0, 0, 0)
    text_color_css = f"rgb({text_color_rgb[0]}, {text_color_rgb[1]}, {text_color_rgb[2]})"
    text_align_raw = merged.get("text_align")
    text_align = text_align_raw if text_align_raw in {"left", "center", "right"} else "center"
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
        "top-center": ("top: 16pt; left: 50%; transform: translateX(-50%);"),
        "top-right": "top: 16pt; right: 16pt; transform: none;",
        "middle-left": ("top: 50%; left: 16pt; transform: translateY(-50%);"),
        "center": ("top: 50%; left: 50%; transform: translate(-50%, -50%);"),
        "middle-right": ("top: 50%; right: 16pt; transform: translateY(-50%);"),
        "bottom-left": "bottom: 16pt; left: 16pt; transform: none;",
        "bottom-center": ("bottom: 16pt; left: 50%; transform: translateX(-50%);"),
        "bottom-right": ("bottom: 16pt; right: 16pt; transform: none;"),
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
        max(0, min(8, int(border_width_raw))) if isinstance(border_width_raw, (int, float)) else 0
    )
    border_style_raw = config.get("border_style")
    border_style = (
        border_style_raw if border_style_raw in {"solid", "dashed", "dotted", "none"} else "none"
    )
    if border_width > 0 and border_style != "none":
        tier1_parts.append(
            f"border: {border_width}px {border_style} "
            f"rgb({border_color_rgb[0]}, {border_color_rgb[1]}, {border_color_rgb[2]});"
        )
    border_radius_raw = config.get("border_radius")
    if isinstance(border_radius_raw, (int, float)) and border_radius_raw > 0:
        tier1_parts.append(f"border-radius: {max(0, min(50, int(border_radius_raw)))}%;")
    shadow_on = config.get("shadow")
    if isinstance(shadow_on, bool) and shadow_on:
        shadow_intensity_raw = config.get("shadow_intensity")
        shadow_intensity = (
            max(0, min(10, int(shadow_intensity_raw)))
            if isinstance(shadow_intensity_raw, (int, float))
            else 5
        )
        tier1_parts.append(
            f"box-shadow: 0 {shadow_intensity / 2}px {shadow_intensity * 2}px rgba(0, 0, 0, 0.3);"
        )
    padding_raw = config.get("padding")
    if isinstance(padding_raw, (int, float)):
        tier1_parts.append(f"padding: {max(0, min(32, int(padding_raw)))}px;")

    tier2_parts: list[str] = []
    font_family_raw = config.get("font_family")
    if isinstance(font_family_raw, str) and font_family_raw:
        tier2_parts.append(f"font-family: {font_family_raw};")
    font_size_raw = config.get("font_size")
    if isinstance(font_size_raw, (int, float)):
        tier2_parts.append(f"font-size: {max(10, min(32, int(font_size_raw)))}pt;")
    font_weight_raw = config.get("font_weight")
    if font_weight_raw in ("bold", "normal"):
        tier2_parts.append(f"font-weight: {font_weight_raw};")
    italic_raw = config.get("italic")
    if isinstance(italic_raw, bool):
        tier2_parts.append(f"font-style: {'italic' if italic_raw else 'normal'};")
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
        ratio = max(50, min(70, int(ratio_raw))) if isinstance(ratio_raw, (int, float)) else 60
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

    elif layout == "split_horizontal":
        # Phase 2 C3 (2026-05-28): two equal-width images side by
        # side (50 / 50 columns), Tier-Property caption below
        # spanning both columns (75 / 25 row split). Both images
        # share the same image_fit field per the M1 design.
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"
        region_text_style = _compute_tier_text_style(config)

    elif layout == "split_vertical":
        # Phase 2 C4 (2026-05-28): two equal-height images directly
        # stacked + thin Tier-Property caption strip at the bottom
        # (45 / 45 / 10 row split). Distinct from
        # two_images_text_center which separates the images with a
        # prominent text band (40 / 20 / 40). Shared image_fit per
        # the M1 design.
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"
        region_text_style = _compute_tier_text_style(config)

    elif layout == "image_border_text_center":
        # Phase 2 C5 (2026-05-28): PRIMARY image fills the page as a
        # decorative frame; centred text panel with semi-transparent
        # backdrop. Single-image layout (NOT in _MULTI_IMAGE_LAYOUTS).
        # The CSS rule handles absolute positioning + default
        # rgba(0,0,0,0.5) backdrop; this branch composes the inline-
        # style overrides for text_backdrop_opacity tuning + Tier 1+2
        # text styles (mirrors image_full_text_overlay's background
        # composition).
        fit = config.get("image_fit")
        if fit in ("contain", "cover"):
            image_style = f"object-fit: {fit};"
        bg_rgb = _hex_to_rgb(config.get("background_color")) or (0, 0, 0)
        opacity_raw = config.get("text_backdrop_opacity")
        # Default 0.5 matches the CSS module's rgba(0,0,0,0.5).
        opacity = (
            max(0.3, min(0.8, float(opacity_raw))) if isinstance(opacity_raw, (int, float)) else 0.5
        )
        bg_parts = [f"background: rgba({bg_rgb[0]}, {bg_rgb[1]}, {bg_rgb[2]}, {opacity});"]
        tier_style = _compute_tier_text_style(config)
        if tier_style:
            bg_parts.append(tier_style)
        region_text_style = " ".join(bg_parts)

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
