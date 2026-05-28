/**
 * Single-SVG-path generator for comic bubbles.
 *
 * Approach A from the visual-integration audit (2026-05-27): the
 * entire bubble — outline + fill + tail — renders as ONE ``<svg>``
 * element with ONE ``<path>``. No CSS-rendered shape, no separate
 * SVG for the tail, no mask polygon. The text content overlays
 * the SVG via a positioned ``<div>``.
 *
 * For each bubble type, this module generates an SVG path string
 * that traces:
 *   1. The bubble outline (per type-specific geometry).
 *   2. At the tail attachment point, a bezier-curved diversion
 *      out to the tip and back, blending smoothly into the
 *      outline.
 *   3. The rest of the outline.
 *   4. ``Z`` to close.
 *
 * Bezier curves on the tail edges produce an organic "balloon"
 * look rather than a sharp triangle glued onto the shape.
 *
 * Coordinate system: viewBox encompasses the bubble PLUS the tail
 * extension. Origin at (0, 0); +y goes down. The bubble's outline
 * sits inset by ``MARGIN`` from each edge so the tail has room
 * to extend outward.
 *
 * The output is a normalized 100×100 bubble (viewBox can be wider
 * to hold the tail extension). The SVG element is sized via CSS
 * with ``preserveAspectRatio="none"`` so the bubble container's
 * actual pixel dimensions drive the rendered size.
 */

import type {BubbleTailDirection} from "./BubbleTail";

export type BubbleShape =
    | "speech"
    | "thought"
    | "narration"
    | "shout"
    | "whisper"
    | "sound_effect";

/** Direction → unit vector pointing OUT of the bubble. Matches
 *  the existing tail-vector convention in BubbleTail.tsx and the
 *  Python walker. */
const TAIL_VECTORS: Record<string, [number, number]> = {
    N: [0, -1],
    NE: [0.707, -0.707],
    E: [1, 0],
    SE: [0.707, 0.707],
    S: [0, 1],
    SW: [-0.707, 0.707],
    W: [-1, 0],
    NW: [-0.707, -0.707],
};

export interface BubblePathInput {
    shape: BubbleShape;
    /** Bubble's bounding box width in viewBox units. */
    width: number;
    /** Bubble's bounding box height in viewBox units. */
    height: number;
    tailDirection: BubbleTailDirection;
    /** 0-100. Position along the chosen edge where the tail
     *  attaches. */
    tailPositionPct: number;
    /** Visible tail-tip protrusion in viewBox units. */
    tailLengthPx: number;
}

export interface BubblePathOutput {
    /** ``d`` attribute for a single ``<path>`` element. */
    d: string;
    /** ``viewBox`` attribute for the wrapping ``<svg>``. Includes
     *  the tail extension. */
    viewBox: string;
    /** Bubble's bounding box position within the viewBox (so the
     *  text overlay div can be positioned correctly). */
    bubbleLeft: number;
    bubbleTop: number;
    bubbleWidth: number;
    bubbleHeight: number;
}

const TAIL_BASE_HALF_WIDTH = 6; // half the tail base width (curved out from each base point)

/** ViewBox is always the bubble's bbox; the tail extends OUTSIDE
 *  via path coords past the viewBox. SVG element CSS must use
 *  ``overflow: visible`` so the tail renders past the element
 *  box. */
function computeViewBox(
    bubbleWidth: number,
    bubbleHeight: number,
): {
    viewBoxLeft: number;
    viewBoxTop: number;
    viewBoxWidth: number;
    viewBoxHeight: number;
    bubbleLeft: number;
    bubbleTop: number;
} {
    return {
        viewBoxLeft: 0,
        viewBoxTop: 0,
        viewBoxWidth: bubbleWidth,
        viewBoxHeight: bubbleHeight,
        bubbleLeft: 0,
        bubbleTop: 0,
    };
}

/** Edge attachment for the tail. Returns the 2 base points (in
 *  viewBox coords) where the tail connects to the bubble outline,
 *  plus the tip point. */
interface TailGeometry {
    baseLeft: {x: number; y: number};
    baseRight: {x: number; y: number};
    tip: {x: number; y: number};
    /** Edge identifier: which of the 4 bubble sides the tail
     *  attaches to. Determines how the outline tracing splits. */
    edge: "top" | "right" | "bottom" | "left";
}

function computeTailGeometry(
    bubbleWidth: number,
    bubbleHeight: number,
    bubbleLeft: number,
    bubbleTop: number,
    tailDirection: BubbleTailDirection,
    tailPositionPct: number,
    tailLengthPx: number,
): TailGeometry | null {
    if (tailDirection === "none") return null;
    const direction = tailDirection === "auto" ? "S" : tailDirection;
    const vec = TAIL_VECTORS[direction];
    if (!vec) return null;
    const [vx, vy] = vec;
    const pct = Math.max(0, Math.min(100, tailPositionPct)) / 100;

    let edge: "top" | "right" | "bottom" | "left";
    let baseCenter: {x: number; y: number};

    if (direction === "S" || direction === "SE" || direction === "SW") {
        edge = "bottom";
        baseCenter = {
            x: bubbleLeft + pct * bubbleWidth,
            y: bubbleTop + bubbleHeight,
        };
    } else if (direction === "N" || direction === "NE" || direction === "NW") {
        edge = "top";
        baseCenter = {
            x: bubbleLeft + pct * bubbleWidth,
            y: bubbleTop,
        };
    } else if (direction === "E") {
        edge = "right";
        baseCenter = {
            x: bubbleLeft + bubbleWidth,
            y: bubbleTop + pct * bubbleHeight,
        };
    } else {
        edge = "left";
        baseCenter = {
            x: bubbleLeft,
            y: bubbleTop + pct * bubbleHeight,
        };
    }

    // base-left + base-right perpendicular to the tail direction,
    // along the bubble's edge.
    let baseLeft: {x: number; y: number};
    let baseRight: {x: number; y: number};
    if (edge === "top" || edge === "bottom") {
        baseLeft = {x: baseCenter.x - TAIL_BASE_HALF_WIDTH, y: baseCenter.y};
        baseRight = {x: baseCenter.x + TAIL_BASE_HALF_WIDTH, y: baseCenter.y};
    } else {
        baseLeft = {x: baseCenter.x, y: baseCenter.y - TAIL_BASE_HALF_WIDTH};
        baseRight = {x: baseCenter.x, y: baseCenter.y + TAIL_BASE_HALF_WIDTH};
    }
    // Clamp base points so they don't escape the bubble edge.
    if (edge === "top" || edge === "bottom") {
        baseLeft.x = Math.max(bubbleLeft, Math.min(bubbleLeft + bubbleWidth, baseLeft.x));
        baseRight.x = Math.max(bubbleLeft, Math.min(bubbleLeft + bubbleWidth, baseRight.x));
    } else {
        baseLeft.y = Math.max(bubbleTop, Math.min(bubbleTop + bubbleHeight, baseLeft.y));
        baseRight.y = Math.max(bubbleTop, Math.min(bubbleTop + bubbleHeight, baseRight.y));
    }

    const tip = {
        x: baseCenter.x + vx * tailLengthPx,
        y: baseCenter.y + vy * tailLengthPx,
    };
    return {baseLeft, baseRight, tip, edge};
}

/** Format a number for SVG output (1 decimal place, no trailing
 *  zero where unnecessary). */
function fmt(n: number): string {
    return n.toFixed(1).replace(/\.0$/, "");
}

/** Build the curved-tail subpath: from baseLeft, curve outward to
 *  tip via a cubic bezier, then curve back to baseRight via
 *  another cubic. Control points are pushed in the direction
 *  vector by a fraction of the tail length to create an organic
 *  "balloon" curve. */
function tailSubpath(
    baseLeft: {x: number; y: number},
    baseRight: {x: number; y: number},
    tip: {x: number; y: number},
    direction: string,
): string {
    const vec = TAIL_VECTORS[direction === "auto" ? "S" : direction];
    if (!vec) {
        // Fallback to straight lines.
        return ` L ${fmt(tip.x)} ${fmt(tip.y)} L ${fmt(baseRight.x)} ${fmt(baseRight.y)}`;
    }
    const [vx, vy] = vec;
    // Distance from base midpoint to tip determines curve
    // strength.
    const baseMidX = (baseLeft.x + baseRight.x) / 2;
    const baseMidY = (baseLeft.y + baseRight.y) / 2;
    const tipDx = tip.x - baseMidX;
    const tipDy = tip.y - baseMidY;
    const tipDist = Math.hypot(tipDx, tipDy);
    // Curve strength as a fraction of the tip distance. 0.55
    // produces a soft "balloon" curve that bulges slightly past
    // the straight-line path before reaching the tip.
    const bulgeFactor = 0.55;
    // Control point 1 (near baseLeft, pushed outward)
    const c1x = baseLeft.x + vx * tipDist * bulgeFactor;
    const c1y = baseLeft.y + vy * tipDist * bulgeFactor;
    // Control point 2 (near tip, pulled back slightly along the
    // direction)
    const c2x = tip.x - vx * tipDist * 0.15;
    const c2y = tip.y - vy * tipDist * 0.15;
    // First cubic: baseLeft → tip
    // Mirror cubic: tip → baseRight (symmetric controls)
    const c3x = tip.x - vx * tipDist * 0.15;
    const c3y = tip.y - vy * tipDist * 0.15;
    const c4x = baseRight.x + vx * tipDist * bulgeFactor;
    const c4y = baseRight.y + vy * tipDist * bulgeFactor;
    return (
        ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(tip.x)} ${fmt(tip.y)}` +
        ` C ${fmt(c3x)} ${fmt(c3y)} ${fmt(c4x)} ${fmt(c4y)} ${fmt(baseRight.x)} ${fmt(baseRight.y)}`
    );
}

/** Trace an ellipse as 4 cubic Beziers, broken at the tail
 *  attachment so the tail subpath can insert in the gap. */
function ellipsePath(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    tail: TailGeometry | null,
    tailDirection: string,
): string {
    // Use 4 cubic Beziers around the ellipse. Standard k =
    // 0.5522847498 (kappa) approximates a quarter ellipse with
    // a cubic Bezier.
    const K = 0.5522847498;
    const cx_rx_k = rx * K;
    const cy_ry_k = ry * K;
    if (!tail) {
        // Simple closed ellipse.
        return (
            `M ${fmt(cx - rx)} ${fmt(cy)} ` +
            `C ${fmt(cx - rx)} ${fmt(cy - cy_ry_k)} ${fmt(cx - cx_rx_k)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} ` +
            `C ${fmt(cx + cx_rx_k)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - cy_ry_k)} ${fmt(cx + rx)} ${fmt(cy)} ` +
            `C ${fmt(cx + rx)} ${fmt(cy + cy_ry_k)} ${fmt(cx + cx_rx_k)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} ` +
            `C ${fmt(cx - cx_rx_k)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + cy_ry_k)} ${fmt(cx - rx)} ${fmt(cy)} ` +
            `Z`
        );
    }
    // Tail breaks the ellipse at base-left and base-right. Trace
    // from base-right CLOCKWISE around the ellipse back to
    // base-left, then insert the tail subpath. The base-left and
    // base-right points sit ON the ellipse perimeter (the
    // computeTailGeometry function placed them on the bbox edge,
    // which is the same point on the perimeter for the cardinal
    // 4 axes; for an ellipse, this approximation breaks for
    // diagonal directions but renders reasonably).
    // For simplicity, trace the full ellipse and then insert the
    // tail diversion as a separate sub-path inside the outline
    // using the same fill+stroke. This works because the bubble
    // interior gets ONE fill — the tail fill blends.
    // SIMPLIFICATION: render the bubble outline as a separate
    // sub-path from the tail; both close. The tail base extends
    // 2-3 units INSIDE the ellipse to mask the seam.
    const ellipsePath_ =
        `M ${fmt(cx - rx)} ${fmt(cy)} ` +
        `C ${fmt(cx - rx)} ${fmt(cy - cy_ry_k)} ${fmt(cx - cx_rx_k)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} ` +
        `C ${fmt(cx + cx_rx_k)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - cy_ry_k)} ${fmt(cx + rx)} ${fmt(cy)} ` +
        `C ${fmt(cx + rx)} ${fmt(cy + cy_ry_k)} ${fmt(cx + cx_rx_k)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} ` +
        `C ${fmt(cx - cx_rx_k)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + cy_ry_k)} ${fmt(cx - rx)} ${fmt(cy)} ` +
        `Z`;
    // Tail extends from baseLeft to tip to baseRight, with the
    // base-left + base-right shifted INWARD by 2 units in the
    // negative direction (toward bubble center) to create overlap.
    const vec = TAIL_VECTORS[tailDirection === "auto" ? "S" : tailDirection];
    if (!vec) return ellipsePath_;
    const [vx, vy] = vec;
    const overlap = 2;
    const insetLeft = {
        x: tail.baseLeft.x - vx * overlap,
        y: tail.baseLeft.y - vy * overlap,
    };
    const insetRight = {
        x: tail.baseRight.x - vx * overlap,
        y: tail.baseRight.y - vy * overlap,
    };
    const tailPath =
        `M ${fmt(insetLeft.x)} ${fmt(insetLeft.y)}` +
        tailSubpath(insetLeft, insetRight, tail.tip, tailDirection) +
        ` L ${fmt(insetLeft.x)} ${fmt(insetLeft.y)} Z`;
    return `${ellipsePath_} ${tailPath}`;
}

/** Trace a rounded rectangle. ``rx`` and ``ry`` control corner
 *  radii. If tail is present, the path is broken at the tail
 *  attachment edge and the bezier tail subpath inserts. */
function roundedRectPath(
    left: number,
    top: number,
    width: number,
    height: number,
    rx: number,
    ry: number,
    tail: TailGeometry | null,
    tailDirection: string,
): string {
    // Clamp radii so corners don't overlap.
    rx = Math.min(rx, width / 2);
    ry = Math.min(ry, height / 2);
    const right = left + width;
    const bottom = top + height;
    if (!tail) {
        return (
            `M ${fmt(left + rx)} ${fmt(top)} ` +
            `L ${fmt(right - rx)} ${fmt(top)} ` +
            `A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(right)} ${fmt(top + ry)} ` +
            `L ${fmt(right)} ${fmt(bottom - ry)} ` +
            `A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(right - rx)} ${fmt(bottom)} ` +
            `L ${fmt(left + rx)} ${fmt(bottom)} ` +
            `A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(left)} ${fmt(bottom - ry)} ` +
            `L ${fmt(left)} ${fmt(top + ry)} ` +
            `A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(left + rx)} ${fmt(top)} Z`
        );
    }
    // Trace the outline starting at top-left corner, going
    // clockwise. When we reach the tail-edge segment, we insert
    // the tail diversion at base-left (during the edge traversal)
    // and resume at base-right.
    // For simplicity, build the outline as 4 separate segments,
    // checking each for the tail edge.
    const segments: string[] = [];
    // start at top-left arc end (left + rx, top)
    segments.push(`M ${fmt(left + rx)} ${fmt(top)}`);
    // Segment 1: top edge → top-right arc → right edge → bottom-
    // right arc → bottom edge → bottom-left arc → left edge →
    // top-left arc → close.
    // We insert tail diversion at the appropriate edge.
    const inject = (edge: "top" | "right" | "bottom" | "left") =>
        edge === tail.edge ? tail : null;

    // Top edge: left+rx → right-rx
    const topTail = inject("top");
    if (topTail) {
        segments.push(`L ${fmt(topTail.baseLeft.x)} ${fmt(topTail.baseLeft.y)}`);
        segments.push(tailSubpath(topTail.baseLeft, topTail.baseRight, topTail.tip, tailDirection));
    }
    segments.push(`L ${fmt(right - rx)} ${fmt(top)}`);
    // Top-right arc
    segments.push(`A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(right)} ${fmt(top + ry)}`);
    // Right edge: top+ry → bottom-ry
    const rightTail = inject("right");
    if (rightTail) {
        segments.push(`L ${fmt(rightTail.baseLeft.x)} ${fmt(rightTail.baseLeft.y)}`);
        segments.push(tailSubpath(rightTail.baseLeft, rightTail.baseRight, rightTail.tip, tailDirection));
    }
    segments.push(`L ${fmt(right)} ${fmt(bottom - ry)}`);
    // Bottom-right arc
    segments.push(`A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(right - rx)} ${fmt(bottom)}`);
    // Bottom edge: right-rx → left+rx (going LEFT, so base-RIGHT comes first)
    const bottomTail = inject("bottom");
    if (bottomTail) {
        // baseRight is to the right of baseLeft; going right→left
        // means we reach baseRight first.
        segments.push(`L ${fmt(bottomTail.baseRight.x)} ${fmt(bottomTail.baseRight.y)}`);
        // Insert tail in reverse: baseRight → tip → baseLeft.
        segments.push(tailSubpath(bottomTail.baseRight, bottomTail.baseLeft, bottomTail.tip, tailDirection));
    }
    segments.push(`L ${fmt(left + rx)} ${fmt(bottom)}`);
    // Bottom-left arc
    segments.push(`A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(left)} ${fmt(bottom - ry)}`);
    // Left edge: bottom-ry → top+ry (going UP, so base-RIGHT comes first)
    const leftTail = inject("left");
    if (leftTail) {
        segments.push(`L ${fmt(leftTail.baseRight.x)} ${fmt(leftTail.baseRight.y)}`);
        segments.push(tailSubpath(leftTail.baseRight, leftTail.baseLeft, leftTail.tip, tailDirection));
    }
    segments.push(`L ${fmt(left)} ${fmt(top + ry)}`);
    // Top-left arc → close
    segments.push(`A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(left + rx)} ${fmt(top)}`);
    segments.push("Z");
    return segments.join(" ");
}

/** Thought-bubble tail: a chain of 1-3 progressively smaller
 *  circles drifting away from the bubble in the tail direction.
 *  Each circle renders as a sub-path (M + 2 arcs + Z) within the
 *  same single ``d`` attribute so the bubble stays one SVG path.
 *  When ``tailDirection === "none"``, returns an empty string —
 *  the caller's outline path is unchanged. */
function thoughtCircleChainSuffix(
    bubbleLeft: number,
    bubbleTop: number,
    bubbleWidth: number,
    bubbleHeight: number,
    tailDirection: BubbleTailDirection,
    tailPositionPct: number,
    tailLengthPx: number,
): string {
    if (tailDirection === "none") return "";
    const direction = tailDirection === "auto" ? "S" : tailDirection;
    const vec = TAIL_VECTORS[direction];
    if (!vec) return "";
    const [vx, vy] = vec;
    const pct = Math.max(0, Math.min(100, tailPositionPct)) / 100;
    let baseX: number;
    let baseY: number;
    if (direction === "S" || direction === "SE" || direction === "SW") {
        baseX = bubbleLeft + pct * bubbleWidth;
        baseY = bubbleTop + bubbleHeight;
    } else if (direction === "N" || direction === "NE" || direction === "NW") {
        baseX = bubbleLeft + pct * bubbleWidth;
        baseY = bubbleTop;
    } else if (direction === "E") {
        baseX = bubbleLeft + bubbleWidth;
        baseY = bubbleTop + pct * bubbleHeight;
    } else {
        baseX = bubbleLeft;
        baseY = bubbleTop + pct * bubbleHeight;
    }
    // Per the concept doc: 3 circles for long tails, 2 medium, 1
    // short. Cumulative spacing fractions (0.25 + 0.35 + 0.40 = 1)
    // place the chain's centres at 25 %, 60 %, 100 % of the
    // requested tail extent regardless of count.
    const count = tailLengthPx > 30 ? 3 : tailLengthPx > 15 ? 2 : 1;
    const offsets = [0.25, 0.6, 1];
    let diameter = Math.max(12, bubbleHeight * 0.12);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
        const cx = baseX + vx * tailLengthPx * offsets[i];
        const cy = baseY + vy * tailLengthPx * offsets[i];
        const r = diameter / 2;
        parts.push(
            `M ${fmt(cx - r)} ${fmt(cy)} ` +
                `A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} ` +
                `A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} Z`,
        );
        diameter *= 0.6;
    }
    return parts.length ? " " + parts.join(" ") : "";
}

/** Star polygon for ``shout`` — 20-vertex jagged outline matching
 *  the CSS clip-path constants. Tail integration is approximated:
 *  the star path is closed and the tail is drawn as a separate
 *  sub-path overlapping the nearest vertex. */
function shoutPath(
    left: number,
    top: number,
    width: number,
    height: number,
    tail: TailGeometry | null,
    tailDirection: string,
): string {
    // Match the CSS clip-path vertices from
    // ``bubble-types.module.css``.
    const STAR_PERCENTS: ReadonlyArray<[number, number]> = [
        [0, 20], [10, 0], [25, 15], [40, 0], [55, 15],
        [70, 0], [85, 15], [100, 20], [90, 40],
        [100, 60], [85, 75], [100, 90], [75, 100],
        [60, 85], [45, 100], [30, 85], [15, 100],
        [0, 80], [10, 60], [0, 40],
    ];
    const points = STAR_PERCENTS.map(([px, py]) => ({
        x: left + (px / 100) * width,
        y: top + (py / 100) * height,
    }));
    let starPath = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
    for (let i = 1; i < points.length; i++) {
        starPath += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
    }
    starPath += " Z";
    if (!tail) return starPath;
    const vec = TAIL_VECTORS[tailDirection === "auto" ? "S" : tailDirection];
    if (!vec) return starPath;
    const [vx, vy] = vec;
    const overlap = 3;
    const insetLeft = {
        x: tail.baseLeft.x - vx * overlap,
        y: tail.baseLeft.y - vy * overlap,
    };
    const insetRight = {
        x: tail.baseRight.x - vx * overlap,
        y: tail.baseRight.y - vy * overlap,
    };
    const tailPath =
        `M ${fmt(insetLeft.x)} ${fmt(insetLeft.y)}` +
        tailSubpath(insetLeft, insetRight, tail.tip, tailDirection) +
        ` L ${fmt(insetLeft.x)} ${fmt(insetLeft.y)} Z`;
    return `${starPath} ${tailPath}`;
}

/** Build the complete SVG path for a bubble + tail. */
export function buildBubblePath(input: BubblePathInput): BubblePathOutput {
    const {shape, width, height, tailDirection, tailPositionPct, tailLengthPx} =
        input;

    const {viewBoxLeft, viewBoxTop, viewBoxWidth, viewBoxHeight, bubbleLeft, bubbleTop} =
        computeViewBox(width, height);

    const tail = computeTailGeometry(
        width,
        height,
        bubbleLeft,
        bubbleTop,
        tailDirection,
        tailPositionPct,
        tailLengthPx,
    );

    let d: string;
    if (shape === "sound_effect") {
        // No border / outline. Empty path; the bubble's interior
        // is the text overlay only.
        d = "";
    } else if (shape === "narration") {
        d = roundedRectPath(
            bubbleLeft,
            bubbleTop,
            width,
            height,
            0,
            0,
            tail,
            tailDirection,
        );
    } else if (shape === "thought") {
        // Rounded rect outline (no tail diversion) + an external
        // chain of 1-3 shrinking circles as the tail.
        const rx = Math.min(width, height) * 0.3;
        const outline = roundedRectPath(
            bubbleLeft,
            bubbleTop,
            width,
            height,
            rx,
            rx,
            null,
            tailDirection,
        );
        d =
            outline +
            thoughtCircleChainSuffix(
                bubbleLeft,
                bubbleTop,
                width,
                height,
                tailDirection,
                tailPositionPct,
                tailLengthPx,
            );
    } else if (shape === "whisper") {
        // Rounded rect with ~30% radius matching the existing CSS,
        // dashed via SVG stroke-dasharray at the caller. Tail uses
        // the same curved-bezier shape as speech.
        const rx = Math.min(width, height) * 0.3;
        d = roundedRectPath(
            bubbleLeft,
            bubbleTop,
            width,
            height,
            rx,
            rx,
            tail,
            tailDirection,
        );
    } else if (shape === "speech") {
        d = ellipsePath(
            bubbleLeft + width / 2,
            bubbleTop + height / 2,
            width / 2,
            height / 2,
            tail,
            tailDirection,
        );
    } else if (shape === "shout") {
        d = shoutPath(
            bubbleLeft,
            bubbleTop,
            width,
            height,
            tail,
            tailDirection,
        );
    } else {
        d = "";
    }

    return {
        d,
        viewBox: `${fmt(viewBoxLeft)} ${fmt(viewBoxTop)} ${fmt(viewBoxWidth)} ${fmt(viewBoxHeight)}`,
        bubbleLeft,
        bubbleTop,
        bubbleWidth: width,
        bubbleHeight: height,
    };
}
