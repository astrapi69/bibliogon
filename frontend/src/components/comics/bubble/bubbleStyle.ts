/**
 * Pure style derivation for a ComicBubble: the text-overlay CSS and the
 * SVG path visual attributes (fill / stroke / width / dasharray) from the
 * bubble type + its optional ``bubble_config`` overrides. Extracted from
 * ComicBubble.tsx (#681).
 */

import type {CSSProperties} from "react";

/** Build the text-overlay style, layering Tier-1 ``bubble_config``
 *  typography overrides on top of the walker-matching defaults. */
export function buildTextOverlayStyle(
    config: Record<string, unknown>,
): CSSProperties {
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
    return textOverlayStyle;
}

export interface BubbleVisualAttrs {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    strokeDasharray: string | undefined;
}

/** Resolve the SVG path fill/stroke attributes. Default visual
 *  attributes per bubble type match the values that used to live in
 *  ``bubble-types.module.css`` (moved onto the single SVG path); the
 *  optional ``bubble_config`` overrides layer on top. */
export function buildBubbleVisualAttrs(
    bubbleType: string,
    config: Record<string, unknown>,
): BubbleVisualAttrs {
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
    return {fillColor, strokeColor, strokeWidth, strokeDasharray};
}
