/**
 * Picture-Book Layout Expansion Phase 3 C1 (2026-05-28).
 *
 * Collage layout canvas: renders N freely-positioned images +
 * N optional text regions at absolute percentage-based
 * coordinates. M1 rich-JSON storage in
 * ``page.layout_config.collage`` — zero schema migration.
 *
 * C1 ships READ-ONLY rendering — images + text regions display
 * at their stored positions, no interaction yet. C2 adds
 * drag-to-position (extracting a shared useDragPosition hook
 * from the ComicBubble pattern). C3 adds image CRUD + resize +
 * z-index controls. C4 adds text-region CRUD + Tier-Property
 * styling. C5 ships the matching PDF walker branch.
 *
 * Dispatch contract: PageCanvas early-returns ``<CollageCanvas/>``
 * when ``page.layout === "collage"``. The grid-based default
 * canvas does not render for collage pages.
 *
 * Defensive shape-guards: every field in the collage namespace
 * is optional / nullable. Missing/malformed entries silently
 * fall back to sane defaults (e.g. position 0/0, size 30/30,
 * z-index 1, rotation 0, fit cover). The renderer never crashes
 * on a half-typed layout_config from an external tool / earlier
 * version.
 */

import React from "react";
import {Image as ImageIcon} from "lucide-react";
import type {Page} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {readLayoutNamespace} from "../utils/layoutConfig";
import {imageUrlFor} from "../utils/imageUrl";
import styles from "./CollageCanvas.module.css";

interface Props {
    /** The active page. Its ``layout`` MUST be ``"collage"`` —
     *  PageCanvas's dispatch enforces this contract; the body
     *  reads ``page.layout_config.collage`` for the M1 namespace. */
    page: Page;
    /** The owning book's id, used to resolve asset URLs via
     *  ``imageUrlFor`` (same helper PageCanvas's primary image
     *  uses). */
    bookId: string;
}

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

const DEFAULT_IMAGE_WIDTH_PCT = 30;
const DEFAULT_IMAGE_HEIGHT_PCT = 30;
const DEFAULT_TEXT_WIDTH_PCT = 40;
const DEFAULT_TEXT_HEIGHT_PCT = 15;

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

export default function CollageCanvas({page, bookId}: Props) {
    const {t} = useI18n();

    const images = readCollageImages(page.layout_config);
    const textRegions = readCollageTextRegions(page.layout_config);
    const backgroundColor = readCollageBackgroundColor(page.layout_config);
    const isEmpty = images.length === 0 && textRegions.length === 0;

    const canvasStyle: React.CSSProperties = {};
    if (backgroundColor) {
        canvasStyle.background = backgroundColor;
    }

    return (
        <div
            className={styles.canvasWrapper}
            data-testid="page-canvas-wrapper"
        >
            <div
                data-testid="page-canvas-root"
                data-page-id={page.id}
                data-layout="collage"
                data-image-count={images.length}
                data-text-region-count={textRegions.length}
                className={styles.canvas}
                style={canvasStyle}
            >
                {images.map((image, index) => {
                    const wrapperStyle: React.CSSProperties = {
                        left: `${image.x_pct}%`,
                        top: `${image.y_pct}%`,
                        width: `${image.width_pct}%`,
                        height: `${image.height_pct}%`,
                        zIndex: image.z_index,
                    };
                    if (image.rotation_deg !== 0) {
                        wrapperStyle.transform = `rotate(${image.rotation_deg}deg)`;
                    }
                    const imageStyle: React.CSSProperties = {
                        objectFit: image.fit,
                    };
                    return (
                        <div
                            key={`collage-image-${index}`}
                            data-testid={`collage-image-${index}`}
                            data-image-index={index}
                            data-x-pct={image.x_pct}
                            data-y-pct={image.y_pct}
                            data-width-pct={image.width_pct}
                            data-height-pct={image.height_pct}
                            data-z-index={image.z_index}
                            data-rotation-deg={image.rotation_deg}
                            className={styles.imageWrapper}
                            style={wrapperStyle}
                        >
                            {image.asset_id ? (
                                <img
                                    src={imageUrlFor(bookId, image.asset_id)}
                                    alt=""
                                    className={styles.image}
                                    style={imageStyle}
                                    data-testid={`collage-image-img-${index}`}
                                />
                            ) : (
                                <div
                                    className={styles.imagePlaceholder}
                                    data-testid={`collage-image-placeholder-${index}`}
                                >
                                    <ImageIcon size={28} aria-hidden />
                                </div>
                            )}
                        </div>
                    );
                })}
                {textRegions.map((region) => {
                    const style: React.CSSProperties = {
                        left: `${region.x_pct}%`,
                        top: `${region.y_pct}%`,
                        width: `${region.width_pct}%`,
                        height: `${region.height_pct}%`,
                        zIndex: region.z_index,
                    };
                    return (
                        <div
                            key={`collage-text-${region.id}`}
                            data-testid={`collage-text-region-${region.id}`}
                            data-region-id={region.id}
                            data-x-pct={region.x_pct}
                            data-y-pct={region.y_pct}
                            data-z-index={region.z_index}
                            className={styles.textRegion}
                            style={style}
                        >
                            {region.content}
                        </div>
                    );
                })}
                {isEmpty && (
                    <div
                        className={styles.emptyHint}
                        data-testid="collage-empty-hint"
                    >
                        {t(
                            "ui.page_editor.collage.empty_hint",
                            "Leere Collage — füge Bilder und Textbereiche hinzu.",
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
