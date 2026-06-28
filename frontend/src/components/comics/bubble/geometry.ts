/**
 * Shared geometry helpers for the ComicBubble drag interactions.
 * Extracted from ComicBubble.tsx (#681).
 */

/** Movement (px) before a pointer-down is treated as a drag rather than
 *  a click. Used by both the bubble-move and tail-handle drags. */
export const DRAG_THRESHOLD_PX = 5;

/** Clamp a percentage value to [0, 100], falling back when undefined or
 *  non-finite. */
export function clampPct(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, value));
}

/** Clamp the candidate anchor to keep the bubble fully inside the
 *  panel given its current dimensions. */
export function clampAnchorWithin(
    x_pct: number,
    y_pct: number,
    width_pct: number,
    height_pct: number,
): {x_pct: number; y_pct: number} {
    const maxX = Math.max(0, 100 - width_pct);
    const maxY = Math.max(0, 100 - height_pct);
    return {
        x_pct: Math.max(0, Math.min(maxX, x_pct)),
        y_pct: Math.max(0, Math.min(maxY, y_pct)),
    };
}
