/**
 * Tail drag-to-position math.
 *
 * Pure functions that translate between:
 *   - the data-model fields (``tail_direction``, ``tail_position_pct``,
 *     ``tail_length_px``)
 *   - the rendered tip position in bubble-relative pixel coords.
 *
 * Used by ComicBubble to:
 *   - place the drag handle at the visible tail tip
 *     (``computeVisibleTipPosition``)
 *   - derive new (direction, position_pct, length) values from a
 *     dragged tip position (``deriveTailFromTip``)
 *
 * 8-octant snapping matches the existing data model. The drag UX
 * picks the nearest of 8 compass directions from the angle of the
 * vector ``(tipX, tipY)`` measured from the bubble's center.
 */

import type {BubbleTailDirection} from "./BubbleTail";

export type CompassDirection =
    | "N"
    | "NE"
    | "E"
    | "SE"
    | "S"
    | "SW"
    | "W"
    | "NW";

const TAIL_DIRECTION_VECTORS: Record<CompassDirection, [number, number]> = {
    N: [0.0, -1.0],
    NE: [0.707, -0.707],
    E: [1.0, 0.0],
    SE: [0.707, 0.707],
    S: [0.0, 1.0],
    SW: [-0.707, 0.707],
    W: [-1.0, 0.0],
    NW: [-0.707, -0.707],
};

const HALF_BASE = 4.0;

/** Pixels [0..360) snapped to 8 octants, in the same canonical
 *  order returned by ``atan2``: angle 0° = East, 90° = South. */
const OCTANT_AT_ANGLE: CompassDirection[] = [
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
    "N",
    "NE",
];

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function isCompass(value: string): value is CompassDirection {
    return (
        value === "N" ||
        value === "NE" ||
        value === "E" ||
        value === "SE" ||
        value === "S" ||
        value === "SW" ||
        value === "W" ||
        value === "NW"
    );
}

/** Compute the visible tail-tip position in bubble-relative pixel
 *  coords. Origin is the bubble's top-left corner; positive y is
 *  down. Mirrors the rendering math in ``BubbleTail.tsx`` so the
 *  drag handle stays aligned with the visible tip. Returns ``null``
 *  for ``direction === "none"`` or invalid directions. */
export function computeVisibleTipPosition(
    direction: BubbleTailDirection,
    positionPct: number,
    lengthPx: number,
    bubbleWidthPx: number,
    bubbleHeightPx: number,
): {x: number; y: number} | null {
    if (direction === "none") return null;
    const canonical: CompassDirection =
        direction === "auto" ? "S" : (direction as CompassDirection);
    if (!isCompass(canonical)) return null;
    const [vx, vy] = TAIL_DIRECTION_VECTORS[canonical];
    const svgWidth = Math.max(
        Math.floor(Math.abs(vx * lengthPx) + HALF_BASE * 2),
        4,
    );
    const svgHeight = Math.max(
        Math.floor(Math.abs(vy * lengthPx) + HALF_BASE * 2),
        4,
    );
    const edgePct = clamp(positionPct, 0, 100);

    let svgCenterX: number;
    let svgCenterY: number;
    if (canonical === "S" || canonical === "SE" || canonical === "SW") {
        // SVG attached at bottom edge.
        svgCenterX = (edgePct / 100) * bubbleWidthPx;
        svgCenterY = bubbleHeightPx - svgHeight / 2;
    } else if (canonical === "N" || canonical === "NE" || canonical === "NW") {
        // SVG attached at top edge.
        svgCenterX = (edgePct / 100) * bubbleWidthPx;
        svgCenterY = svgHeight / 2;
    } else if (canonical === "E") {
        svgCenterX = bubbleWidthPx - svgWidth / 2;
        svgCenterY = (edgePct / 100) * bubbleHeightPx;
    } else {
        // W
        svgCenterX = svgWidth / 2;
        svgCenterY = (edgePct / 100) * bubbleHeightPx;
    }

    return {
        x: svgCenterX + vx * lengthPx,
        y: svgCenterY + vy * lengthPx,
    };
}

/** Derive (direction, position_pct, length_px) from a dragged tip
 *  position in bubble-relative pixel coords. Origin is the bubble's
 *  top-left corner.
 *
 *  Algorithm:
 *  1. Compute the angle of ``(tipX − centerX, tipY − centerY)``.
 *  2. Snap to the nearest of 8 compass octants (45° increments).
 *  3. Determine the edge the tail attaches to from the octant
 *     (S/SE/SW → bottom; N/NE/NW → top; E → right; W → left).
 *  4. Project the tip onto that edge to find the anchor + derive
 *     position_pct.
 *  5. Compute length from anchor → tip distance. */
export function deriveTailFromTip(
    tipX: number,
    tipY: number,
    bubbleWidthPx: number,
    bubbleHeightPx: number,
): {
    direction: CompassDirection;
    positionPct: number;
    lengthPx: number;
} {
    const halfW = bubbleWidthPx / 2;
    const halfH = bubbleHeightPx / 2;
    // Translate to bubble-center origin for the angle math.
    const relX = tipX - halfW;
    const relY = tipY - halfH;

    // Snap to nearest octant. Angle 0° = East, 90° = South (clockwise
    // because SVG y-axis grows downward).
    const angleRad = Math.atan2(relY, relX);
    const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;
    const idx = Math.round(angleDeg / 45) % 8;
    const direction = OCTANT_AT_ANGLE[idx];

    // Determine edge anchor in bubble-relative coords (origin at
    // top-left). The anchor is the point on the bubble edge nearest
    // to the dragged tip.
    let anchorX: number;
    let anchorY: number;
    let positionPct: number;
    if (direction === "S" || direction === "SE" || direction === "SW") {
        anchorY = bubbleHeightPx;
        anchorX = clamp(tipX, 0, bubbleWidthPx);
        positionPct = (anchorX / bubbleWidthPx) * 100;
    } else if (direction === "N" || direction === "NE" || direction === "NW") {
        anchorY = 0;
        anchorX = clamp(tipX, 0, bubbleWidthPx);
        positionPct = (anchorX / bubbleWidthPx) * 100;
    } else if (direction === "E") {
        anchorX = bubbleWidthPx;
        anchorY = clamp(tipY, 0, bubbleHeightPx);
        positionPct = (anchorY / bubbleHeightPx) * 100;
    } else {
        // W
        anchorX = 0;
        anchorY = clamp(tipY, 0, bubbleHeightPx);
        positionPct = (anchorY / bubbleHeightPx) * 100;
    }

    // length = euclidean distance from edge anchor to tip, clamped
    // to the slider's range [0, 64]. Schema enforces the same
    // bounds.
    const dx = tipX - anchorX;
    const dy = tipY - anchorY;
    const lengthPx = clamp(Math.round(Math.hypot(dx, dy)), 0, 64);

    return {
        direction,
        positionPct: Math.round(clamp(positionPct, 0, 100)),
        lengthPx,
    };
}
