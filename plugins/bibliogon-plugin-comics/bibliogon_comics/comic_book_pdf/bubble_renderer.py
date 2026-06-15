"""Speech-bubble rendering for comic-book PDF.

Bubble-type CSS variants, the SVG tail + bubble-shape path geometry
(ellipse / rounded-rect / shout / thought-chain), and the per-bubble
HTML renderer. Self-contained: no cross-module dependencies beyond the
standard library.
"""

from __future__ import annotations

import json
import math
from html import escape
from typing import Any

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
    "speech": ("border: 1.5pt solid black; border-radius: 50%; background: white;"),
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
        "border: 1pt dashed black; border-radius: 30%; background: rgba(255, 255, 255, 0.7);"
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
    viewbox = f"{-svg_width / 2:.0f} {-svg_height / 2:.0f} {svg_width} {svg_height}"

    return (
        f'<svg class="bubble-tail" '
        f'style="position: absolute; {side_attr} '
        f"width: {svg_width}px; height: {svg_height}px; "
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
        return f" L {_fmt(tip[0])} {_fmt(tip[1])} L {_fmt(base_right[0])} {_fmt(base_right[1])}"
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
    vec = _TAIL_DIRECTION_VECTORS.get("S" if tail_direction == "auto" else tail_direction)
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
        segments.append(
            f"L {_fmt(bottom_tail['base_right'][0])} {_fmt(bottom_tail['base_right'][1])}"
        )
        segments.append(
            _tail_subpath(
                bottom_tail["base_right"],
                bottom_tail["base_left"],
                bottom_tail["tip"],
                tail_direction,
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
        (0, 20),
        (10, 0),
        (25, 15),
        (40, 0),
        (55, 15),
        (70, 0),
        (85, 15),
        (100, 20),
        (90, 40),
        (100, 60),
        (85, 75),
        (100, 90),
        (75, 100),
        (60, 85),
        (45, 100),
        (30, 85),
        (15, 100),
        (0, 80),
        (10, 60),
        (0, 40),
    )
    points = [(left + (px / 100) * width, top + (py / 100) * height) for px, py in star_pcts]
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
        # Ellipse outline (no tail diversion) + circle-chain tail.
        # Tail rendering tied to bubble_type, not outline geometry.
        outline = _ellipse_path(width / 2, height / 2, width / 2, height / 2, None, tail_direction)
        return outline + _thought_circle_chain_suffix(
            0, 0, width, height, tail_direction, tail_position_pct, tail_length_px
        )
    if shape == "whisper":
        rx = min(width, height) * 0.3
        return _rounded_rect_path(0, 0, width, height, rx, rx, tail, tail_direction)
    if shape == "speech":
        # Rounded rectangle outline + bezier S-curve tail.
        rx = min(width, height) * 0.3
        return _rounded_rect_path(0, 0, width, height, rx, rx, tail, tail_direction)
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
    - anchor: {x_pct, y_pct} — the bubble's TOP-LEFT corner within
      the panel as percentages 0-100. Matches the editor's
      ``frontend/src/components/comics/ComicBubble.tsx`` convention:
      no ``transform: translate(...)`` is applied; ``left`` + ``top``
      put the top-left of the bubble at ``(x_pct%, y_pct%)`` of
      the panel.
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
    fill = (
        config.get("background_color")
        if isinstance(config.get("background_color"), str)
        else _BUBBLE_DEFAULT_FILL.get(bubble_type, "white")
    )
    stroke_default = _BUBBLE_DEFAULT_STROKE.get(bubble_type, "black")
    stroke = (
        config.get("border_color")
        if isinstance(config.get("border_color"), str)
        else (stroke_default or "transparent")
    )
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

    # Text-overlay style (typography + padding + opacity). The
    # CSS ``inset`` shorthand is unknown to WeasyPrint v66; emit
    # the four longhand offsets instead so the overlay actually
    # fills the bubble's bounding box.
    text_css_parts: list[str] = [
        "position: absolute;",
        "top: 0; left: 0; right: 0; bottom: 0;",
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
        text_css_parts.append(f"font-family: '{config['font_family']}', sans-serif;")
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

    # Anchor convention: ``(x_pct, y_pct)`` is the bubble's TOP-LEFT
    # corner in % of the parent panel, mirroring
    # ``frontend/src/components/comics/ComicBubble.tsx``'s
    # ``baseStyle``. No ``transform: translate(-50%, -50%)`` here:
    # that was a bug shipped with Approach A — the editor canvas
    # placed bubbles at top-left while the walker treated the same
    # coords as centre, shifting bubbles up-left by
    # ``(width_pct/2, height_pct/2)`` in the rendered PDF. The
    # ``_clampAnchor`` math in the editor uses
    # ``maxX = 100 - width_pct``, which only holds for the top-left
    # interpretation; the walker now matches.
    container_style = (
        f"position: absolute;"
        f" left: {x_pct}%;"
        f" top: {y_pct}%;"
        f" width: {width_pct}%;"
        f" height: {height_pct}%;"
        f" overflow: visible;"
    )

    if path_d:
        dasharray_attr = f' stroke-dasharray="{stroke_dasharray}"' if stroke_dasharray else ""
        # Position-mismatch fix attempt #2 (2026-05-28). The
        # original fix in 7b30a325 corrected the
        # ``translate(-50%, -50%)`` bug on the bubble container,
        # but a user-reported visual mismatch persisted after the
        # ship. Diagnostic: editor + walker generate identical
        # path d + viewBox + container left/top/width/height. The
        # remaining cause is here — the SVG only set ``top: 0;
        # left: 0`` and relied on the ``width="100%" height="100%"``
        # SVG attributes to fill the bubble container. WeasyPrint's
        # SVG-attribute handling for percentage values is less
        # forgiving than the browser's; if the attribute width
        # falls back to the SVG's intrinsic viewBox size (100x100
        # CSS pixels), the bubble shape renders at the wrong
        # scale + the wrong offset within its container.
        #
        # Fix: set explicit ``width: 100%; height: 100%`` in CSS
        # (matches the editor's ``inset: 0`` shorthand effect —
        # the SVG fills its container regardless of how the
        # renderer treats SVG width/height attributes).
        svg = (
            f'<svg width="100%" height="100%" viewBox="0 0 100 100" '
            f'preserveAspectRatio="none" '
            f'style="position: absolute; top: 0; left: 0; '
            f"width: 100%; height: 100%; "
            f'overflow: visible; pointer-events: none;">'
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
