/**
 * Pointer + keyboard drag interaction for a ComicBubble's tail handle.
 * Extracted from ComicBubble.tsx (#681). Operates in bubble-local pixel
 * coords; the visible tail tracks the cursor via a local draft and the
 * persisted (direction, position_pct, length_px) commit fires once on
 * pointer-up.
 */

import {
    useCallback,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";

import {DRAG_THRESHOLD_PX} from "./geometry";
import type {BubbleTailDirection} from "../BubbleTail";
import {deriveTailFromTip} from "../tailDerivation";

interface TailDragState {
    startClientX: number;
    startClientY: number;
    startTipX: number;
    startTipY: number;
    bubbleWidthPx: number;
    bubbleHeightPx: number;
    crossedThreshold: boolean;
    draftDirection: string;
    draftPositionPct: number;
    draftLengthPx: number;
}

interface Options {
    tailDirection: string;
    tailPositionPct: number;
    tailLengthPx: number;
    onTailDragEnd?: (
        direction: string,
        positionPct: number,
        lengthPx: number,
    ) => void;
}

export function useTailDrag({
    tailDirection,
    tailPositionPct,
    tailLengthPx,
    onTailDragEnd,
}: Options) {
    /** Tail-handle drag state. Mirrors the bubble-drag shape but
     *  operates in BUBBLE-local pixel coords (origin = bubble top-
     *  left) rather than panel-relative percent coords. */
    const tailDragRef = useRef<TailDragState | null>(null);
    const [tailDraft, setTailDraft] = useState<{
        direction: string;
        positionPct: number;
        lengthPx: number;
    } | null>(null);

    // Apply the tail-drag draft when active so the visible tail
    // tracks the cursor without committing to the API.
    const renderTailDirection = tailDraft?.direction ?? tailDirection;
    const renderTailPositionPct = tailDraft?.positionPct ?? tailPositionPct;
    const renderTailLengthPx = tailDraft?.lengthPx ?? tailLengthPx;

    const handleTailPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (!onTailDragEnd) return;
            if (event.button !== 0 && event.pointerType === "mouse") return;
            // Stop propagation so the bubble's own pointer-down does
            // NOT also fire (which would start a bubble move).
            event.stopPropagation();
            const handleEl = event.currentTarget;
            // The handle is a direct child of the bubble; the bubble
            // is the handle's parentElement.
            const bubbleEl = handleEl.parentElement as HTMLElement | null;
            if (!bubbleEl) return;
            const rect = bubbleEl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            // Starting tip position in bubble-local pixel coords.
            const startTipX = event.clientX - rect.left;
            const startTipY = event.clientY - rect.top;
            tailDragRef.current = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                startTipX,
                startTipY,
                bubbleWidthPx: rect.width,
                bubbleHeightPx: rect.height,
                crossedThreshold: false,
                draftDirection: tailDirection,
                draftPositionPct: tailPositionPct,
                draftLengthPx: tailLengthPx,
            };
            try {
                handleEl.setPointerCapture(event.pointerId);
            } catch {
                // happy-dom may reject; not fatal.
            }
        },
        [onTailDragEnd, tailDirection, tailPositionPct, tailLengthPx],
    );

    const handleTailPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const state = tailDragRef.current;
            if (!state) return;
            const dx = event.clientX - state.startClientX;
            const dy = event.clientY - state.startClientY;
            if (!state.crossedThreshold) {
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                state.crossedThreshold = true;
            }
            const tipX = state.startTipX + dx;
            const tipY = state.startTipY + dy;
            const derived = deriveTailFromTip(
                tipX,
                tipY,
                state.bubbleWidthPx,
                state.bubbleHeightPx,
            );
            state.draftDirection = derived.direction;
            state.draftPositionPct = derived.positionPct;
            state.draftLengthPx = derived.lengthPx;
            setTailDraft({
                direction: derived.direction,
                positionPct: derived.positionPct,
                lengthPx: derived.lengthPx,
            });
        },
        [],
    );

    const handleTailPointerUp = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const state = tailDragRef.current;
            tailDragRef.current = null;
            try {
                event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
                // ignore
            }
            if (!state) return;
            if (state.crossedThreshold && onTailDragEnd) {
                onTailDragEnd(
                    state.draftDirection,
                    state.draftPositionPct,
                    state.draftLengthPx,
                );
            }
            setTailDraft(null);
        },
        [onTailDragEnd],
    );

    const handleTailPointerCancel = useCallback(() => {
        tailDragRef.current = null;
        setTailDraft(null);
    }, []);

    /** Keyboard fallback for the tail-handle pointer drag. Left/
     *  Right nudge the tail's position along the bubble edge;
     *  Up/Down lengthen/shorten it. Direction is preserved. These
     *  are the canonical persisted params that onTailDragEnd
     *  accepts directly, so no pixel-geometry derivation is needed.
     */
    const handleTailKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (!onTailDragEnd) return;
            const posStep = event.shiftKey ? 10 : 4;
            const lenStep = event.shiftKey ? 8 : 4;
            let pos = renderTailPositionPct;
            let len = renderTailLengthPx;
            switch (event.key) {
                case "ArrowLeft":
                    pos -= posStep;
                    break;
                case "ArrowRight":
                    pos += posStep;
                    break;
                case "ArrowUp":
                    len += lenStep;
                    break;
                case "ArrowDown":
                    len -= lenStep;
                    break;
                default:
                    return;
            }
            event.preventDefault();
            pos = Math.max(0, Math.min(100, pos));
            len = Math.max(10, Math.min(100, len));
            onTailDragEnd(renderTailDirection, pos, len);
        },
        [
            onTailDragEnd,
            renderTailDirection,
            renderTailPositionPct,
            renderTailLengthPx,
        ],
    );

    return {
        renderTailDirection,
        renderTailPositionPct,
        renderTailLengthPx,
        handleTailPointerDown,
        handleTailPointerMove,
        handleTailPointerUp,
        handleTailPointerCancel,
        handleTailKeyDown,
    };
}
