/**
 * Pointer + keyboard drag-to-position interaction for a ComicBubble.
 * Extracted from ComicBubble.tsx (#681). Behaviour unchanged: a 5px
 * threshold disambiguates click-from-drag, a local draft offset tracks
 * the cursor during drag, and the API commit fires once on pointer-up.
 */

import {
    useCallback,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";

import {DRAG_THRESHOLD_PX, clampAnchorWithin} from "./geometry";

interface DragState {
    startClientX: number;
    startClientY: number;
    startAnchorX: number;
    startAnchorY: number;
    panelWidthPx: number;
    panelHeightPx: number;
    crossedThreshold: boolean;
    /** Live delta in pct space; applied via local state so the
     *  bubble re-renders at the drag position without committing. */
    draftX: number;
    draftY: number;
}

interface Options {
    x: number;
    y: number;
    w: number;
    h: number;
    onDragEnd?: (x_pct: number, y_pct: number) => void;
    onClick?: () => void;
}

export function useBubbleDrag({x, y, w, h, onDragEnd, onClick}: Options) {
    const dragRef = useRef<DragState | null>(null);
    /** True once pointer-down fires; flips back to false on the
     *  next mount or a pointer-cancel. The synthetic React click
     *  handler uses this to decide whether the pointer-event path
     *  already handled the interaction. happy-dom tests using
     *  ``fireEvent.click`` skip the pointer-event path entirely;
     *  the click handler must still call onClick in that case. */
    const pointerHandledRef = useRef(false);
    const [draftAnchor, setDraftAnchor] = useState<{x: number; y: number} | null>(
        null,
    );

    const renderX = draftAnchor?.x ?? x;
    const renderY = draftAnchor?.y ?? y;

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (!onDragEnd) return;
            // Primary button / single touch only.
            if (event.button !== 0 && event.pointerType === "mouse") return;
            const el = event.currentTarget;
            // The bubble is always a direct child of ComicPanel which
            // carries ``position: relative``. ``offsetParent`` works in
            // real browsers but happy-dom's coverage is patchy, so the
            // parent element is the reliable lookup. Falls back to
            // offsetParent if the DOM shape ever changes.
            const panel =
                (el.parentElement as HTMLElement | null) ??
                (el.offsetParent as HTMLElement | null);
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            pointerHandledRef.current = true;
            dragRef.current = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                startAnchorX: x,
                startAnchorY: y,
                panelWidthPx: rect.width,
                panelHeightPx: rect.height,
                crossedThreshold: false,
                draftX: x,
                draftY: y,
            };
            try {
                el.setPointerCapture(event.pointerId);
            } catch {
                // happy-dom / older browsers may reject; not fatal.
            }
        },
        [onDragEnd, x, y],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const state = dragRef.current;
            if (!state) return;
            const dx = event.clientX - state.startClientX;
            const dy = event.clientY - state.startClientY;
            if (!state.crossedThreshold) {
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                state.crossedThreshold = true;
            }
            const deltaXPct = (dx / state.panelWidthPx) * 100;
            const deltaYPct = (dy / state.panelHeightPx) * 100;
            const clamped = clampAnchorWithin(
                state.startAnchorX + deltaXPct,
                state.startAnchorY + deltaYPct,
                w,
                h,
            );
            state.draftX = clamped.x_pct;
            state.draftY = clamped.y_pct;
            setDraftAnchor({x: clamped.x_pct, y: clamped.y_pct});
        },
        [w, h],
    );

    const handlePointerUp = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const state = dragRef.current;
            dragRef.current = null;
            try {
                event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
                // ignore — handled elsewhere
            }
            if (!state) return;
            if (state.crossedThreshold && onDragEnd) {
                onDragEnd(state.draftX, state.draftY);
                setDraftAnchor(null);
                return;
            }
            // Click path: no significant movement.
            setDraftAnchor(null);
            if (onClick) {
                onClick();
            }
        },
        [onDragEnd, onClick],
    );

    const handlePointerCancel = useCallback(() => {
        dragRef.current = null;
        setDraftAnchor(null);
    }, []);

    /** Keyboard fallback for the pointer-drag bubble interaction.
     *  The bubble is a role="button" div, so Enter/Space must be
     *  wired explicitly (a plain div does not activate on key like
     *  a native <button>). Arrow keys nudge the anchor — the
     *  keyboard equivalent of dragging — committing through the
     *  same onDragEnd + clampAnchorWithin path as the pointer
     *  handler. Shift = coarse (5%), default = fine (1%). */
    const handleKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
                if (onClick) {
                    event.preventDefault();
                    onClick();
                }
                return;
            }
            if (!onDragEnd) return;
            const step = event.shiftKey ? 5 : 1;
            let dx = 0;
            let dy = 0;
            switch (event.key) {
                case "ArrowLeft":
                    dx = -step;
                    break;
                case "ArrowRight":
                    dx = step;
                    break;
                case "ArrowUp":
                    dy = -step;
                    break;
                case "ArrowDown":
                    dy = step;
                    break;
                default:
                    return;
            }
            event.preventDefault();
            const clamped = clampAnchorWithin(x + dx, y + dy, w, h);
            onDragEnd(clamped.x_pct, clamped.y_pct);
        },
        [onClick, onDragEnd, x, y, w, h],
    );

    return {
        renderX,
        renderY,
        pointerHandledRef,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerCancel,
        handleKeyDown,
    };
}
