/**
 * Pure style derivation for a ComicBubble: the text-overlay CSS and the
 * SVG path visual attributes (fill / stroke / width / dasharray) from the
 * bubble type + its optional ``bubble_config`` overrides. Extracted from
 * ComicBubble.tsx (#681).
 */

import type {CSSProperties} from "react";

// The config readers and the SVG visual attributes live in
// ``lib/comics/bubbleStyle.ts`` so the comic PDF engine can use them
// without React; re-exported here for this module's existing callers.
export {
    buildBubbleVisualAttrs,
    readBubbleTextConfig,
    type BubbleTextConfig,
    type BubbleVisualAttrs,
} from "../../../lib/comics/bubbleStyle";
import {readBubbleTextConfig} from "../../../lib/comics/bubbleStyle";

/** Build the text-overlay style, layering Tier-1 ``bubble_config``
 *  typography overrides on top of the walker-matching defaults. */
export function buildTextOverlayStyle(
    config: Record<string, unknown>,
): CSSProperties {
    const read = readBubbleTextConfig(config);
    const textOverlayStyle: CSSProperties = {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: read.textAlign,
        padding: read.padding === undefined ? "4px 8px" : `${read.padding}px`,
        boxSizing: "border-box",
        pointerEvents: "none",
        color: read.color,
    };
    if (read.opacity !== undefined) textOverlayStyle.opacity = read.opacity;
    if (read.fontFamily !== undefined) textOverlayStyle.fontFamily = read.fontFamily;
    if (read.fontSize !== undefined) textOverlayStyle.fontSize = `${read.fontSize}pt`;
    if (read.fontWeight !== undefined) textOverlayStyle.fontWeight = read.fontWeight;
    if (read.italic) textOverlayStyle.fontStyle = "italic";
    return textOverlayStyle;
}
