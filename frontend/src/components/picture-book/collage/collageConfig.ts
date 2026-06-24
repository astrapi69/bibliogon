/**
 * Collage layout config: M1 storage shapes + defensive readers.
 *
 * Extracted from CollageCanvas.tsx (god-file split, #207) as a pure
 * structural move. The reader functions normalise the optional
 * ``page.layout_config.collage`` namespace into fully-defaulted shapes so
 * the renderer never crashes on a half-typed config from an external tool
 * or an earlier version.
 */

import {readLayoutNamespace} from "../../../utils/editor/layoutConfig";

/** M1 storage shape — one image entry in the collage namespace's
 *  ``images`` array. Every field except ``asset_id`` is optional;
 *  reads fall back to defaults. */
export interface CollageImage {
    asset_id: string | null;
    x_pct?: number;
    y_pct?: number;
    width_pct?: number;
    height_pct?: number;
    z_index?: number;
    rotation_deg?: number;
    fit?: "contain" | "cover";
}

/** M1 storage shape — one text region in the collage namespace's
 *  ``text_regions`` array. ``content`` may be empty (renders as
 *  a positioned but blank region — pinned by the editor's
 *  resize handle). */
export interface CollageTextRegion {
    id: string;
    x_pct?: number;
    y_pct?: number;
    width_pct?: number;
    height_pct?: number;
    z_index?: number;
    content?: string;
    tier1?: Record<string, unknown>;
    tier2?: Record<string, unknown>;
}

export const DEFAULT_IMAGE_WIDTH_PCT = 30;
export const DEFAULT_IMAGE_HEIGHT_PCT = 30;
export const DEFAULT_TEXT_WIDTH_PCT = 40;
export const DEFAULT_TEXT_HEIGHT_PCT = 15;

function clampPct(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, value));
}

function clampZ(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.round(value);
}

function clampRotation(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    // Normalise to -180..180 so consumers don't need to handle
    // unbounded rotations. WeasyPrint accepts any value but
    // visual parity is cleaner with a bounded range.
    let normalised = value % 360;
    if (normalised > 180) normalised -= 360;
    if (normalised < -180) normalised += 360;
    return normalised;
}

function readImageFit(value: unknown): "contain" | "cover" {
    return value === "contain" ? "contain" : "cover";
}

function readBackgroundColor(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return undefined;
    return value;
}

/** Read the collage namespace's ``images`` array from the page's
 *  layout_config, normalising each entry's optional fields. Empty
 *  / missing / malformed namespaces yield an empty array — the
 *  renderer shows the empty-collage hint. */
export function readCollageImages(
    layoutConfig: Record<string, unknown> | null | undefined,
): CollageImage[] {
    const namespace = readLayoutNamespace(layoutConfig, "collage");
    if (!namespace) return [];
    const raw = namespace.images;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(
            (entry): entry is Record<string, unknown> =>
                entry !== null && typeof entry === "object",
        )
        .map((entry) => ({
            asset_id:
                typeof entry.asset_id === "string"
                    ? entry.asset_id
                    : null,
            x_pct: clampPct(entry.x_pct, 0),
            y_pct: clampPct(entry.y_pct, 0),
            width_pct: clampPct(entry.width_pct, DEFAULT_IMAGE_WIDTH_PCT),
            height_pct: clampPct(entry.height_pct, DEFAULT_IMAGE_HEIGHT_PCT),
            z_index: clampZ(entry.z_index, 1),
            rotation_deg: clampRotation(entry.rotation_deg),
            fit: readImageFit(entry.fit),
        }));
}

/** Read the collage namespace's ``text_regions`` array. Same
 *  shape as ``readCollageImages`` — defensive across every
 *  optional field. */
export function readCollageTextRegions(
    layoutConfig: Record<string, unknown> | null | undefined,
): CollageTextRegion[] {
    const namespace = readLayoutNamespace(layoutConfig, "collage");
    if (!namespace) return [];
    const raw = namespace.text_regions;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(
            (entry): entry is Record<string, unknown> =>
                entry !== null && typeof entry === "object",
        )
        .map((entry, index) => ({
            id: typeof entry.id === "string" ? entry.id : `text-${index}`,
            x_pct: clampPct(entry.x_pct, 0),
            y_pct: clampPct(entry.y_pct, 0),
            width_pct: clampPct(entry.width_pct, DEFAULT_TEXT_WIDTH_PCT),
            height_pct: clampPct(entry.height_pct, DEFAULT_TEXT_HEIGHT_PCT),
            z_index: clampZ(entry.z_index, 1),
            content: typeof entry.content === "string" ? entry.content : "",
            tier1:
                entry.tier1 && typeof entry.tier1 === "object"
                    ? (entry.tier1 as Record<string, unknown>)
                    : undefined,
            tier2:
                entry.tier2 && typeof entry.tier2 === "object"
                    ? (entry.tier2 as Record<string, unknown>)
                    : undefined,
        }));
}

/** Read the collage namespace's optional ``background_color``.
 *  Only accepts ``#rrggbb`` shape — invalid / missing returns
 *  undefined so the CSS module's default tinted background
 *  applies. */
export function readCollageBackgroundColor(
    layoutConfig: Record<string, unknown> | null | undefined,
): string | undefined {
    const namespace = readLayoutNamespace(layoutConfig, "collage");
    if (!namespace) return undefined;
    return readBackgroundColor(namespace.background_color);
}
