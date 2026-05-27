/**
 * ComicBubble — renders one comic_bubbles row as a positioned
 * editor preview.
 *
 * Comics-Session-2 C5. Editor-side mirror of the walker's
 * ``_render_comic_bubble`` in
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``.
 *
 * Positioning: absolute within the parent ``ComicPanel`` using
 * ``anchor: {x_pct, y_pct}`` for the top-left corner and
 * ``width_pct`` / ``height_pct`` for dimensions.
 *
 * The bubble shape (border/background/radius) comes from the
 * ``bubble_type`` via ``bubbleTypeClassName``; the optional
 * ``bubble_config`` (Tier 1 + Tier 2 properties) layers inline
 * overrides on top.
 *
 * Tail rendering delegates to ``BubbleTail``.
 *
 * Drag-to-position: when ``onDragEnd`` is supplied, the bubble
 * becomes pointer-draggable on the canvas. PointerEvents handle
 * mouse + touch + pen uniformly; ``setPointerCapture`` keeps
 * events flowing even when the cursor leaves the bubble bounds.
 * A 5px movement threshold disambiguates click-to-select from
 * drag-to-reposition. During drag, a local draft offset applies
 * via CSS so the bubble visually tracks the cursor; the API
 * commit happens once on pointer-up. Clamped to keep the bubble
 * fully inside the panel ([0, 100 - width_pct] × [0, 100 -
 * height_pct]).
 */

import {useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent} from "react";

import {BubbleTail, type BubbleTailDirection} from "./BubbleTail";
import {
    BUBBLE_BASE_CLASS,
    bubbleTypeClassName,
} from "./bubbleTypeStyle";
import {
    computeVisibleTipPosition,
    deriveTailFromTip,
} from "./tailDerivation";

export interface ComicBubbleData {
    id: string;
    panel_id: string;
    position: number;
    bubble_type: string;
    anchor: {x_pct?: number; y_pct?: number};
    width_pct: number;
    height_pct: number;
    tail_direction: string;
    tail_position_pct: number;
    tail_length_px: number;
    bubble_config?: Record<string, unknown> | null;
    text_content?: string | null;
}

interface ComicBubbleProps {
    bubble: ComicBubbleData;
    selected?: boolean;
    onClick?: () => void;
    /** Fires once on pointer-up after a drag (movement > threshold).
     *  Receives the clamped anchor in percentage coords relative to
     *  the parent panel. Click-vs-drag disambiguation: if movement
     *  stays under the threshold, ``onClick`` fires instead. */
    onDragEnd?: (x_pct: number, y_pct: number) => void;
    /** Fires once on pointer-up after a tail-handle drag exceeds
     *  the 5px threshold. The receiver should persist the new
     *  (direction, position_pct, length_px) via the existing
     *  ``api.comics.updateBubble`` path. */
    onTailDragEnd?: (
        direction: string,
        positionPct: number,
        lengthPx: number,
    ) => void;
}

const DRAG_THRESHOLD_PX = 5;

function clampPct(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, value));
}

/** Clamp the candidate anchor to keep the bubble fully inside the
 *  panel given its current dimensions. */
function clampAnchorWithin(
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

export function ComicBubble({
    bubble,
    selected,
    onClick,
    onDragEnd,
    onTailDragEnd,
}: ComicBubbleProps) {
    const x = clampPct(bubble.anchor?.x_pct, 0);
    const y = clampPct(bubble.anchor?.y_pct, 0);
    const w = clampPct(bubble.width_pct, 30);
    const h = clampPct(bubble.height_pct, 20);

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
    /** Tail-handle drag state. Mirrors the bubble-drag shape but
     *  operates in BUBBLE-local pixel coords (origin = bubble top-
     *  left) rather than panel-relative percent coords. */
    const tailDragRef = useRef<{
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
    } | null>(null);
    const [tailDraft, setTailDraft] = useState<{
        direction: string;
        positionPct: number;
        lengthPx: number;
    } | null>(null);

    const renderX = draftAnchor?.x ?? x;
    const renderY = draftAnchor?.y ?? y;
    // Apply the tail-drag draft when active so the visible tail
    // tracks the cursor without committing to the API.
    const renderTailDirection =
        tailDraft?.direction ?? bubble.tail_direction;
    const renderTailPositionPct =
        tailDraft?.positionPct ?? bubble.tail_position_pct;
    const renderTailLengthPx = tailDraft?.lengthPx ?? bubble.tail_length_px;

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
                draftDirection: bubble.tail_direction,
                draftPositionPct: bubble.tail_position_pct,
                draftLengthPx: bubble.tail_length_px,
            };
            try {
                handleEl.setPointerCapture(event.pointerId);
            } catch {
                // happy-dom may reject; not fatal.
            }
        },
        [
            onTailDragEnd,
            bubble.tail_direction,
            bubble.tail_position_pct,
            bubble.tail_length_px,
        ],
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

    const baseStyle: CSSProperties = {
        position: "absolute",
        left: `${renderX}%`,
        top: `${renderY}%`,
        width: `${w}%`,
        height: `${h}%`,
        outline: selected ? "2px solid var(--accent, #b45309)" : "none",
        outlineOffset: "1px",
        cursor: onDragEnd ? "move" : onClick ? "pointer" : "default",
        touchAction: onDragEnd ? "none" : undefined,
    };

    // bubble_config Tier-1 overrides (background_color, border_color,
    // border_width, border_style, border_radius, opacity). Renderer
    // is permissive: unknown values fall through.
    const config = bubble.bubble_config ?? {};
    const overrideStyle: CSSProperties = {};
    if (typeof config.background_color === "string") {
        overrideStyle.background = config.background_color;
    }
    if (typeof config.border_color === "string" && typeof config.border_width === "number") {
        const style =
            typeof config.border_style === "string" ? config.border_style : "solid";
        overrideStyle.border = `${config.border_width}px ${style} ${config.border_color}`;
    }
    if (typeof config.border_radius === "number") {
        overrideStyle.borderRadius = `${config.border_radius}%`;
    }
    if (typeof config.opacity === "number") {
        overrideStyle.opacity = config.opacity;
    }
    if (typeof config.padding === "number") {
        overrideStyle.padding = `${config.padding}px`;
    }
    if (typeof config.font_family === "string") {
        overrideStyle.fontFamily = config.font_family;
    }
    if (typeof config.font_size === "number") {
        overrideStyle.fontSize = `${config.font_size}pt`;
    }
    if (typeof config.font_weight === "string") {
        overrideStyle.fontWeight = config.font_weight;
    }
    if (typeof config.text_color === "string") {
        overrideStyle.color = config.text_color;
    }
    if (typeof config.text_align === "string") {
        overrideStyle.textAlign = config.text_align as CSSProperties["textAlign"];
    }
    if (config.italic === true) {
        overrideStyle.fontStyle = "italic";
    }

    const interactive = Boolean(onDragEnd || onClick);
    return (
        <div
            data-testid={`comic-bubble-${bubble.id}`}
            data-bubble-type={bubble.bubble_type}
            className={`${BUBBLE_BASE_CLASS} ${bubbleTypeClassName(bubble.bubble_type)}`}
            style={{...baseStyle, ...overrideStyle}}
            onPointerDown={onDragEnd ? handlePointerDown : undefined}
            onPointerMove={onDragEnd ? handlePointerMove : undefined}
            onPointerUp={onDragEnd ? handlePointerUp : undefined}
            onPointerCancel={onDragEnd ? handlePointerCancel : undefined}
            onClick={
                onClick
                    ? (e) => {
                          // Bubble-click is more specific than panel-click;
                          // stop propagation so the parent's onPanelClick
                          // doesn't fire and clear the bubble selection.
                          e.stopPropagation();
                          // When pointer events fired (real browsers),
                          // the pointer-up handler already called onClick
                          // (if the movement stayed under the drag
                          // threshold). Reset the ref + bail so we don't
                          // double-fire. When pointer events did NOT
                          // fire (happy-dom + fireEvent.click), the ref
                          // stays false and we fall through to onClick.
                          if (pointerHandledRef.current) {
                              pointerHandledRef.current = false;
                              return;
                          }
                          onClick();
                      }
                    : undefined
            }
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
        >
            {bubble.text_content ?? ""}
            <BubbleTail
                direction={renderTailDirection as BubbleTailDirection}
                positionPct={renderTailPositionPct}
                lengthPx={renderTailLengthPx}
                bubbleBackgroundColor={
                    typeof config.background_color === "string"
                        ? config.background_color
                        : "white"
                }
            />
            {/* Tail drag handle — only when the bubble is selected,
                a drag callback is wired, and the tail is actually
                visible (direction !== "none"). The handle is a
                small circle positioned at the visible tail tip; the
                user grabs it to reshape the tail. Position derived
                via computeVisibleTipPosition so it stays aligned
                with the rendered BubbleTail polygon. */}
            {selected &&
                onTailDragEnd &&
                renderTailDirection !== "none" &&
                (() => {
                    // bubble's bounding rect can be computed only at
                    // runtime; use the pct-of-panel × panel-pixels
                    // approximation. We don't have panel pixels in
                    // ComicBubble's render closure, so use 100×100 as
                    // a normalized reference frame — the BubbleTail
                    // renders relative to the bubble itself, so the
                    // handle position can be a function of the
                    // bubble's own width/height. We use 100 as a
                    // canonical unit, then render with the same
                    // ``left: X%`` / ``top: Y%`` shape the bubble uses
                    // for its own positioning.
                    const tipNorm = computeVisibleTipPosition(
                        renderTailDirection as BubbleTailDirection,
                        renderTailPositionPct,
                        renderTailLengthPx,
                        100,
                        100,
                    );
                    if (!tipNorm) return null;
                    return (
                        <div
                            data-testid={`comic-bubble-tail-handle-${bubble.id}`}
                            onPointerDown={handleTailPointerDown}
                            onPointerMove={handleTailPointerMove}
                            onPointerUp={handleTailPointerUp}
                            onPointerCancel={handleTailPointerCancel}
                            style={{
                                position: "absolute",
                                left: `${tipNorm.x}%`,
                                top: `${tipNorm.y}%`,
                                width: 12,
                                height: 12,
                                marginLeft: -6,
                                marginTop: -6,
                                borderRadius: "50%",
                                background:
                                    "var(--accent, #b45309)",
                                border: "2px solid white",
                                boxShadow:
                                    "0 1px 3px rgba(0, 0, 0, 0.4)",
                                cursor: "grab",
                                touchAction: "none",
                                zIndex: 2,
                            }}
                        />
                    );
                })()}
        </div>
    );
}

export default ComicBubble;
