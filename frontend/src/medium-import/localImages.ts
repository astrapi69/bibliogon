/**
 * Store Medium article images locally during a browser import (#882).
 *
 * Every image an imported article references is downloaded while the
 * user is importing and kept in the offline article-asset store; the body
 * then points at `/api/articles/{id}/assets/file/{filename}` - the same
 * URL the desktop importer writes, served offline by the service worker.
 * An image that cannot be stored is removed from the body instead of
 * being left on Medium's CDN, where every later view would send the
 * reader's IP address to Medium and break once Medium changes the URL.
 *
 * Only raster types are kept: the files are served from the app's own
 * origin, and an SVG or HTML answer for an image URL named in a crafted
 * archive could carry script there.
 *
 * @example
 * const { urls, assetIds, failed } = await localizeImages(id, post.images, storage.articleAssets);
 * const body = applyImageRewrites(post.contentDoc, urls);
 */

import { articleAssetFileUrl } from "../storage/asset-url";
import type { ImageRef } from "./walker";

/** Raster content types stored from an image download. */
export const ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
]);

const FILENAME_UNSAFE = /[^A-Za-z0-9._-]/g;
const DEFAULT_EXTENSION = ".jpg";
const CONCURRENCY = 4;

/** Minimal slice of the article-asset store this module needs. */
export interface ArticleAssetWriter {
    store(articleId: string, blob: Blob, filename: string, mimeType?: string): Promise<string>;
}

/** Result of a localisation run for one article. */
export interface LocalizedImages {
    /** Original src -> local served URL, for every stored image. */
    urls: Map<string, string>;
    /** Original src -> article-asset id, for every stored image. */
    assetIds: Map<string, string>;
    /** Images that could not be stored, with the reason. */
    failed: { src: string; reason: string }[];
}

/**
 * File name for an image, mirroring the desktop importer's `filename_for`
 * so both importers store the same name: Medium's `data-image-id` when
 * present, else the last URL segment without the query, sanitised, with
 * `.jpg` added when it has no extension.
 */
export function imageFilename(image: ImageRef): string {
    if (image.dataImageId) return image.dataImageId.replace(FILENAME_UNSAFE, "_");
    const lastSegment = image.src.split("/").pop()?.split("?")[0] || "medium-image";
    const safe = lastSegment.replace(FILENAME_UNSAFE, "_");
    return safe.includes(".") ? safe : `${safe}${DEFAULT_EXTENSION}`;
}

function isHttpUrl(src: string): boolean {
    return /^https?:\/\//i.test(src);
}

async function storeOne(
    articleId: string,
    image: ImageRef,
    assets: ArticleAssetWriter,
    fetchImpl: typeof fetch,
): Promise<{ url: string; assetId: string } | { reason: string }> {
    try {
        const response = await fetchImpl(image.src);
        if (!response.ok) return { reason: `HTTP ${response.status}` };
        const type = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.has(type)) {
            return { reason: `content type ${type || "(none)"} is not a raster image` };
        }
        const blob = await response.blob();
        if (blob.size === 0) return { reason: "empty response" };
        const filename = imageFilename(image);
        const assetId = await assets.store(articleId, blob, filename, type);
        return { url: articleAssetFileUrl(articleId, filename), assetId };
    } catch (err) {
        return { reason: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Download every distinct image of an article and store it locally.
 * Never throws: a failing image is reported in `failed`, the rest still
 * get stored. Up to four downloads run at a time.
 */
export async function localizeImages(
    articleId: string,
    images: readonly ImageRef[],
    assets: ArticleAssetWriter,
    fetchImpl: typeof fetch = fetch,
): Promise<LocalizedImages> {
    const result: LocalizedImages = { urls: new Map(), assetIds: new Map(), failed: [] };
    const seen = new Set<string>();
    const queue: ImageRef[] = [];
    for (const image of images) {
        if (!image.src || seen.has(image.src)) continue;
        seen.add(image.src);
        if (!isHttpUrl(image.src)) {
            result.failed.push({ src: image.src, reason: "not an http(s) URL" });
            continue;
        }
        queue.push(image);
    }

    const outcomes = new Map<string, Awaited<ReturnType<typeof storeOne>>>();
    let next = 0;
    const worker = async () => {
        while (next < queue.length) {
            const image = queue[next++];
            outcomes.set(image.src, await storeOne(articleId, image, assets, fetchImpl));
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    for (const image of queue) {
        const outcome = outcomes.get(image.src);
        if (outcome && "url" in outcome) {
            result.urls.set(image.src, outcome.url);
            result.assetIds.set(image.src, outcome.assetId);
        } else {
            result.failed.push({ src: image.src, reason: outcome?.reason ?? "not downloaded" });
        }
    }
    return result;
}

interface DocNode {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: DocNode[];
    [key: string]: unknown;
}

const IMAGE_NODE_TYPES = new Set(["imageFigure", "image"]);

/**
 * Copy of a TipTap doc whose image nodes point at local files only:
 * a src found in `urls` is rewritten, every other image node is removed.
 * The input is not modified.
 */
export function applyImageRewrites<T>(doc: T, urls: ReadonlyMap<string, string>): T {
    const local = new Set(urls.values());
    const walk = (node: DocNode): DocNode => {
        const copy: DocNode = { ...node };
        if (copy.attrs) copy.attrs = { ...copy.attrs };
        if (copy.type && IMAGE_NODE_TYPES.has(copy.type) && copy.attrs) {
            const src = copy.attrs.src;
            if (typeof src === "string" && urls.has(src)) copy.attrs.src = urls.get(src);
        }
        if (Array.isArray(copy.content)) {
            copy.content = copy.content
                .filter((child) => {
                    if (!child?.type || !IMAGE_NODE_TYPES.has(child.type)) return true;
                    const src = child.attrs?.src;
                    return typeof src === "string" && (urls.has(src) || local.has(src));
                })
                .map(walk);
        }
        return copy;
    };
    return walk(doc as DocNode) as T;
}
