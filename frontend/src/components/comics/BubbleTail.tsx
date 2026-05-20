/**
 * BubbleTail — shared SVG triangle primitive for comic-book bubbles.
 *
 * Comics-Session-2 C4 (plugin-comics). Mirrors the walker's
 * tail geometry verbatim so the in-editor preview matches the
 * rendered PDF.
 *
 * Source of truth for the math:
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``
 * — ``_TAIL_DIRECTION_VECTORS`` + ``_render_bubble_tail_svg``.
 *
 * Tail directions are 8 octants (N/NE/E/SE/S/SW/W/NW) plus the
 * sentinels ``none`` (no render) and ``auto`` (currently maps to
 * S until Session 3 nearest-edge auto-pick lands; matches the
 * walker's gamma-shim default).
 *
 * The component renders a self-contained ``<svg>`` element with
 * a single triangle ``<polygon>``. Positioning happens via the
 * parent bubble's ``position: relative`` + this svg's
 * ``position: absolute`` — same shape the walker emits.
 *
 * Lives in ``components/comics/`` rather than the plugin
 * namespace because the picture-book single-bubble path
 * (Q3 decision) does NOT reuse it; this is a comic-book-only
 * primitive but housed at the shared-frontend layer so future
 * surfaces can adopt it without crossing the plugin boundary.
 */

import type {CSSProperties} from "react";

export type BubbleTailDirection =
    | "N"
    | "NE"
    | "E"
    | "SE"
    | "S"
    | "SW"
    | "W"
    | "NW"
    | "none"
    | "auto";

interface BubbleTailProps {
    direction: BubbleTailDirection;
    positionPct: number;
    lengthPx: number;
    fillColor?: string;
    strokeColor?: string;
    strokeWidthPx?: number;
}

const TAIL_DIRECTION_VECTORS: Record<string, [number, number]> = {
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

export function BubbleTail({
    direction,
    positionPct,
    lengthPx,
    fillColor = "white",
    strokeColor = "black",
    strokeWidthPx = 1.5,
}: BubbleTailProps) {
    if (direction === "none") {
        return null;
    }
    const canonicalDirection = direction === "auto" ? "S" : direction;
    const vec = TAIL_DIRECTION_VECTORS[canonicalDirection];
    if (!vec) {
        return null;
    }
    const [vx, vy] = vec;

    const tipX = vx * lengthPx;
    const tipY = vy * lengthPx;
    const basePerpX = -vy * HALF_BASE;
    const basePerpY = vx * HALF_BASE;
    const points =
        `${tipX.toFixed(1)},${tipY.toFixed(1)} ` +
        `${basePerpX.toFixed(1)},${basePerpY.toFixed(1)} ` +
        `${(-basePerpX).toFixed(1)},${(-basePerpY).toFixed(1)}`;

    const edgeOffset = Math.max(0, Math.min(100, positionPct));
    const sideStyle: CSSProperties = {position: "absolute"};
    if (["S", "SE", "SW"].includes(canonicalDirection)) {
        sideStyle.bottom = 0;
        sideStyle.left = `${edgeOffset}%`;
    } else if (["N", "NE", "NW"].includes(canonicalDirection)) {
        sideStyle.top = 0;
        sideStyle.left = `${edgeOffset}%`;
    } else if (canonicalDirection === "E") {
        sideStyle.right = 0;
        sideStyle.top = `${edgeOffset}%`;
    } else if (canonicalDirection === "W") {
        sideStyle.left = 0;
        sideStyle.top = `${edgeOffset}%`;
    }

    const svgWidth = Math.max(Math.floor(Math.abs(tipX) + HALF_BASE * 2), 4);
    const svgHeight = Math.max(Math.floor(Math.abs(tipY) + HALF_BASE * 2), 4);
    const viewBox =
        `${(-svgWidth / 2).toFixed(0)} ` +
        `${(-svgHeight / 2).toFixed(0)} ` +
        `${svgWidth} ${svgHeight}`;

    return (
        <svg
            className="bubble-tail"
            data-testid="bubble-tail-svg"
            data-direction={canonicalDirection}
            style={{
                ...sideStyle,
                width: `${svgWidth}px`,
                height: `${svgHeight}px`,
                transform: "translate(-50%, 0)",
                overflow: "visible",
            }}
            viewBox={viewBox}
        >
            <polygon
                points={points}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidthPx}
            />
        </svg>
    );
}

export default BubbleTail;
