"""Comic-book PDF generation via WeasyPrint (plugin-comics Session 2 C3).

Parallel walker to ``bibliogon_export.picture_book_pdf`` per the
exploration doc (``docs/explorations/comic-foundation.md:192-193``).
Picture-book and comic-book PDFs share NO render code by design —
the visual shapes are fundamentally different (single-region vs
multi-panel-with-bubbles) so a unified walker would just be two
walkers in a trench-coat.

What IS shared with picture-book:
- KDP trim sizes + ``_format_css`` (Q4 a decision: reuse the 5
  picture-book formats; comics-specific trim sizes deferred to a
  follow-up filing if real print-shop demand surfaces).
- Bleed-marks pattern (PDF-BLEED-MARKS-01): same
  ``@page { bleed: 3mm; marks: crop }`` emit.
- Font-face CSS via ``picture_book_fonts.font_face_css()``.
- CSS variables (``--page-w``, ``--page-h``, ``--content-h``) for
  the per-format dimensions.

What's comic-specific:
- N-panels-per-page CSS Grid layout driven by
  ``Page.layout_config.comic_grid_template`` (Q1 β decision:
  ``single_panel`` / ``grid_2x2`` / ``grid_3x3``; comic page-level
  layout selector lives in the picture-book-reused
  ``layout_config`` JSON column).
- N-bubbles-per-panel rendered as positioned elements with
  bubble-type CSS variants (6 types per comic-foundation.md:321-324:
  speech / thought / narration / shout / whisper / sound_effect).
- SVG tail primitive per bubble (Track-B audit decision: SVG path
  over CSS triangle for anti-aliasing at print zoom).
- Plain text in bubbles (Q2 a decision: TipTap deferred).

Dispatch chain:
``GET /api/books/{book_id}/export/pdf`` → ``bibliogon_export.routes
.export()`` → branches on ``Book.book_type == "comic_book"`` →
lazy-imports + calls ``generate_comic_book_pdf`` from this module.
The lazy import respects the plugin dependency direction
(plugin-comics ``depends_on = ["export"]``; plugin-export does
NOT depend on plugin-comics — lazy import avoids the
circular-load risk flagged in the C3 stop-conditions).
"""

from __future__ import annotations

import json
import math
from html import escape
from pathlib import Path
from typing import Any

# Q4 a: reuse picture-book's KDP format set + CSS-emit helpers +
# fonts. plugin-comics ``depends_on = ["export"]`` so the import
# direction is legitimate (comics → export).
from bibliogon_export.picture_book_pdf import (
    DEFAULT_PICTURE_BOOK_FORMAT,
    PICTURE_BOOK_FORMATS,
    _format_css,
    _resolve_picture_book_format,
)
from bibliogon_export.picture_book_fonts import font_face_css


# --- Comic page-level grid templates (Q1 β JSON storage) ---

# Page-level layout for comic pages lives in
# ``Page.layout_config.comic_grid_template`` (JSON-storage decision
# Q1 β; no new schema enum). Valid template ids:
#
# Standard Layouts shipped by Phase 1 (PLUGIN-COMICS-PHASE-1-
# MULTI-PANEL-LAYOUTS-01, 2026-05-20). 6 user-facing + 1 legacy.
# Symmetric-only per α decision (asymmetric + variable deferred).
COMIC_GRID_TEMPLATES = (
    "single_panel",  # 1 panel (Splash)
    "grid_1x2",      # 2 panels side-by-side
    "grid_2x1",      # 2 panels stacked
    "grid_2x2",      # 4 panels standard grid
    "grid_2x3",      # 6 panels two-tier (2 rows × 3 cols)
    "grid_3x2",      # 6 panels three-tier (3 rows × 2 cols)
    "grid_3x3",      # 9 panels (legacy / advanced; not in default picker)
)
DEFAULT_COMIC_GRID_TEMPLATE = "single_panel"

# CSS Grid template per layout id. Each value pairs with the
# expected number of panels (N): single_panel = 1, grid_1x2 = 2,
# grid_2x1 = 2, grid_2x2 = 4, grid_2x3 = 6, grid_3x2 = 6,
# grid_3x3 = 9. The walker doesn't enforce panel-count match —
# it renders whatever ``comic_panels`` rows exist, sorted by
# position, into the grid cells in order.
_GRID_TEMPLATE_CSS: dict[str, str] = {
    "single_panel": (
        "grid-template-columns: 1fr;\n"
        "    grid-template-rows: 1fr;"
    ),
    "grid_1x2": (
        "grid-template-columns: repeat(2, 1fr);\n"
        "    grid-template-rows: 1fr;"
    ),
    "grid_2x1": (
        "grid-template-columns: 1fr;\n"
        "    grid-template-rows: repeat(2, 1fr);"
    ),
    "grid_2x2": (
        "grid-template-columns: repeat(2, 1fr);\n"
        "    grid-template-rows: repeat(2, 1fr);"
    ),
    "grid_2x3": (
        "grid-template-columns: repeat(3, 1fr);\n"
        "    grid-template-rows: repeat(2, 1fr);"
    ),
    "grid_3x2": (
        "grid-template-columns: repeat(2, 1fr);\n"
        "    grid-template-rows: repeat(3, 1fr);"
    ),
    "grid_3x3": (
        "grid-template-columns: repeat(3, 1fr);\n"
        "    grid-template-rows: repeat(3, 1fr);"
    ),
}


def _resolve_comic_grid_template(layout_config: dict[str, Any] | None) -> str:
    """Pick the comic page-level grid template from ``Page.layout_config``.

    Per Q1 β: the comic page-level template lives in the existing
    picture-book ``layout_config`` JSON column under key
    ``comic_grid_template``. Missing / null / unknown values fall
    back to ``single_panel`` (one-panel full-bleed) — the gamma-shim
    default-on-read pattern reused everywhere in this codebase.
    """
    if isinstance(layout_config, dict):
        candidate = layout_config.get("comic_grid_template")
        if isinstance(candidate, str) and candidate in COMIC_GRID_TEMPLATES:
            return candidate
    return DEFAULT_COMIC_GRID_TEMPLATE


# --- Bubble-type CSS variants (per comic-foundation.md:321-324) ---

# Each bubble_type gets a distinct visual primitive. The MVP CSS
# below shapes the bubble container; finer details (cloud bumps,
# jagged shout edges) ship as polish in Session 3 or beyond. The
# 6 ids are the canonical set + pinned by Pydantic Literal at
# ``app.schemas.BubbleType`` so unknown values cannot reach this
# walker via the API path.
_BUBBLE_TYPE_CSS: dict[str, str] = {
    # Speech: solid border, oval shape (border-radius 50%). The
    # canonical comic-strip default.
    "speech": (
        "border: 1.5pt solid black;"
        " border-radius: 50%;"
        " background: white;"
    ),
    # Thought: double-outline rounded rectangle (cloud effect MVP
    # via box-shadow inset; full cloud bumps deferred).
    "thought": (
        "border: 1pt solid black;"
        " border-radius: 30%;"
        " background: white;"
        " box-shadow: inset 0 0 0 2pt white, inset 0 0 0 3pt black;"
        " padding: 4pt 6pt;"
    ),
    # Narration: rectangle, no border-radius. Used for caption
    # boxes outside characters' speech.
    "narration": (
        "border: 1pt solid black;"
        " border-radius: 0;"
        " background: #f5f5dc;"  # parchment / narration default
    ),
    # Shout: jagged edges via clip-path star polygon. WeasyPrint
    # supports clip-path on print profile per CSS spec.
    "shout": (
        "background: white;"
        " border: 1.5pt solid black;"
        " clip-path: polygon("
        "0% 20%, 10% 0%, 25% 15%, 40% 0%, 55% 15%,"
        " 70% 0%, 85% 15%, 100% 20%, 90% 40%,"
        " 100% 60%, 85% 75%, 100% 90%, 75% 100%,"
        " 60% 85%, 45% 100%, 30% 85%, 15% 100%,"
        " 0% 80%, 10% 60%, 0% 40%);"
    ),
    # Whisper: dashed border, semi-transparent background.
    "whisper": (
        "border: 1pt dashed black;"
        " border-radius: 30%;"
        " background: rgba(255, 255, 255, 0.7);"
    ),
    # Sound-effect: NO bubble at all — typography-as-illustration.
    # Bold styled text overlaying the panel.
    "sound_effect": (
        "border: none;"
        " background: transparent;"
        " font-weight: 900;"
        " font-style: italic;"
        " text-shadow: 0 0 2pt white, 0 0 4pt white;"
    ),
}

DEFAULT_BUBBLE_TYPE_CSS = _BUBBLE_TYPE_CSS["speech"]


def _bubble_type_style(bubble_type: str) -> str:
    """Pick the CSS string for the given bubble_type with the same
    gamma-shim default-on-read pattern used throughout: unknown
    values fall back to ``speech``."""
    return _BUBBLE_TYPE_CSS.get(bubble_type, DEFAULT_BUBBLE_TYPE_CSS)


# --- Tail SVG primitive ---

# Tail direction → unit vector pointing OUT from the bubble's
# nearest edge. The SVG triangle is drawn from the bubble's edge
# in that direction, with magnitude scaled by tail_length_px.
_TAIL_DIRECTION_VECTORS: dict[str, tuple[float, float]] = {
    "N": (0.0, -1.0),
    "NE": (0.707, -0.707),
    "E": (1.0, 0.0),
    "SE": (0.707, 0.707),
    "S": (0.0, 1.0),
    "SW": (-0.707, 0.707),
    "W": (-1.0, 0.0),
    "NW": (-0.707, -0.707),
}


def _render_bubble_tail_svg(
    direction: str,
    position_pct: int,
    length_px: int,
    bubble_background_color: str = "white",
) -> str:
    """Emit the SVG tail for a comic bubble.

    Returns an empty string for ``direction == "none"`` (no tail —
    canonical for ``thought`` + ``narration`` + ``sound_effect``).
    Returns the same shape for ``direction == "auto"`` until Session
    3's nearest-edge auto-pick lands; auto currently defaults to S.

    The SVG is positioned absolutely inside the bubble's container,
    extending OUTSIDE the bubble's box in the requested direction.
    Position-along-edge is the perpendicular offset along the
    bubble's edge from the corner; tail-length scales the
    extension distance.

    Visual integration with the bubble (2026-05-27 audit close,
    approach B "overlap + mask"): the SVG carries TWO children —
    a fill polygon whose base extends ``OVERLAP_PX`` (3pt) INWARD
    past the bubble's edge to mask the bubble border segment under
    the tail base, plus two stroked ``<line>`` elements (tip →
    base-left, tip → base-right) WITHOUT a third base line. The
    bubble's own border continues uninterrupted under the mask so
    the tail looks like a natural extension of the outline.

    ``bubble_background_color`` should match the bubble's interior
    color (reads from ``bubble_config.background_color`` when
    present; falls through to the bubble-type's canonical
    background otherwise — white for speech/thought/whisper,
    ``#f5f5dc`` for narration).
    """
    if direction == "none":
        return ""
    canonical_direction = "S" if direction == "auto" else direction
    vec = _TAIL_DIRECTION_VECTORS.get(canonical_direction)
    if vec is None:
        return ""
    vx, vy = vec

    # Triangle vertices in a local coordinate system anchored at
    # the bubble's edge.
    # - tip (length_px in the direction vector)
    # - base-left + base-right (half_base perpendicular to the tip)
    # - mask-left + mask-right shifted backward by OVERLAP_PX into
    #   the bubble interior so the fill covers the bubble border
    #   under the tail base.
    # Perpendicular vector is (-vy, vx).
    half_base = 4.0
    overlap_px = 3.0
    tip_x = vx * length_px
    tip_y = vy * length_px
    base_perp_x = -vy * half_base
    base_perp_y = vx * half_base
    base_left_x = base_perp_x
    base_left_y = base_perp_y
    base_right_x = -base_perp_x
    base_right_y = -base_perp_y
    mask_inset_x = -vx * overlap_px
    mask_inset_y = -vy * overlap_px
    mask_left_x = base_left_x + mask_inset_x
    mask_left_y = base_left_y + mask_inset_y
    mask_right_x = base_right_x + mask_inset_x
    mask_right_y = base_right_y + mask_inset_y
    mask_points = (
        f"{tip_x:.1f},{tip_y:.1f} "
        f"{mask_left_x:.1f},{mask_left_y:.1f} "
        f"{mask_right_x:.1f},{mask_right_y:.1f}"
    )

    # Position the SVG element along the bubble's edge per the
    # direction vector. position_pct slides the tail's anchor
    # along the edge (0% = corner-left, 50% = mid-edge, 100% =
    # corner-right). For the MVP we map this to an offset of the
    # SVG's left/top relative to the bubble.
    edge_offset = max(0, min(100, position_pct))
    side_attr = ""
    if canonical_direction in ("S", "SE", "SW"):
        side_attr = f"bottom: 0; left: {edge_offset}%;"
    elif canonical_direction in ("N", "NE", "NW"):
        side_attr = f"top: 0; left: {edge_offset}%;"
    elif canonical_direction == "E":
        side_attr = f"right: 0; top: {edge_offset}%;"
    elif canonical_direction == "W":
        side_attr = f"left: 0; top: {edge_offset}%;"

    # SVG element extends in the direction of the tip; the mask
    # overlap (3px inward) fits within the SVG box and
    # ``overflow: visible`` lets the tip render outside it.
    # Keeping the formula identical to the pre-mask sizing
    # preserves the visible protrusion distance.
    svg_width = max(int(abs(tip_x) + half_base * 2), 4)
    svg_height = max(int(abs(tip_y) + half_base * 2), 4)
    # viewBox is centred so the triangle's tip + base offset both
    # render correctly. The SVG element overflows the bubble's
    # box; the bubble's parent .panel has overflow: visible.
    viewbox = (
        f"{-svg_width / 2:.0f} "
        f"{-svg_height / 2:.0f} "
        f"{svg_width} "
        f"{svg_height}"
    )

    return (
        f'<svg class="bubble-tail" '
        f'style="position: absolute; {side_attr} '
        f'width: {svg_width}px; height: {svg_height}px; '
        f'transform: translate(-50%, 0); overflow: visible;" '
        f'viewBox="{viewbox}">'
        f'<polygon points="{mask_points}" '
        f'fill="{bubble_background_color}" stroke="none" />'
        f'<line x1="{base_left_x:.1f}" y1="{base_left_y:.1f}" '
        f'x2="{tip_x:.1f}" y2="{tip_y:.1f}" '
        f'stroke="black" stroke-width="1.5" stroke-linecap="round" />'
        f'<line x1="{base_right_x:.1f}" y1="{base_right_y:.1f}" '
        f'x2="{tip_x:.1f}" y2="{tip_y:.1f}" '
        f'stroke="black" stroke-width="1.5" stroke-linecap="round" />'
        f"</svg>"
    )


# --- Single SVG path generator (approach A, 2026-05-27) ---
#
# Mirror of frontend/src/components/comics/bubblePath.ts. The
# bubble outline + tail render as ONE <svg> with ONE <path>. The
# bubble's text content overlays the SVG via a positioned <div>.

_TAIL_BASE_HALF_WIDTH = 6.0
_TAIL_OVERLAP = 2.0
_BEZIER_BULGE = 0.55
_BEZIER_TIP_PULLBACK = 0.15


def _fmt(n: float) -> str:
    s = f"{n:.1f}"
    return s[:-2] if s.endswith(".0") else s


def _compute_tail_geometry(
    bubble_width: float,
    bubble_height: float,
    bubble_left: float,
    bubble_top: float,
    tail_direction: str,
    tail_position_pct: int,
    tail_length_px: int,
) -> dict[str, Any] | None:
    """Compute the tail's base_left, base_right, tip points + which
    edge the tail attaches to. Mirrors the TS computeTailGeometry."""
    if tail_direction == "none":
        return None
    direction = "S" if tail_direction == "auto" else tail_direction
    vec = _TAIL_DIRECTION_VECTORS.get(direction)
    if vec is None:
        return None
    vx, vy = vec
    pct = max(0, min(100, tail_position_pct)) / 100.0
    if direction in ("S", "SE", "SW"):
        edge = "bottom"
        base_x = bubble_left + pct * bubble_width
        base_y = bubble_top + bubble_height
    elif direction in ("N", "NE", "NW"):
        edge = "top"
        base_x = bubble_left + pct * bubble_width
        base_y = bubble_top
    elif direction == "E":
        edge = "right"
        base_x = bubble_left + bubble_width
        base_y = bubble_top + pct * bubble_height
    else:  # W
        edge = "left"
        base_x = bubble_left
        base_y = bubble_top + pct * bubble_height
    if edge in ("top", "bottom"):
        base_left = (base_x - _TAIL_BASE_HALF_WIDTH, base_y)
        base_right = (base_x + _TAIL_BASE_HALF_WIDTH, base_y)
        # Clamp to bubble edge x-range.
        x_lo, x_hi = bubble_left, bubble_left + bubble_width
        base_left = (max(x_lo, min(x_hi, base_left[0])), base_left[1])
        base_right = (max(x_lo, min(x_hi, base_right[0])), base_right[1])
    else:
        base_left = (base_x, base_y - _TAIL_BASE_HALF_WIDTH)
        base_right = (base_x, base_y + _TAIL_BASE_HALF_WIDTH)
        y_lo, y_hi = bubble_top, bubble_top + bubble_height
        base_left = (base_left[0], max(y_lo, min(y_hi, base_left[1])))
        base_right = (base_right[0], max(y_lo, min(y_hi, base_right[1])))
    tip = (base_x + vx * tail_length_px, base_y + vy * tail_length_px)
    return {
        "base_left": base_left,
        "base_right": base_right,
        "tip": tip,
        "edge": edge,
    }


def _tail_subpath(
    base_left: tuple[float, float],
    base_right: tuple[float, float],
    tip: tuple[float, float],
    direction: str,
) -> str:
    """Two cubic beziers forming the curved tail edges."""
    vec = _TAIL_DIRECTION_VECTORS.get("S" if direction == "auto" else direction)
    if vec is None:
        return (
            f" L {_fmt(tip[0])} {_fmt(tip[1])}"
            f" L {_fmt(base_right[0])} {_fmt(base_right[1])}"
        )
    vx, vy = vec
    base_mid_x = (base_left[0] + base_right[0]) / 2
    base_mid_y = (base_left[1] + base_right[1]) / 2
    tip_dist = math.hypot(tip[0] - base_mid_x, tip[1] - base_mid_y)
    c1x = base_left[0] + vx * tip_dist * _BEZIER_BULGE
    c1y = base_left[1] + vy * tip_dist * _BEZIER_BULGE
    c2x = tip[0] - vx * tip_dist * _BEZIER_TIP_PULLBACK
    c2y = tip[1] - vy * tip_dist * _BEZIER_TIP_PULLBACK
    c3x = tip[0] - vx * tip_dist * _BEZIER_TIP_PULLBACK
    c3y = tip[1] - vy * tip_dist * _BEZIER_TIP_PULLBACK
    c4x = base_right[0] + vx * tip_dist * _BEZIER_BULGE
    c4y = base_right[1] + vy * tip_dist * _BEZIER_BULGE
    return (
        f" C {_fmt(c1x)} {_fmt(c1y)} {_fmt(c2x)} {_fmt(c2y)} {_fmt(tip[0])} {_fmt(tip[1])}"
        f" C {_fmt(c3x)} {_fmt(c3y)} {_fmt(c4x)} {_fmt(c4y)} {_fmt(base_right[0])} {_fmt(base_right[1])}"
    )


def _ellipse_path(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    tail: dict[str, Any] | None,
    tail_direction: str,
) -> str:
    """Trace an ellipse as 4 cubic beziers (kappa = 0.5522847498)."""
    K = 0.5522847498
    cx_rx_k = rx * K
    cy_ry_k = ry * K
    ellipse = (
        f"M {_fmt(cx - rx)} {_fmt(cy)} "
        f"C {_fmt(cx - rx)} {_fmt(cy - cy_ry_k)} {_fmt(cx - cx_rx_k)} {_fmt(cy - ry)} {_fmt(cx)} {_fmt(cy - ry)} "
        f"C {_fmt(cx + cx_rx_k)} {_fmt(cy - ry)} {_fmt(cx + rx)} {_fmt(cy - cy_ry_k)} {_fmt(cx + rx)} {_fmt(cy)} "
        f"C {_fmt(cx + rx)} {_fmt(cy + cy_ry_k)} {_fmt(cx + cx_rx_k)} {_fmt(cy + ry)} {_fmt(cx)} {_fmt(cy + ry)} "
        f"C {_fmt(cx - cx_rx_k)} {_fmt(cy + ry)} {_fmt(cx - rx)} {_fmt(cy + cy_ry_k)} {_fmt(cx - rx)} {_fmt(cy)} "
        f"Z"
    )
    if tail is None:
        return ellipse
    vec = _TAIL_DIRECTION_VECTORS.get(
        "S" if tail_direction == "auto" else tail_direction
    )
    if vec is None:
        return ellipse
    vx, vy = vec
    base_left = tail["base_left"]
    base_right = tail["base_right"]
    inset_left = (base_left[0] - vx * _TAIL_OVERLAP, base_left[1] - vy * _TAIL_OVERLAP)
    inset_right = (
        base_right[0] - vx * _TAIL_OVERLAP,
        base_right[1] - vy * _TAIL_OVERLAP,
    )
    tail_path = (
        f"M {_fmt(inset_left[0])} {_fmt(inset_left[1])}"
        f"{_tail_subpath(inset_left, inset_right, tail['tip'], tail_direction)}"
        f" L {_fmt(inset_left[0])} {_fmt(inset_left[1])} Z"
    )
    return f"{ellipse} {tail_path}"


def _rounded_rect_path(
    left: float,
    top: float,
    width: float,
    height: float,
    rx: float,
    ry: float,
    tail: dict[str, Any] | None,
    tail_direction: str,
) -> str:
    rx = min(rx, width / 2)
    ry = min(ry, height / 2)
    right = left + width
    bottom = top + height
    if tail is None:
        return (
            f"M {_fmt(left + rx)} {_fmt(top)} "
            f"L {_fmt(right - rx)} {_fmt(top)} "
            f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(right)} {_fmt(top + ry)} "
            f"L {_fmt(right)} {_fmt(bottom - ry)} "
            f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(right - rx)} {_fmt(bottom)} "
            f"L {_fmt(left + rx)} {_fmt(bottom)} "
            f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(left)} {_fmt(bottom - ry)} "
            f"L {_fmt(left)} {_fmt(top + ry)} "
            f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(left + rx)} {_fmt(top)} Z"
        )
    segments: list[str] = [f"M {_fmt(left + rx)} {_fmt(top)}"]

    def _inject(edge: str) -> dict[str, Any] | None:
        return tail if tail["edge"] == edge else None

    top_tail = _inject("top")
    if top_tail:
        segments.append(f"L {_fmt(top_tail['base_left'][0])} {_fmt(top_tail['base_left'][1])}")
        segments.append(
            _tail_subpath(
                top_tail["base_left"], top_tail["base_right"], top_tail["tip"], tail_direction
            )
        )
    segments.append(f"L {_fmt(right - rx)} {_fmt(top)}")
    segments.append(f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(right)} {_fmt(top + ry)}")
    right_tail = _inject("right")
    if right_tail:
        segments.append(f"L {_fmt(right_tail['base_left'][0])} {_fmt(right_tail['base_left'][1])}")
        segments.append(
            _tail_subpath(
                right_tail["base_left"], right_tail["base_right"], right_tail["tip"], tail_direction
            )
        )
    segments.append(f"L {_fmt(right)} {_fmt(bottom - ry)}")
    segments.append(f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(right - rx)} {_fmt(bottom)}")
    bottom_tail = _inject("bottom")
    if bottom_tail:
        segments.append(f"L {_fmt(bottom_tail['base_right'][0])} {_fmt(bottom_tail['base_right'][1])}")
        segments.append(
            _tail_subpath(
                bottom_tail["base_right"], bottom_tail["base_left"], bottom_tail["tip"], tail_direction
            )
        )
    segments.append(f"L {_fmt(left + rx)} {_fmt(bottom)}")
    segments.append(f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(left)} {_fmt(bottom - ry)}")
    left_tail = _inject("left")
    if left_tail:
        segments.append(f"L {_fmt(left_tail['base_right'][0])} {_fmt(left_tail['base_right'][1])}")
        segments.append(
            _tail_subpath(
                left_tail["base_right"], left_tail["base_left"], left_tail["tip"], tail_direction
            )
        )
    segments.append(f"L {_fmt(left)} {_fmt(top + ry)}")
    segments.append(f"A {_fmt(rx)} {_fmt(ry)} 0 0 1 {_fmt(left + rx)} {_fmt(top)}")
    segments.append("Z")
    return " ".join(segments)


def _shout_path(
    left: float,
    top: float,
    width: float,
    height: float,
    tail_direction: str,
    tail_length_px: int,
) -> str:
    """20-vertex star polygon. When a tail is requested, the outer
    spike whose angle is closest to ``tail_direction`` is extended
    outward by ``tail_length_px`` along the direction unit-vector.
    Adjacent vertices stay put and form the natural tail base —
    no separate sub-path. Mirrors shoutPath() in
    frontend/src/components/comics/bubblePath.ts."""
    star_pcts: tuple[tuple[float, float], ...] = (
        (0, 20), (10, 0), (25, 15), (40, 0), (55, 15),
        (70, 0), (85, 15), (100, 20), (90, 40),
        (100, 60), (85, 75), (100, 90), (75, 100),
        (60, 85), (45, 100), (30, 85), (15, 100),
        (0, 80), (10, 60), (0, 40),
    )
    points = [
        (left + (px / 100) * width, top + (py / 100) * height) for px, py in star_pcts
    ]
    # Outer spikes sit on the bbox edge; inner points sit off-edge.
    # Only outer points are eligible for extension.
    is_outer = [px in (0, 100) or py in (0, 100) for px, py in star_pcts]

    if tail_direction != "none" and tail_length_px > 0:
        direction = "S" if tail_direction == "auto" else tail_direction
        vec = _TAIL_DIRECTION_VECTORS.get(direction)
        if vec is not None:
            vx, vy = vec
            cx = left + width / 2
            cy = top + height / 2
            best_idx = -1
            best_dot = float("-inf")
            for i, (x, y) in enumerate(points):
                if not is_outer[i]:
                    continue
                dx = x - cx
                dy = y - cy
                dist = math.hypot(dx, dy)
                if dist == 0:
                    continue
                dot = (dx * vx + dy * vy) / dist
                if dot > best_dot:
                    best_dot = dot
                    best_idx = i
            if best_idx >= 0:
                ox, oy = points[best_idx]
                points[best_idx] = (ox + vx * tail_length_px, oy + vy * tail_length_px)

    star = f"M {_fmt(points[0][0])} {_fmt(points[0][1])}"
    for x, y in points[1:]:
        star += f" L {_fmt(x)} {_fmt(y)}"
    star += " Z"
    return star


def _thought_circle_chain_suffix(
    bubble_left: float,
    bubble_top: float,
    bubble_width: float,
    bubble_height: float,
    tail_direction: str,
    tail_position_pct: int,
    tail_length_px: int,
) -> str:
    """Chain of 1-3 progressively smaller circles for the
    thought-bubble tail. Mirrors thoughtCircleChainSuffix in
    frontend/src/components/comics/bubblePath.ts."""
    if tail_direction == "none":
        return ""
    direction = "S" if tail_direction == "auto" else tail_direction
    vec = _TAIL_DIRECTION_VECTORS.get(direction)
    if vec is None:
        return ""
    vx, vy = vec
    pct = max(0, min(100, tail_position_pct)) / 100.0
    if direction in ("S", "SE", "SW"):
        base_x = bubble_left + pct * bubble_width
        base_y = bubble_top + bubble_height
    elif direction in ("N", "NE", "NW"):
        base_x = bubble_left + pct * bubble_width
        base_y = bubble_top
    elif direction == "E":
        base_x = bubble_left + bubble_width
        base_y = bubble_top + pct * bubble_height
    else:  # W
        base_x = bubble_left
        base_y = bubble_top + pct * bubble_height
    # Concept doc: 3 circles for long tails, 2 medium, 1 short.
    # Cumulative spacing fractions place centres at 25 %, 60 %,
    # 100 % of the requested tail extent regardless of count.
    count = 3 if tail_length_px > 30 else 2 if tail_length_px > 15 else 1
    offsets = (0.25, 0.6, 1.0)
    diameter = max(12.0, bubble_height * 0.12)
    parts: list[str] = []
    for i in range(count):
        cx = base_x + vx * tail_length_px * offsets[i]
        cy = base_y + vy * tail_length_px * offsets[i]
        r = diameter / 2
        parts.append(
            f"M {_fmt(cx - r)} {_fmt(cy)} "
            f"A {_fmt(r)} {_fmt(r)} 0 1 0 {_fmt(cx + r)} {_fmt(cy)} "
            f"A {_fmt(r)} {_fmt(r)} 0 1 0 {_fmt(cx - r)} {_fmt(cy)} Z"
        )
        diameter *= 0.6
    return (" " + " ".join(parts)) if parts else ""


def _build_bubble_path(
    shape: str,
    width: float,
    height: float,
    tail_direction: str,
    tail_position_pct: int,
    tail_length_px: int,
) -> str:
    """Return the SVG path 'd' attribute for the bubble + tail.
    Mirrors frontend/src/components/comics/bubblePath.ts."""
    tail = _compute_tail_geometry(
        width, height, 0, 0, tail_direction, tail_position_pct, tail_length_px
    )
    if shape == "sound_effect":
        return ""
    if shape == "narration":
        # Narration boxes are narrator voice — they don't point at
        # a speaker. Force-ignore stored tail_direction so a legacy
        # value never produces a tail.
        return _rounded_rect_path(0, 0, width, height, 0, 0, None, "none")
    if shape == "thought":
        rx = min(width, height) * 0.3
        outline = _rounded_rect_path(0, 0, width, height, rx, rx, None, tail_direction)
        return outline + _thought_circle_chain_suffix(
            0, 0, width, height, tail_direction, tail_position_pct, tail_length_px
        )
    if shape == "whisper":
        rx = min(width, height) * 0.3
        return _rounded_rect_path(0, 0, width, height, rx, rx, tail, tail_direction)
    if shape == "speech":
        return _ellipse_path(
            width / 2, height / 2, width / 2, height / 2, tail, tail_direction
        )
    if shape == "shout":
        return _shout_path(0, 0, width, height, tail_direction, tail_length_px)
    return ""


# Per-type SVG attribute defaults (mirror the frontend defaults
# in ComicBubble.tsx).
_BUBBLE_DEFAULT_FILL: dict[str, str] = {
    "speech": "white",
    "thought": "white",
    "narration": "#f5f5dc",
    "shout": "white",
    "whisper": "white",
    "sound_effect": "transparent",
}
_BUBBLE_DEFAULT_STROKE: dict[str, str | None] = {
    "speech": "black",
    "thought": "black",
    "narration": "black",
    "shout": "black",
    "whisper": "black",
    "sound_effect": None,
}
_BUBBLE_DEFAULT_STROKE_WIDTH: dict[str, float] = {
    "speech": 1.5,
    "thought": 1.0,
    "narration": 1.0,
    "shout": 1.5,
    "whisper": 1.0,
    "sound_effect": 0,
}
_BUBBLE_DEFAULT_DASHARRAY: dict[str, str | None] = {
    "speech": None,
    "thought": None,
    "narration": None,
    "shout": None,
    "whisper": "4 3",
    "sound_effect": None,
}


# --- Single-bubble render ---


def _render_comic_bubble(bubble: dict[str, Any]) -> str:
    """Render one comic_bubbles row as an HTML element.

    Bubble row shape (matches ``ComicBubbleOut`` Pydantic schema):
    - id, panel_id, position
    - bubble_type (one of 6 enum values)
    - anchor: {x_pct, y_pct} (position within the panel as
      percentages 0-100)
    - width_pct, height_pct (bubble dimensions as % of panel)
    - tail_direction, tail_position_pct, tail_length_px
    - bubble_config: optional Tier 1+2 JSON properties (color,
      border, typography, etc.) — shape matches picture-book
      ``layout_config.bubbles[0]`` per field-name parity
    - text_content: plain text (Q2 a decision; TipTap deferred)
    """
    bubble_type = bubble.get("bubble_type", "speech")

    anchor = bubble.get("anchor") or {}
    if isinstance(anchor, str):
        try:
            anchor = json.loads(anchor)
        except json.JSONDecodeError:
            anchor = {}
    if not isinstance(anchor, dict):
        anchor = {}
    x_pct = anchor.get("x_pct", 50)
    y_pct = anchor.get("y_pct", 50)
    width_pct = bubble.get("width_pct", 30)
    height_pct = bubble.get("height_pct", 20)

    # bubble_config Tier 1+2 fields. Approach A (2026-05-27):
    # background_color / border_color / border_width / border_style
    # flow into SVG path attributes; typography / opacity / padding
    # apply to the text overlay div.
    config = bubble.get("bubble_config") or {}
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except json.JSONDecodeError:
            config = {}
    if not isinstance(config, dict):
        config = {}

    # SVG path attributes (with per-type defaults).
    fill = config.get("background_color") if isinstance(
        config.get("background_color"), str
    ) else _BUBBLE_DEFAULT_FILL.get(bubble_type, "white")
    stroke_default = _BUBBLE_DEFAULT_STROKE.get(bubble_type, "black")
    stroke = config.get("border_color") if isinstance(
        config.get("border_color"), str
    ) else (stroke_default or "transparent")
    stroke_width = (
        float(config["border_width"])
        if isinstance(config.get("border_width"), (int, float))
        else _BUBBLE_DEFAULT_STROKE_WIDTH.get(bubble_type, 1.0)
    )
    border_style = config.get("border_style")
    if border_style == "dashed":
        stroke_dasharray: str | None = "4 3"
    elif border_style == "dotted":
        stroke_dasharray = "1 2"
    else:
        stroke_dasharray = _BUBBLE_DEFAULT_DASHARRAY.get(bubble_type)

    path_d = _build_bubble_path(
        shape=bubble_type,
        width=100,
        height=100,
        tail_direction=bubble.get("tail_direction", "none"),
        tail_position_pct=bubble.get("tail_position_pct", 50),
        tail_length_px=bubble.get("tail_length_px", 16),
    )

    # Text-overlay style (typography + padding + opacity).
    text_css_parts: list[str] = [
        "position: absolute;",
        "inset: 0;",
        "display: flex;",
        "align-items: center;",
        "justify-content: center;",
        "text-align: center;",
        "padding: 4pt 8pt;",
        "box-sizing: border-box;",
        "font-family: 'Atkinson Hyperlegible', sans-serif;",
        "font-size: 10pt;",
        "color: black;",
    ]
    if isinstance(config.get("text_color"), str):
        text_css_parts.append(f"color: {config['text_color']};")
    if isinstance(config.get("font_family"), str):
        text_css_parts.append(
            f"font-family: '{config['font_family']}', sans-serif;"
        )
    if isinstance(config.get("font_size"), (int, float)):
        text_css_parts.append(f"font-size: {int(config['font_size'])}pt;")
    if config.get("font_weight") in ("normal", "bold"):
        text_css_parts.append(f"font-weight: {config['font_weight']};")
    if config.get("text_align") in ("left", "center", "right"):
        text_css_parts.append(f"text-align: {config['text_align']};")
    if config.get("italic") is True:
        text_css_parts.append("font-style: italic;")
    if isinstance(config.get("opacity"), (int, float)):
        text_css_parts.append(f"opacity: {config['opacity']};")
    text_css = " ".join(text_css_parts)

    text = bubble.get("text_content") or ""
    text_html = escape(str(text))

    container_style = (
        f"position: absolute;"
        f" left: {x_pct}%;"
        f" top: {y_pct}%;"
        f" width: {width_pct}%;"
        f" height: {height_pct}%;"
        f" transform: translate(-50%, -50%);"
        f" overflow: visible;"
    )

    if path_d:
        dasharray_attr = (
            f' stroke-dasharray="{stroke_dasharray}"'
            if stroke_dasharray
            else ""
        )
        svg = (
            f'<svg width="100%" height="100%" viewBox="0 0 100 100" '
            f'preserveAspectRatio="none" '
            f'style="position: absolute; inset: 0; overflow: visible; '
            f'pointer-events: none;">'
            f'<path d="{path_d}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{stroke_width}"{dasharray_attr} '
            f'stroke-linejoin="round" />'
            f"</svg>"
        )
    else:
        # sound_effect: no shape, just the text overlay.
        svg = ""

    return (
        f'<div class="comic-bubble" data-bubble-type="{escape(bubble_type)}" '
        f'style="{container_style}">'
        f"{svg}"
        f'<div style="{text_css}"><span>{text_html}</span></div>'
        f"</div>"
    )


# --- Single-panel render ---


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
        _render_comic_panel(
            panel, panel_bubbles_map.get(panel.get("id", ""), []), assets_map
        )
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
        meta_tags.append(
            f'<meta name="description" content="{escape(description)}" />'
        )
    producer = (
        "Bibliogon comic-book PDF (bleed)"
        if picture_book_bleed_marks
        else "Bibliogon comic-book PDF"
    )
    meta_tags.append(
        f'<meta name="generator" content="{escape(producer)}" />'
    )
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


def _build_assets_map(
    assets: list[dict[str, Any]],
    upload_dir: Path,
) -> dict[str, str]:
    """Resolve each asset_id to a file:// URL for WeasyPrint.

    Same shape as picture-book's ``_build_assets_map``; duplicated
    here so the comic walker is self-contained (no need to expose
    the picture-book helper as a public symbol just for this).
    Missing files are skipped silently.
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
