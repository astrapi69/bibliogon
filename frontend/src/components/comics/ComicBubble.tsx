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
 * ``bubble_type`` via ``buildBubbleVisualAttrs``; the optional
 * ``bubble_config`` (Tier 1 + Tier 2 properties) layers inline
 * overrides on top. Tail rendering delegates to ``BubbleTail``.
 *
 * Issue #681 moves the bubble-move + tail-handle drag interactions into
 * useBubbleDrag / useTailDrag, the style derivation into bubbleStyle, and
 * the geometry helpers into bubble/geometry; this file is the orchestrator
 * that wires them to the rendered SVG + overlay.
 */

import {type CSSProperties} from "react";

import {buildBubblePath, type BubbleShape} from "./bubblePath";
import type {BubbleTailDirection} from "./BubbleTail";
import {computeVisibleTipPosition} from "./tailDerivation";
import {clampPct} from "./bubble/geometry";
import {useBubbleDrag} from "./bubble/useBubbleDrag";
import {useTailDrag} from "./bubble/useTailDrag";
import {buildBubbleVisualAttrs, buildTextOverlayStyle} from "./bubble/bubbleStyle";

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

    const {
        renderX,
        renderY,
        pointerHandledRef,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerCancel,
        handleKeyDown,
    } = useBubbleDrag({x, y, w, h, onDragEnd, onClick});

    const {
        renderTailDirection,
        renderTailPositionPct,
        renderTailLengthPx,
        handleTailPointerDown,
        handleTailPointerMove,
        handleTailPointerUp,
        handleTailPointerCancel,
        handleTailKeyDown,
    } = useTailDrag({
        tailDirection: bubble.tail_direction,
        tailPositionPct: bubble.tail_position_pct,
        tailLengthPx: bubble.tail_length_px,
        onTailDragEnd,
    });

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

    // bubble_config Tier-1 overrides flow into the text-overlay CSS
    // (typography, opacity, padding) + the SVG path attributes (fill,
    // stroke, stroke-width, stroke-dasharray).
    const config = bubble.bubble_config ?? {};
    const textOverlayStyle = buildTextOverlayStyle(config);
    const bubbleType = bubble.bubble_type;
    const {fillColor, strokeColor, strokeWidth, strokeDasharray} =
        buildBubbleVisualAttrs(bubbleType, config);

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
                                background: "var(--accent, #b45309)",
                                border: "2px solid var(--bg-card)",
                                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
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
