/**
 * Shared bubble-config reads + constants for Tier-1 / Tier-2
 * per-bubble properties.
 *
 * Comics-Session-2 C5 — Recurring-Component-Unification canonical
 * 2-site extraction. Picture-book single-bubble
 * (``LayoutConfigSpeechBubble``) AND comic-book multi-bubble
 * (``LayoutConfigComicBubble``) share the same per-bubble schema:
 * field-name parity is documented at the walker
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``.
 *
 * The reads use the gamma-shim default-on-read pattern: malformed
 * or absent fields fall back to the safe default.
 *
 * ``readBubbleConfig`` honours the Inclusive-on-write, flat-
 * fallback-on-read convention (per Q1 γ): persisted fields live
 * under ``layout_config.bubbles[0]``; flat top-level keys are
 * accepted as a legacy fallback so pages authored before C1
 * continue to render. Read precedence: ``bubbles[0].X`` overrides
 * flat ``X``; write-path always writes to ``bubbles[0]`` so the
 * flat shape fades out naturally.
 */

import {
    PICTURE_BOOK_FONTS,
    DEFAULT_PICTURE_BOOK_FONT_ID,
} from "../../data/picture-book-fonts";

// --- Tier 1 constants (Visual Style) ---

export const BORDER_WIDTH_MIN = 0;
export const BORDER_WIDTH_MAX = 8;
export const BORDER_WIDTH_STEP = 1;
export const DEFAULT_BORDER_WIDTH = 2;

export const BORDER_RADIUS_MIN = 0;
export const BORDER_RADIUS_MAX = 50;
export const BORDER_RADIUS_STEP = 5;
export const DEFAULT_BORDER_RADIUS = 50;

export const SHADOW_INTENSITY_MIN = 0;
export const SHADOW_INTENSITY_MAX = 10;
export const SHADOW_INTENSITY_STEP = 1;
export const DEFAULT_SHADOW_INTENSITY = 5;

export const PADDING_MIN = 0;
export const PADDING_MAX = 32;
export const PADDING_STEP = 1;
export const DEFAULT_PADDING = 12;

export const DEFAULT_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_BORDER_COLOR = "#000000";

export type BorderStyle = "solid" | "dashed" | "dotted" | "none";
export const BORDER_STYLES: readonly BorderStyle[] = [
    "solid",
    "dashed",
    "dotted",
    "none",
];
export const DEFAULT_BORDER_STYLE: BorderStyle = "solid";
export const DEFAULT_SHADOW = true;

// --- Tier 2 constants (Typography) ---

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 32;
export const FONT_SIZE_STEP = 1;
export const DEFAULT_FONT_SIZE = 14;

export type FontWeight = "normal" | "bold";
export const FONT_WEIGHTS: readonly FontWeight[] = ["normal", "bold"];
export const DEFAULT_FONT_WEIGHT: FontWeight = "normal";

export type TextAlign = "left" | "center" | "right";
export const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"];
export const DEFAULT_TEXT_ALIGN: TextAlign = "center";

export const DEFAULT_TEXT_COLOR = "#000000";
export const DEFAULT_ITALIC = false;

// --- Shared helpers ---

/**
 * Read precedence: ``bubbles[0].X`` overrides flat ``X``.
 * write-path always writes to ``bubbles[0]``.
 */
export function readBubbleConfig(
    config: Record<string, unknown> | null,
): Record<string, unknown> {
    if (!config) return {};
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
        if (k !== "bubbles") flat[k] = v;
    }
    const bubbles = config.bubbles;
    const bubblesZero =
        Array.isArray(bubbles) &&
        bubbles.length > 0 &&
        typeof bubbles[0] === "object" &&
        bubbles[0] !== null
            ? (bubbles[0] as Record<string, unknown>)
            : {};
    return {...flat, ...bubblesZero};
}

/** Hex colors only (``#rrggbb`` or ``rrggbb``). */
export function readHexColor(
    config: Record<string, unknown> | null,
    key: string,
    fallback: string,
): string {
    const value = readBubbleConfig(config)[key];
    if (
        typeof value === "string" &&
        /^#?[a-fA-F0-9]{6}$/.test(value.trim())
    ) {
        const trimmed = value.trim();
        return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    }
    return fallback;
}

// --- Tier 1 reads ---

export function readBorderWidth(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).border_width;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(BORDER_WIDTH_MIN, Math.min(BORDER_WIDTH_MAX, value));
    }
    return DEFAULT_BORDER_WIDTH;
}

export function readBorderStyle(
    config: Record<string, unknown> | null,
): BorderStyle {
    const value = readBubbleConfig(config).border_style;
    if (
        typeof value === "string" &&
        (BORDER_STYLES as readonly string[]).includes(value)
    ) {
        return value as BorderStyle;
    }
    return DEFAULT_BORDER_STYLE;
}

export function readBorderRadius(
    config: Record<string, unknown> | null,
): number {
    const value = readBubbleConfig(config).border_radius;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            BORDER_RADIUS_MIN,
            Math.min(BORDER_RADIUS_MAX, value),
        );
    }
    return DEFAULT_BORDER_RADIUS;
}

export function readShadow(config: Record<string, unknown> | null): boolean {
    const value = readBubbleConfig(config).shadow;
    if (typeof value === "boolean") return value;
    return DEFAULT_SHADOW;
}

export function readShadowIntensity(
    config: Record<string, unknown> | null,
): number {
    const value = readBubbleConfig(config).shadow_intensity;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(
            SHADOW_INTENSITY_MIN,
            Math.min(SHADOW_INTENSITY_MAX, value),
        );
    }
    return DEFAULT_SHADOW_INTENSITY;
}

export function readPadding(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).padding;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(PADDING_MIN, Math.min(PADDING_MAX, value));
    }
    return DEFAULT_PADDING;
}

// --- Tier 2 reads ---

export function readFontFamily(config: Record<string, unknown> | null): string {
    const value = readBubbleConfig(config).font_family;
    if (
        typeof value === "string" &&
        PICTURE_BOOK_FONTS.some((f) => f.id === value)
    ) {
        return value;
    }
    return DEFAULT_PICTURE_BOOK_FONT_ID;
}

export function readFontSize(config: Record<string, unknown> | null): number {
    const value = readBubbleConfig(config).font_size;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
    }
    return DEFAULT_FONT_SIZE;
}

export function readFontWeight(
    config: Record<string, unknown> | null,
): FontWeight {
    const value = readBubbleConfig(config).font_weight;
    if (
        typeof value === "string" &&
        (FONT_WEIGHTS as readonly string[]).includes(value)
    ) {
        return value as FontWeight;
    }
    return DEFAULT_FONT_WEIGHT;
}

export function readTextAlign(
    config: Record<string, unknown> | null,
): TextAlign {
    const value = readBubbleConfig(config).text_align;
    if (
        typeof value === "string" &&
        (TEXT_ALIGNS as readonly string[]).includes(value)
    ) {
        return value as TextAlign;
    }
    return DEFAULT_TEXT_ALIGN;
}

export function readItalic(config: Record<string, unknown> | null): boolean {
    const value = readBubbleConfig(config).italic;
    if (typeof value === "boolean") return value;
    return DEFAULT_ITALIC;
}
