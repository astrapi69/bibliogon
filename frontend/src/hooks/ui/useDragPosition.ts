/**
 * useDragPosition — shared pointer-events drag-to-position hook.
 *
 * Extracted 2026-05-28 in Phase 3 C2 (Picture-Book Layout
 * Expansion — collage layout). Generalises the percentage-based
 * pointer-drag pattern that ComicBubble already uses inline (bubble
 * body + tail handle), making it available to CollageCanvas's
 * image + text-region drag handlers without re-inventing the
 * pointer-events plumbing.
 *
 * Contract: the consumer renders an element with the returned
 * pointer handlers attached. The element's parent must carry
 * ``position: relative`` so the draggable's percentage coords
 * resolve against a stable bounding box. While the user drags,
 * ``draftPosition`` returns the live ``{x_pct, y_pct}`` for the
 * consumer to apply as an inline-style override (live preview
 * without persisting). On pointer-up, the hook fires ``onDragEnd``
 * with the final coords and clears the draft.
 *
 * Click vs drag disambiguation: pointer movements below the
 * threshold (default 5 px) are treated as a click — ``onClick``
 * fires instead of ``onDragEnd``. Movements above the threshold
 * mark the gesture as a drag; subsequent pointer-up commits.
 *
 * Bounds: ``onDragEnd`` receives coords clamped so the dragged
 * element stays fully inside its parent — i.e. ``x_pct + width_pct
 * <= 100`` and ``y_pct + height_pct <= 100``. The clamp is also
 * applied live during drag so the draft position never exceeds
 * the bounds.
 *
 * Future Recurring-Component-Unification Rule migration:
 * ComicBubble's inline drag (bubble body + tail handle) should
 * migrate to this hook. Deferred as a separate backlog item
 * (COMIC-BUBBLE-USE-DRAG-POSITION-MIGRATION) — the existing
 * implementation has happy-dom + React StrictMode tuning that
 * needs behavioral-parity verification at migration time.
 */

import {useCallback, useRef, useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";

const DEFAULT_THRESHOLD_PX = 5;

interface UseDragPositionArgs {
    /** Current persisted x percentage (0..100, top-left origin). */
    x_pct: number;
    /** Current persisted y percentage (0..100, top-left origin). */
    y_pct: number;
    /** Width as percentage of parent (1..100). Used to clamp
     *  drag bounds. */
    width_pct: number;
    /** Height as percentage of parent (1..100). Used to clamp
     *  drag bounds. */
    height_pct: number;
    /** Fires on pointer-up when the gesture crossed the drag
     *  threshold. Receives the final clamped position. Persist
     *  via the consumer's API call. Omit to disable drag. */
    onDragEnd?: (x_pct: number, y_pct: number) => void;
    /** Fires on pointer-up when the gesture did NOT cross the
     *  drag threshold (treated as a click). */
    onClick?: () => void;
    /** Pixel threshold to disambiguate click vs drag. Default 5. */
    threshold?: number;
}

interface DragPositionHandlers {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface UseDragPositionResult {
    handlers: DragPositionHandlers;
    /** When non-null, the element is mid-drag. Apply via inline
     *  ``style.left`` / ``style.top`` so the consumer's rendered
     *  position tracks the cursor without committing to the API.
     *  Returns to null on pointer-up. */
    draftPosition: {x_pct: number; y_pct: number} | null;
    /** True iff the gesture has crossed the drag threshold. Some
     *  consumers want to suppress sibling interactions (text
     *  selection, click bubbling) while a drag is in flight. */
    isDragging: boolean;
}

interface DragState {
    startClientX: number;
    startClientY: number;
    startX_pct: number;
    startY_pct: number;
    parentWidthPx: number;
    parentHeightPx: number;
    crossedThreshold: boolean;
    draftX_pct: number;
    draftY_pct: number;
}

/** Clamp coordinates so the dragged element stays fully inside
 *  its parent given its current dimensions. */
function clampWithin(
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

export function useDragPosition({
    x_pct,
    y_pct,
    width_pct,
    height_pct,
    onDragEnd,
    onClick,
    threshold = DEFAULT_THRESHOLD_PX,
}: UseDragPositionArgs): UseDragPositionResult {
    const dragRef = useRef<DragState | null>(null);
    const [draftPosition, setDraftPosition] = useState<
        {x_pct: number; y_pct: number} | null
    >(null);
    const [isDragging, setIsDragging] = useState(false);

    const onPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (!onDragEnd) return;
            // Primary button / single touch only. pointerType
            // "touch" / "pen" don't have a button concept (event
            // .button is 0 in those cases anyway).
            if (event.button !== 0 && event.pointerType === "mouse") return;
            const el = event.currentTarget;
            // The draggable's parent must carry position: relative
            // so its bounding box is the coordinate frame. Falls
            // back to offsetParent if parent isn't a positioned
            // element (defensive).
            const parent =
                (el.parentElement as HTMLElement | null) ??
                (el.offsetParent as HTMLElement | null);
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            dragRef.current = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                startX_pct: x_pct,
                startY_pct: y_pct,
                parentWidthPx: rect.width,
                parentHeightPx: rect.height,
                crossedThreshold: false,
                draftX_pct: x_pct,
                draftY_pct: y_pct,
            };
            try {
                el.setPointerCapture(event.pointerId);
            } catch {
                // happy-dom / older browsers may reject the API;
                // pointer tracking falls back to event bubbling
                // (still works for in-element drags).
            }
        },
        [onDragEnd, x_pct, y_pct],
    );

    const onPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            const state = dragRef.current;
            if (!state) return;
            const dx = event.clientX - state.startClientX;
            const dy = event.clientY - state.startClientY;
            if (!state.crossedThreshold) {
                if (Math.hypot(dx, dy) < threshold) return;
                state.crossedThreshold = true;
                setIsDragging(true);
            }
            const deltaXPct = (dx / state.parentWidthPx) * 100;
            const deltaYPct = (dy / state.parentHeightPx) * 100;
            const clamped = clampWithin(
                state.startX_pct + deltaXPct,
                state.startY_pct + deltaYPct,
                width_pct,
                height_pct,
            );
            state.draftX_pct = clamped.x_pct;
            state.draftY_pct = clamped.y_pct;
            setDraftPosition({x_pct: clamped.x_pct, y_pct: clamped.y_pct});
        },
        [width_pct, height_pct, threshold],
    );

    const onPointerUp = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            const state = dragRef.current;
            dragRef.current = null;
            try {
                event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
                // happy-dom / older browsers; not fatal.
            }
            setIsDragging(false);
            if (!state) return;
            if (state.crossedThreshold && onDragEnd) {
                onDragEnd(state.draftX_pct, state.draftY_pct);
                setDraftPosition(null);
                return;
            }
            // Click path — no significant movement.
            setDraftPosition(null);
            if (onClick) onClick();
        },
        [onDragEnd, onClick],
    );

    const onPointerCancel = useCallback(() => {
        dragRef.current = null;
        setDraftPosition(null);
        setIsDragging(false);
    }, []);

    return {
        handlers: {onPointerDown, onPointerMove, onPointerUp, onPointerCancel},
        draftPosition,
        isDragging,
    };
}
