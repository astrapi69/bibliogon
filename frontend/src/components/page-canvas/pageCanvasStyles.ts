import React from "react"
import {type Page} from "../../api/client"
import {
    computeTierTextStyles,
    hexToRgb,
} from "../../lib/utils/pageLayoutStyles"

/**
 * PB-PHASE4 god-file split: the per-layout inline-style derivation
 * extracted from PageCanvas. Pure computation — given the page and
 * its already-extracted layout namespace, returns every computed
 * scalar + ``React.CSSProperties`` object the canvas JSX consumes.
 * Moved verbatim from PageCanvas; output is byte-identical.
 */

export interface PageCanvasStyles {
    imagePosition: "left" | "center" | "right"
    imageFit: "contain" | "cover"
    splitRatio: number
    textPosition: "top" | "middle" | "bottom"
    canvasInlineStyle: React.CSSProperties
    regionImageInlineStyle: React.CSSProperties
    imageInlineStyle: React.CSSProperties
    imageLayoutTierStyle: React.CSSProperties
    borderTextStyle: React.CSSProperties
    overlayTextStyle: React.CSSProperties
}

export function computePageCanvasStyles(
    page: Page,
    layoutNamespace: Record<string, unknown> | null,
): PageCanvasStyles {
    // Session 4c Commit 5: image_top_text_bottom +
    // image_left_text_right + image_full_text_overlay configs.
    const layoutConfig = layoutNamespace ?? {}
    const imagePosition =
        typeof layoutConfig.image_position === "string" &&
        ["left", "center", "right"].includes(layoutConfig.image_position as string)
            ? (layoutConfig.image_position as "left" | "center" | "right")
            : "center"
    const imageFit =
        typeof layoutConfig.image_fit === "string" &&
        ["contain", "cover"].includes(layoutConfig.image_fit as string)
            ? (layoutConfig.image_fit as "contain" | "cover")
            : page.layout === "speech_bubble"
              ? "cover"
              : "contain"
    const splitRatio =
        typeof layoutConfig.split_ratio === "number"
            ? Math.max(50, Math.min(70, layoutConfig.split_ratio as number))
            : 60
    const textPosition =
        typeof layoutConfig.text_position === "string" &&
        ["top", "middle", "bottom"].includes(layoutConfig.text_position as string)
            ? (layoutConfig.text_position as "top" | "middle" | "bottom")
            : "bottom"
    const textBackdropOpacity =
        typeof layoutConfig.text_backdrop_opacity === "number"
            ? Math.max(0.3, Math.min(0.8, layoutConfig.text_backdrop_opacity as number))
            : 0.45

    // Compute the inline style for non-speech-bubble layouts.
    const canvasInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_left_text_right") {
        canvasInlineStyle.gridTemplateColumns = `${splitRatio}% ${100 - splitRatio}%`
    } else if (page.layout === "image_right_text_left") {
        // Mirror: text column on the LEFT, image column on the
        // RIGHT. Split ratio is the IMAGE percentage (same field
        // name as the parent layout for storage compatibility);
        // emit ``text% image%`` so the columns sum to 100 with
        // image on the right.
        canvasInlineStyle.gridTemplateColumns = `${100 - splitRatio}% ${splitRatio}%`
    }
    const regionImageInlineStyle: React.CSSProperties = {}
    if (
        page.layout === "image_top_text_bottom" ||
        page.layout === "image_bottom_text_top"
    ) {
        if (imagePosition === "left") regionImageInlineStyle.justifyContent = "flex-start"
        else if (imagePosition === "right") regionImageInlineStyle.justifyContent = "flex-end"
        else regionImageInlineStyle.justifyContent = "center"
    }
    const imageInlineStyle: React.CSSProperties = {}
    if (
        page.layout === "image_top_text_bottom" ||
        page.layout === "image_left_text_right" ||
        page.layout === "image_bottom_text_top" ||
        page.layout === "image_right_text_left" ||
        page.layout === "image_full_no_text" ||
        // Phase 2 C5 (2026-05-28): image_border_text_center renders
        // the primary image full-bleed; image_fit lets authors pick
        // contain vs cover for the frame visual.
        page.layout === "image_border_text_center"
    ) {
        imageInlineStyle.objectFit = imageFit
    }
    // PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 2 C1: shared
    // Tier 1+2 style derivation across image_full_text_overlay,
    // image_top_text_bottom, image_left_text_right. The same 14
    // Tier fields produce equivalent inline-style overrides
    // regardless of which text container they live in; the
    // helper returns ONLY the Tier subset (no positioning, no
    // background composition — those are layout-specific and
    // composed by the caller). 3-surface RCU threshold satisfied
    // (the 2-surface threshold was satisfied in Session 1 C5
    // when overlay joined speech_bubble; image_top + image_left
    // are sites 3 + 4 of the same conceptual style derivation).
    const imageLayoutTierStyle: React.CSSProperties =
        page.layout === "image_top_text_bottom" ||
        page.layout === "image_left_text_right" ||
        page.layout === "image_bottom_text_top" ||
        page.layout === "image_right_text_left"
            ? computeTierTextStyles(layoutNamespace)
            : {}

    // Phase 2 C5 (2026-05-28): image_border_text_center text panel
    // style. CSS module class handles the absolute positioning +
    // default backdrop; this block lets the user tune
    // text_backdrop_opacity + composes the Tier 1+2 inline styles
    // on top. Background composition mirrors image_full_text_overlay:
    // hex background_color × text_backdrop_opacity slider (default
    // black × 0.5 to match the CSS module fallback).
    const borderTextStyle: React.CSSProperties = {}
    if (page.layout === "image_border_text_center") {
        const tierConfig = layoutConfig as Record<string, unknown>
        const bgRgb =
            hexToRgb(tierConfig.background_color) ?? {r: 0, g: 0, b: 0}
        // Default 0.5 matches the CSS module rgba(0,0,0,0.5).
        const opacity =
            typeof tierConfig.text_backdrop_opacity === "number"
                ? Math.max(
                      0.3,
                      Math.min(0.8, tierConfig.text_backdrop_opacity),
                  )
                : 0.5
        borderTextStyle.background = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${opacity})`
        // Tier 1+2 (color, font, weight, etc.) overlay on top.
        Object.assign(borderTextStyle, computeTierTextStyles(tierConfig))
    }

    const overlayTextStyle: React.CSSProperties = {}
    if (page.layout === "image_full_text_overlay") {
        // PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 +
        // PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C5: read
        // Tier 1+2 Visual-Style + Typography from the overlay
        // namespace and emit per-field overrides. Defaults match
        // the pre-C5 hardcoded styling so legacy pages render
        // identically (background dark #000 + 0.45 opacity, no
        // border, no shadow, no custom font / weight / color /
        // align, padding inherited from CSS module).
        const tierConfig = layoutConfig as Record<string, unknown>

        // Background composition: hex background_color × the
        // existing text_backdrop_opacity slider. Default
        // background_color is #000000 (black) so legacy pages
        // behave identically; setting any color (e.g. #FFC857 sunny)
        // tints the overlay backdrop without losing the opacity
        // dimension.
        const bgRgb = hexToRgb(tierConfig.background_color) ?? {r: 0, g: 0, b: 0}
        overlayTextStyle.background = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${textBackdropOpacity})`

        // Session 2 C1: Tier 1+2 derivation extracted into
        // computeTierTextStyles. Merge the Tier subset on top of
        // the overlay-specific background; positioning + width/
        // height follow below.
        Object.assign(overlayTextStyle, computeTierTextStyles(tierConfig))

        // C7 Bug D scope-add: text_container_width +
        // text_container_height sliders override the
        // position-derived dimensions. Width defaults to 100%
        // (full); height defaults to position-derived
        // (middle → max-height 70%; top/bottom → auto).
        const textContainerWidthRaw = tierConfig.text_container_width
        if (typeof textContainerWidthRaw === "number") {
            const widthPct = Math.max(
                30,
                Math.min(100, textContainerWidthRaw),
            )
            // Override the full-width default by computing left
            // offsets per the alignment (centered horizontally).
            const sideOffset = (100 - widthPct) / 2
            overlayTextStyle.left = `${sideOffset}%`
            overlayTextStyle.right = `${sideOffset}%`
        } else {
            overlayTextStyle.left = 0
            overlayTextStyle.right = 0
        }
        const textContainerHeightRaw = tierConfig.text_container_height
        const hasHeightOverride =
            typeof textContainerHeightRaw === "number"
        const heightPct = hasHeightOverride
            ? Math.max(15, Math.min(100, textContainerHeightRaw))
            : null

        // Positioning (unchanged from pre-C5). Use individual
        // properties (not `inset` shorthand) so the serialized
        // inline style is testable in jsdom.
        if (textPosition === "top") {
            overlayTextStyle.top = 0
            overlayTextStyle.bottom = "auto"
            if (heightPct !== null) overlayTextStyle.maxHeight = `${heightPct}%`
        } else if (textPosition === "middle") {
            overlayTextStyle.top = "50%"
            overlayTextStyle.bottom = "auto"
            overlayTextStyle.transform = "translateY(-50%)"
            overlayTextStyle.maxHeight =
                heightPct !== null ? `${heightPct}%` : "70%"
        } else {
            overlayTextStyle.top = "auto"
            overlayTextStyle.bottom = 0
            if (heightPct !== null) overlayTextStyle.maxHeight = `${heightPct}%`
        }
    }

    return {
        imagePosition,
        imageFit,
        splitRatio,
        textPosition,
        canvasInlineStyle,
        regionImageInlineStyle,
        imageInlineStyle,
        imageLayoutTierStyle,
        borderTextStyle,
        overlayTextStyle,
    }
}
