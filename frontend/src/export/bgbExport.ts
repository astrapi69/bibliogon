/**
 * Client-side `.bgb` (full-data backup) EXPORT for the offline path (#340).
 *
 * The JSON backup ({@link exportFullBackup}) cannot carry binary data, so every
 * image (book cover, article featured image, …) was lost on backup. A `.bgb`
 * archive is a plain ZIP, and `fflate.zipSync` produces one entirely in the
 * browser — no backend needed — so this exporter embeds the image bytes
 * gathered through the storage seam alongside the JSON entity graph.
 *
 * Archive shape (mirrors the backend `.bgb` so the existing client + backend
 * importers read it, plus a `globals/settings.json` extension the backend's
 * archive does not carry):
 *
 * ```
 * manifest.json                          { format: "bibliogon-backup", … }
 * books/<id>/book.json
 * books/<id>/chapters/<chapterId>.json
 * books/<id>/assets.json                 Asset[] (incl. the cover)
 * books/<id>/assets/<filename>           the image bytes
 * books/<id>/story_entities.json
 * books/<id>/chapter_labels.json
 * articles/<id>/article.json
 * articles/<id>/assets.json              [{ filename, asset_type }] (featured)
 * articles/<id>/assets/<filename>        the image bytes
 * globals/authors.json
 * globals/settings.json                  { settings } (client extension)
 * ```
 *
 * Identical online (API) and offline (Dexie): every read goes through
 * `getStorage()`. Book asset bytes resolve in both modes (api `getBlob`
 * fetches the served file); article featured-image bytes resolve in Dexie via
 * the stored blob and in api mode via a best-effort fetch of
 * `featured_image_url`.
 */

import { strToU8, zipSync } from "fflate";

import type { Article, Asset } from "../api/client";
import { getStorage } from "../storage";
import { buildBackupBundle, type BackupBundleV1 } from "./backupExport";
import { buildSelectiveBundle, type ExportSelection } from "./selectiveExport";

/** Manifest format tag every Bibliogon backup carries (matches the backend). */
export const BGB_FORMAT = "bibliogon-backup";

/**
 * The four phases a `.bgb` export passes through, in order. Surfaced to the
 * user so an image-heavy export (which can take several seconds) shows live
 * progress instead of a frozen button:
 *
 * - `collecting`  — reading the entity graph from the storage seam
 * - `assets`      — loading image blobs (carries `current` / `total` counts)
 * - `archiving`   — `fflate.zipSync`
 * - `finalizing`  — wrapping the zipped bytes into the downloadable Blob
 */
export type BgbProgressStep = "collecting" | "assets" | "archiving" | "finalizing";

/** A single progress update emitted during a `.bgb` export. `current` /
 *  `total` are only set for the `assets` step (the image-load counter). */
export interface BgbProgress {
    step: BgbProgressStep;
    current?: number;
    total?: number;
}

/** Receives {@link BgbProgress} updates while a `.bgb` export runs. */
export type BgbProgressCallback = (progress: BgbProgress) => void;

const MIME_EXT: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "image/bmp": "bmp",
};

/** Read a Blob into a `Uint8Array`, with a FileReader fallback for
 *  environments whose Blob lacks `.arrayBuffer()` (older happy-dom). */
async function blobToU8(blob: Blob): Promise<Uint8Array> {
    if (typeof blob.arrayBuffer === "function") {
        return new Uint8Array(await blob.arrayBuffer());
    }
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
    return new Uint8Array(buffer);
}

/** Best-effort fetch of an article's featured-image bytes across modes:
 *  the stored Dexie blob first (offline), then the served / CDN URL. */
async function articleImageBlob(article: Article): Promise<Blob | null> {
    const assetId = article.featured_image_asset_id;
    if (assetId) {
        const blob = await getStorage().articleAssets.getBlob(assetId);
        if (blob) return blob;
    }
    const url = article.featured_image_url;
    if (url) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.blob();
        } catch {
            // Cross-origin CDN URLs (e.g. Medium) may be blocked; skip silently.
        }
    }
    return null;
}

/** Synthesise a featured-image filename from a blob's MIME type. */
function featuredFilename(blob: Blob): string {
    const ext = MIME_EXT[blob.type] ?? "png";
    return `featured.${ext}`;
}

/**
 * Assemble the ZIP file map for a backup bundle: the JSON entity graph plus
 * the binary image bytes gathered through the seam. Shared by the full and
 * selective exporters — the bundle decides which books/articles are present.
 */
export async function buildBgbFiles(
    bundle: BackupBundleV1,
    onProgress?: BgbProgressCallback,
): Promise<Record<string, Uint8Array>> {
    const storage = getStorage();
    const files: Record<string, Uint8Array> = {};
    let assetCount = 0;

    // First pass: gather book asset metadata (no blob bodies) so the asset
    // total is known before any blob is loaded — that lets the progress
    // counter read "3 / 12" instead of an open-ended spinner.
    const bookAssetMetas = new Map<string, Asset[]>();
    for (const entry of bundle.data.books) {
        bookAssetMetas.set(entry.book.id, await storage.assets.list(entry.book.id));
    }
    const articleImageCandidates = bundle.data.articles.filter(
        (article) => article.featured_image_asset_id || article.featured_image_url,
    );
    let totalAssets = articleImageCandidates.length;
    for (const metas of bookAssetMetas.values()) totalAssets += metas.length;

    let loadedAssets = 0;
    const reportAsset = () =>
        onProgress?.({ step: "assets", current: loadedAssets, total: totalAssets });
    if (totalAssets > 0) reportAsset();

    for (const entry of bundle.data.books) {
        const oldId = entry.book.id;
        const dir = `books/${oldId}/`;
        files[`${dir}book.json`] = strToU8(JSON.stringify(entry.book));
        for (const chapter of entry.chapters) {
            files[`${dir}chapters/${chapter.id}.json`] = strToU8(JSON.stringify(chapter));
        }

        const metas = bookAssetMetas.get(oldId) ?? [];
        const carried: Asset[] = [];
        for (const meta of metas) {
            const blob = await storage.assets.getBlob(oldId, meta.filename);
            loadedAssets++;
            reportAsset();
            if (!blob) continue;
            files[`${dir}assets/${meta.filename}`] = await blobToU8(blob);
            carried.push(meta);
            assetCount++;
        }
        if (carried.length) files[`${dir}assets.json`] = strToU8(JSON.stringify(carried));

        const entities = bundle.data.story_bible.entities.filter((e) => e.book_id === oldId);
        if (entities.length) {
            files[`${dir}story_entities.json`] = strToU8(JSON.stringify(entities));
        }
        const labels = bundle.data.chapter_labels.filter((l) => l.book_id === oldId);
        if (labels.length) {
            files[`${dir}chapter_labels.json`] = strToU8(JSON.stringify(labels));
        }
    }

    for (const article of bundle.data.articles) {
        const dir = `articles/${article.id}/`;
        files[`${dir}article.json`] = strToU8(JSON.stringify(article));
        const isImageCandidate = Boolean(
            article.featured_image_asset_id || article.featured_image_url,
        );
        const blob = await articleImageBlob(article);
        if (isImageCandidate) {
            loadedAssets++;
            reportAsset();
        }
        if (blob) {
            const filename = featuredFilename(blob);
            files[`${dir}assets/${filename}`] = await blobToU8(blob);
            files[`${dir}assets.json`] = strToU8(
                JSON.stringify([{ filename, asset_type: "featured_image" }]),
            );
            assetCount++;
        }
    }

    if (bundle.data.authors.length) {
        files["globals/authors.json"] = strToU8(JSON.stringify(bundle.data.authors));
    }
    if (bundle.data.settings && Object.keys(bundle.data.settings).length > 0) {
        files["globals/settings.json"] = strToU8(JSON.stringify(bundle.data.settings));
    }

    files["manifest.json"] = strToU8(
        JSON.stringify({
            format: BGB_FORMAT,
            version: "3.0",
            client: true,
            created_at: bundle.exported_at,
            app_version: bundle.app_version,
            book_count: bundle.data.books.length,
            article_count: bundle.data.articles.length,
            asset_count: assetCount,
        }),
    );

    return files;
}

/** Zip the assembled file map into a downloadable `.bgb` Blob. */
function zipToBgbBlob(files: Record<string, Uint8Array>): Blob {
    const zipped = zipSync(files);
    const buffer = new ArrayBuffer(zipped.byteLength);
    new Uint8Array(buffer).set(zipped);
    return new Blob([buffer], { type: "application/zip" });
}

/** Download filename for a full `.bgb` backup: ``bibliogon-backup-YYYY-MM-DD.bgb``. */
export function bgbBackupFilename(isoTimestamp: string): string {
    return `bibliogon-backup-${isoTimestamp.slice(0, 10)}.bgb`;
}

/** Download filename for a selective `.bgb` export: ``bibliogon-export-YYYY-MM-DD.bgb``. */
export function selectiveBgbFilename(isoTimestamp: string): string {
    return `bibliogon-export-${isoTimestamp.slice(0, 10)}.bgb`;
}

/**
 * Build the full backup as a downloadable `.bgb` Blob (with image bytes).
 * Works offline (Dexie) and online (API) — same code, same archive.
 */
export async function exportBgbBackup(
    exportedAt: string,
    onProgress?: BgbProgressCallback,
): Promise<Blob> {
    onProgress?.({ step: "collecting" });
    const bundle = await buildBackupBundle(exportedAt);
    const files = await buildBgbFiles(bundle, onProgress);
    onProgress?.({ step: "archiving" });
    const blob = zipToBgbBlob(files);
    onProgress?.({ step: "finalizing" });
    return blob;
}

/**
 * Build a selective `.bgb` export (with image bytes for the selected books /
 * articles). Reads through the same importer path as a full backup.
 */
export async function exportSelectiveBgb(
    selection: ExportSelection,
    exportedAt: string,
    onProgress?: BgbProgressCallback,
): Promise<Blob> {
    onProgress?.({ step: "collecting" });
    const bundle = await buildSelectiveBundle(selection, exportedAt);
    const files = await buildBgbFiles(bundle, onProgress);
    onProgress?.({ step: "archiving" });
    const blob = zipToBgbBlob(files);
    onProgress?.({ step: "finalizing" });
    return blob;
}
