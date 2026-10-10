/**
 * Pure style derivation for a comic bubble: the typography its
 * ``bubble_config`` asks for, and the SVG path's fill / stroke attributes.
 *
 * In ``lib/comics/`` rather than beside the component because both the
 * editor overlay and the client-side comic PDF read them (#742), and the
 * PDF engine must stay free of React. ``buildTextOverlayStyle`` stays with
 * the component: it returns ``CSSProperties``, which is React's type and
 * meaningless to pdfmake.
 */

/**
 * The typography a bubble's ``bubble_config`` asks for, as plain values.
 *
 * Split out of ``buildTextOverlayStyle`` for the client-side comic PDF
 * (#742), which needs the same reads but cannot use CSS: pdfmake wants
 * ``fontSize`` / ``bold`` / ``italics`` / ``alignment``, not a style
 * object. Both renderers now read the config here, so a new Tier-1 key
 * cannot reach the canvas and miss the PDF.
 *
 * NOT the same thing as ``bubbleConfigReads.ts``, and deliberately so.
 * Those readers serve the Tier-1 FORM: they clamp to the slider ranges
 * and substitute a default for every absent key, because a control has
 * to show a value. These serve the RENDERERS: an absent key stays
 * absent, so a bubble with no stored ``font_size`` inherits the
 * surrounding type rather than being pinned to the form's 14pt. Folding
 * the two together would restyle every bubble that never had an explicit
 * value.
 *
 * ``padding`` stays optional for the same reason, with an extra wrinkle:
 * the CSS default is the asymmetric pair ``4px 8px``, which no single
 * number expresses, so a caller without an override picks its own.
 */
export interface BubbleTextConfig {
    opacity?: number;
    padding?: number;
    fontFamily?: string;
    /** Points, as authored. */
    fontSize?: number;
    fontWeight?: string;
    color: string;
    textAlign: "left" | "center" | "right";
    italic: boolean;
}

export function readBubbleTextConfig(
    config: Record<string, unknown>,
): BubbleTextConfig {
    const align = config.text_align;
    return {
        opacity: typeof config.opacity === "number" ? config.opacity : undefined,
        padding: typeof config.padding === "number" ? config.padding : undefined,
        fontFamily:
            typeof config.font_family === "string" ? config.font_family : undefined,
        fontSize: typeof config.font_size === "number" ? config.font_size : undefined,
        fontWeight:
            typeof config.font_weight === "string" ? config.font_weight : undefined,
        // Explicit black default, mirroring the walker's ``color: black``.
        // Without it the overlay inherits the editor canvas's muted
        // ``--text-sidebar``, which reads as faded against a white bubble.
        color: typeof config.text_color === "string" ? config.text_color : "black",
        textAlign:
            align === "left" || align === "center" || align === "right"
                ? align
                : "center",
        italic: config.italic === true,
    };
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
