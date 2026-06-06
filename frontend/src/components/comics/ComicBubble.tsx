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

import {useCallback, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent} from "react";

import {buildBubblePath, type BubbleShape} from "./bubblePath";
import type {BubbleTailDirection} from "./BubbleTail";
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
     *  ``getStorage().comics.updateBubble`` path. */
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
        overflow: "visible",
    };

    // bubble_config Tier-1 overrides. Now flow into SVG path
    // attributes (fill, stroke, stroke-width, stroke-dasharray) +
    // text-overlay CSS (typography, opacity, padding).
    const config = bubble.bubble_config ?? {};
    const textOverlayStyle: CSSProperties = {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "4px 8px",
        boxSizing: "border-box",
        pointerEvents: "none",
        // Explicit black default. Mirror of the walker's
        // ``color: black;`` in ``_render_comic_bubble`` of
        // ``plugins/bibliogon-plugin-comics/bibliogon_comics/
        // comic_book_pdf.py``. Without this, the overlay text
        // inherits the editor-canvas color from the ancestor
        // chain — that's typically a muted ``--text-sidebar``
        // value that reads as faded / transparent against the
        // bubble's white interior. The Approach A migration
        // (2026-05-27) moved every other typography default
        // here but missed this one. ``config.text_color`` from
        // ``bubble_config`` still overrides below.
        color: "black",
    };
    if (typeof config.opacity === "number") {
        textOverlayStyle.opacity = config.opacity;
    }
    if (typeof config.padding === "number") {
        textOverlayStyle.padding = `${config.padding}px`;
    }
    if (typeof config.font_family === "string") {
        textOverlayStyle.fontFamily = config.font_family;
    }
    if (typeof config.font_size === "number") {
        textOverlayStyle.fontSize = `${config.font_size}pt`;
    }
    if (typeof config.font_weight === "string") {
        textOverlayStyle.fontWeight = config.font_weight;
    }
    if (typeof config.text_color === "string") {
        textOverlayStyle.color = config.text_color;
    }
    if (typeof config.text_align === "string") {
        textOverlayStyle.textAlign = config.text_align as CSSProperties["textAlign"];
    }
    if (config.italic === true) {
        textOverlayStyle.fontStyle = "italic";
    }

    // Default visual attributes per bubble type. These match the
    // values that used to live in ``bubble-types.module.css`` —
    // moved here so the single SVG path carries them as SVG
    // attributes instead of CSS class-based rules.
    const bubbleType = bubble.bubble_type;
    let defaultFill = "white";
    let defaultStroke: string | null = "black";
    let defaultStrokeWidth = 1.5;
    let defaultStrokeDasharray: string | undefined;
    if (bubbleType === "narration") {
        defaultFill = "#f5f5dc";
        defaultStrokeWidth = 1;
    } else if (bubbleType === "thought") {
        defaultStrokeWidth = 1;
    } else if (bubbleType === "whisper") {
        defaultStrokeWidth = 1;
        defaultStrokeDasharray = "4 3";
    } else if (bubbleType === "sound_effect") {
        defaultFill = "transparent";
        defaultStroke = null;
    }
    const fillColor =
        typeof config.background_color === "string"
            ? config.background_color
            : defaultFill;
    const strokeColor =
        typeof config.border_color === "string"
            ? config.border_color
            : defaultStroke ?? "transparent";
    const strokeWidth =
        typeof config.border_width === "number"
            ? config.border_width
            : defaultStrokeWidth;
    const strokeDasharray =
        typeof config.border_style === "string" &&
        config.border_style === "dashed"
            ? "4 3"
            : typeof config.border_style === "string" &&
                config.border_style === "dotted"
              ? "1 2"
              : defaultStrokeDasharray;

    // Build the single SVG path. The viewBox uses a 100×100 unit
    // space; CSS overflow:visible lets the tail extend past the
    // bubble's bounding box.
    const pathOutput = buildBubblePath({
        shape: bubbleType as BubbleShape,
        width: 100,
        height: 100,
        tailDirection: renderTailDirection as BubbleTailDirection,
        tailPositionPct: renderTailPositionPct,
        tailLengthPx: renderTailLengthPx,
    });

    const interactive = Boolean(onDragEnd || onClick);
    // a11y accessible name: when the bubble carries text_content,
    // the text inside is the accessible name. When empty (common
    // for freshly-added bubbles), provide an explicit aria-label
    // so axe-core's "button-name" rule is satisfied.
    const bubbleAriaLabel =
        bubble.text_content && bubble.text_content.trim() !== ""
            ? undefined
            : `Comic ${bubble.bubble_type} bubble`;
    return (
        <div
            data-testid={`comic-bubble-${bubble.id}`}
            data-bubble-type={bubble.bubble_type}
            style={baseStyle}
            aria-label={interactive ? bubbleAriaLabel : undefined}
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
            onKeyDown={interactive ? handleKeyDown : undefined}
        >
            {pathOutput.d ? (
                <svg
                    data-testid={`bubble-shape-svg-${bubble.id}`}
                    width="100%"
                    height="100%"
                    viewBox={pathOutput.viewBox}
                    preserveAspectRatio="none"
                    style={{
                        position: "absolute",
                        inset: 0,
                        overflow: "visible",
                        pointerEvents: "none",
                    }}
                    aria-hidden="true"
                >
                    <path
                        data-testid={`bubble-shape-path-${bubble.id}`}
                        d={pathOutput.d}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        strokeLinejoin="round"
                    />
                </svg>
            ) : null}
            <div style={textOverlayStyle}>{bubble.text_content ?? ""}</div>
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
                            role="button"
                            tabIndex={0}
                            aria-label="Drag the tail tip to reposition (arrow keys: position; up/down: length)"
                            onKeyDown={handleTailKeyDown}
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
                                border: "2px solid var(--bg-card)",
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
