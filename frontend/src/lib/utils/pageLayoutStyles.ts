import type React from "react";
import type { PageLayout } from "../../api/client";

/**
 * Picture-book page layout style/geometry math.
 *
 * Extracted from `PageCanvas.tsx` (Batch 1 god-file burn-down). Pure
 * functions: given a layout config record they derive `React.CSSProperties`
 * inline styles. No React hooks, no storage, no network — just math. The
 * in-editor preview and the printed-PDF walker (Python `picture_book_pdf.py`)
 * mirror each other; these helpers are the TS side of that contract.
 *
 * App-bound (the `PageLayout` union + the picture-book config shape), so
 * this lives under `lib/utils/` rather than the cross-app `shared/`.
 */

/**
 * Read-path shim: `layout_config.bubbles[0]` takes precedence over flat
 * top-level keys (legacy fallback). Mirrors the Python
 * `_read_bubble_config` so in-editor + printed PDF resolve from the same
 * shape.
 */
export function readBubbleConfig(
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!config) return {};
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (k !== "bubbles") flat[k] = v;
  }
  const bubbles = (config as Record<string, unknown>).bubbles;
  const bubblesZero =
    Array.isArray(bubbles) &&
    bubbles.length > 0 &&
    typeof bubbles[0] === "object" &&
    bubbles[0] !== null
      ? (bubbles[0] as Record<string, unknown>)
      : {};
  return { ...flat, ...bubblesZero };
}

/**
 * Parse `#rrggbb` / `rrggbb` to RGB. Returns `null` for any shape we do
 * not recognise so the caller can fall back to a default. Mirrors
 * `_hex_to_rgb` in `picture_book_pdf.py`.
 */
export function hexToRgb(
  hex: unknown,
): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null;
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/**
 * Shared Tier 1 (Visual Style) + Tier 2 (Typography) inline-style
 * derivation. Returns ONLY the Tier subset — callers compose
 * layout-specific background + positioning + sizing on top.
 *
 * Defaults: absent Tier fields leave the CSS-module default in place;
 * only explicit values produce overrides. Border is gated on width > 0
 * AND style != "none"; shadow on the shadow boolean.
 *
 * @example
 * ```ts
 * const style = computeTierTextStyles(readLayoutNamespace(cfg, layout));
 * ```
 */
export function computeTierTextStyles(
  namespace: Record<string, unknown> | null | undefined,
): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (!namespace) return style;

  // Tier 1 — border + radius + shadow + padding.
  const borderColorRgb = hexToRgb(namespace.border_color) ?? { r: 0, g: 0, b: 0 };
  const borderWidthRaw =
    typeof namespace.border_width === "number" ? namespace.border_width : 0;
  const borderWidth = Math.max(0, Math.min(8, borderWidthRaw));
  const borderStyleRaw = namespace.border_style;
  const borderStyle =
    borderStyleRaw === "solid" ||
    borderStyleRaw === "dashed" ||
    borderStyleRaw === "dotted" ||
    borderStyleRaw === "none"
      ? borderStyleRaw
      : "none";
  if (borderWidth > 0 && borderStyle !== "none") {
    style.border = `${borderWidth}px ${borderStyle} rgb(${borderColorRgb.r}, ${borderColorRgb.g}, ${borderColorRgb.b})`;
  }
  const borderRadiusRaw =
    typeof namespace.border_radius === "number" ? namespace.border_radius : 0;
  if (borderRadiusRaw > 0) {
    style.borderRadius = `${Math.max(0, Math.min(50, borderRadiusRaw))}%`;
  }
  const shadowOn =
    typeof namespace.shadow === "boolean" ? namespace.shadow : false;
  if (shadowOn) {
    const shadowIntensityRaw =
      typeof namespace.shadow_intensity === "number"
        ? namespace.shadow_intensity
        : 5;
    const shadowIntensity = Math.max(0, Math.min(10, shadowIntensityRaw));
    style.boxShadow = `0 ${shadowIntensity / 2}px ${shadowIntensity * 2}px rgba(0, 0, 0, 0.3)`;
  }
  const paddingRaw =
    typeof namespace.padding === "number" ? namespace.padding : undefined;
  if (typeof paddingRaw === "number") {
    style.padding = `${Math.max(0, Math.min(32, paddingRaw))}px`;
  }

  // Tier 2 — typography. Each control overrides the CSS-module default
  // by inline specificity; absent values leave the default in place.
  if (
    typeof namespace.font_family === "string" &&
    namespace.font_family.length > 0
  ) {
    style.fontFamily = namespace.font_family;
  }
  if (typeof namespace.font_size === "number") {
    style.fontSize = `${Math.max(10, Math.min(32, namespace.font_size))}pt`;
  }
  if (namespace.font_weight === "bold" || namespace.font_weight === "normal") {
    style.fontWeight = namespace.font_weight;
  }
  if (typeof namespace.italic === "boolean") {
    style.fontStyle = namespace.italic ? "italic" : "normal";
  }
  const textColorRgb = hexToRgb(namespace.text_color);
  if (textColorRgb) {
    style.color = `rgb(${textColorRgb.r}, ${textColorRgb.g}, ${textColorRgb.b})`;
  }
  if (
    namespace.text_align === "left" ||
    namespace.text_align === "center" ||
    namespace.text_align === "right"
  ) {
    style.textAlign = namespace.text_align;
  }
  return style;
}

/**
 * Derive the speech-bubble's position + background-opacity + Tier 1/2
 * inline style from `page.layout_config`. Default (NULL config) is
 * bottom-center + full opacity.
 *
 * @example
 * ```ts
 * const style = speechBubbleInlineStyle(readLayoutNamespace(cfg, "speech_bubble"));
 * ```
 */
export function speechBubbleInlineStyle(
  config: Record<string, unknown> | null,
): React.CSSProperties {
  // Read through bubbles[0] wrapper with flat fallback.
  const merged = readBubbleConfig(config);
  const anchor =
    typeof merged.anchor_position === "string"
      ? merged.anchor_position
      : "bottom-center";
  const rawOpacity = typeof merged.opacity === "number" ? merged.opacity : 1;
  const opacity = Math.max(0.3, Math.min(1, rawOpacity));
  const bgRgb = hexToRgb(merged.background_color) ?? { r: 255, g: 255, b: 255 };
  const bg = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${opacity})`;
  // bubble_width is the canonical width key (legacy `size` fallback);
  // bubble_height is the height knob (default 30%).
  const rawWidth =
    typeof merged.bubble_width === "number"
      ? merged.bubble_width
      : typeof merged.size === "number"
        ? merged.size
        : 40;
  const widthPct = Math.max(20, Math.min(80, rawWidth));
  const width = `${widthPct}%`;
  const rawHeight =
    typeof merged.bubble_height === "number" ? merged.bubble_height : 30;
  const heightPct = Math.max(15, Math.min(60, rawHeight));
  const height = `${heightPct}%`;

  // Tier 1 Visual Style — border + radius + shadow.
  const borderColorRgb = hexToRgb(merged.border_color) ?? { r: 0, g: 0, b: 0 };
  const borderColor = `rgb(${borderColorRgb.r}, ${borderColorRgb.g}, ${borderColorRgb.b})`;
  const borderWidthRaw =
    typeof merged.border_width === "number" ? merged.border_width : 2;
  const borderWidth = Math.max(0, Math.min(8, borderWidthRaw));
  const borderStyleRaw = merged.border_style;
  const borderStyle =
    borderStyleRaw === "solid" ||
    borderStyleRaw === "dashed" ||
    borderStyleRaw === "dotted" ||
    borderStyleRaw === "none"
      ? borderStyleRaw
      : "solid";
  const borderRadiusRaw =
    typeof merged.border_radius === "number" ? merged.border_radius : 50;
  const borderRadius = `${Math.max(0, Math.min(50, borderRadiusRaw))}%`;
  const border = `${borderWidth}px ${borderStyle} ${borderColor}`;

  const shadowOn = typeof merged.shadow === "boolean" ? merged.shadow : true;
  const shadowIntensityRaw =
    typeof merged.shadow_intensity === "number" ? merged.shadow_intensity : 5;
  const shadowIntensity = Math.max(0, Math.min(10, shadowIntensityRaw));
  const boxShadow = shadowOn
    ? `0 ${shadowIntensity / 2}px ${shadowIntensity * 2}px rgba(0, 0, 0, 0.3)`
    : "none";

  // Tier 2 Typography. Defaults mirror picture-book conventions
  // (Atkinson Hyperlegible 14pt normal black centered).
  const fontFamilyRaw = merged.font_family;
  const fontFamily =
    typeof fontFamilyRaw === "string" && fontFamilyRaw.length > 0
      ? fontFamilyRaw
      : "Atkinson Hyperlegible";
  const fontSizeRaw =
    typeof merged.font_size === "number" ? merged.font_size : 14;
  const fontSize = `${Math.max(10, Math.min(32, fontSizeRaw))}pt`;
  const fontWeightRaw = merged.font_weight;
  const fontWeight =
    fontWeightRaw === "bold" || fontWeightRaw === "normal"
      ? fontWeightRaw
      : "normal";
  const italic = typeof merged.italic === "boolean" ? merged.italic : false;
  const fontStyle: "italic" | "normal" = italic ? "italic" : "normal";
  const textColorRgb = hexToRgb(merged.text_color) ?? { r: 0, g: 0, b: 0 };
  const textColor = `rgb(${textColorRgb.r}, ${textColorRgb.g}, ${textColorRgb.b})`;
  const textAlignRaw = merged.text_align;
  const textAlign: "left" | "center" | "right" =
    textAlignRaw === "left" ||
    textAlignRaw === "center" ||
    textAlignRaw === "right"
      ? textAlignRaw
      : "center";

  const paddingRaw = typeof merged.padding === "number" ? merged.padding : 12;
  const paddingPx = Math.max(0, Math.min(32, paddingRaw));
  const padding = `${paddingPx}px`;

  const reset = {
    top: "auto",
    right: "auto",
    bottom: "auto",
    left: "auto",
  } as const;
  const tier1: React.CSSProperties = {
    background: bg,
    width,
    height,
    border,
    borderRadius,
    boxShadow,
    padding,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    color: textColor,
    textAlign,
  };
  switch (anchor) {
    case "top-left":
      return { ...reset, top: 16, left: 16, transform: "none", ...tier1 };
    case "top-center":
      return {
        ...reset,
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        ...tier1,
      };
    case "top-right":
      return { ...reset, top: 16, right: 16, transform: "none", ...tier1 };
    case "middle-left":
      return {
        ...reset,
        top: "50%",
        left: 16,
        transform: "translateY(-50%)",
        ...tier1,
      };
    case "middle-right":
      return {
        ...reset,
        top: "50%",
        right: 16,
        transform: "translateY(-50%)",
        ...tier1,
      };
    case "bottom-left":
      return { ...reset, bottom: 16, left: 16, transform: "none", ...tier1 };
    case "bottom-right":
      return { ...reset, bottom: 16, right: 16, transform: "none", ...tier1 };
    case "center":
      return {
        ...reset,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        ...tier1,
      };
    case "bottom-center":
    default:
      return {
        ...reset,
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        ...tier1,
      };
  }
}

/**
 * Multi-image layouts: the PRIMARY image stays on `Page.image_asset_id`;
 * the SECONDARY image lives in
 * `layout_config[layout].secondary_image_asset_id`.
 */
const MULTI_IMAGE_LAYOUTS = new Set<PageLayout>([
  "two_images_text_center",
  "split_horizontal",
  "split_vertical",
]);

/** Whether `layout` renders a second image region + upload affordance. */
export function isMultiImageLayout(layout: PageLayout): boolean {
  return MULTI_IMAGE_LAYOUTS.has(layout);
}
