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
 */

import type {CSSProperties} from "react";

import {BubbleTail, type BubbleTailDirection} from "./BubbleTail";
import {
    BUBBLE_BASE_CLASS,
    bubbleTypeClassName,
} from "./bubbleTypeStyle";

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
}

function clampPct(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, value));
}

export function ComicBubble({bubble, selected, onClick}: ComicBubbleProps) {
    const x = clampPct(bubble.anchor?.x_pct, 0);
    const y = clampPct(bubble.anchor?.y_pct, 0);
    const w = clampPct(bubble.width_pct, 30);
    const h = clampPct(bubble.height_pct, 20);

    const baseStyle: CSSProperties = {
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
        outline: selected ? "2px solid var(--accent, #b45309)" : "none",
        outlineOffset: "1px",
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

    return (
        <div
            data-testid={`comic-bubble-${bubble.id}`}
            data-bubble-type={bubble.bubble_type}
            className={`${BUBBLE_BASE_CLASS} ${bubbleTypeClassName(bubble.bubble_type)}`}
            style={{...baseStyle, ...overrideStyle}}
            onClick={
                onClick
                    ? (e) => {
                          // Bubble-click is more specific than panel-click;
                          // stop propagation so the parent's onPanelClick
                          // doesn't fire and clear the bubble selection.
                          e.stopPropagation();
                          onClick();
                      }
                    : undefined
            }
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {bubble.text_content ?? ""}
            <BubbleTail
                direction={bubble.tail_direction as BubbleTailDirection}
                positionPct={bubble.tail_position_pct}
                lengthPx={bubble.tail_length_px}
            />
        </div>
    );
}

export default ComicBubble;
