/**
 * Gather + download a comic-book PDF client-side (#742).
 *
 * Reads a book's Pages, their comic panels and each panel's bubbles through
 * the storage seam, resolves the panel images out of IndexedDB, crops them
 * to their cell, builds the PDF with `comicToPdfBlob` and hands the browser
 * a download. IO and canvas live here so `comicPdf.ts` stays pure.
 *
 * Only used on the backendless/offline path; backend deployments keep the
 * plugin's WeasyPrint export.
 */

import { getStorage } from "../../storage";
import {
    COMIC_GRID_GUTTER,
    comicPanelRects,
    resolveComicGridTemplate,
} from "../../lib/comics/comicGrid";
import {
    MAX_IMAGE_DIM,
    blobToDataUrlForPdf,
    computeImageTarget,
} from "../picturebook/gatherPicturebookPdf";
import {
    comicFormatDims,
    comicToPdfBlob,
    type ComicPdfBubble,
    type ComicPdfPage,
    type ComicPdfPanel,
} from "./comicPdf";

/** 0.5 in, matching `comicPdf.ts`'s page margin. */
const MARGIN = 36;

/** How closely an image's aspect has to match its cell before the crop is
 *  skipped. A tenth of a percent is far below one pixel on any cell this
 *  renders, so matching images keep their original bytes. */
const ASPECT_EPSILON = 0.001;

/** The source rectangle and output size for a cover crop. */
export interface CoverCrop {
    sx: number;
    sy: number;
    sWidth: number;
    sHeight: number;
    width: number;
    height: number;
    /** False when the image already matches its cell and fits the cap, so
     *  the caller can embed the original bytes untouched. */
    needsCrop: boolean;
}

/**
 * Centre-crop geometry that makes an image COVER a cell of
 * `targetAspect` (width / height).
 *
 * The editor and the backend walker both draw panel images with
 * `object-fit: cover`. pdfmake's `fit` is `contain` and it cannot clip an
 * image, so the only way to reach cover in a PDF is to redraw the bitmap -
 * which is why this lives next to the canvas instead of in the pure
 * builder.
 *
 * @example
 * coverCropTarget(2000, 1000, 1) // square cell, wide image
 * // -> { sx: 500, sy: 0, sWidth: 1000, sHeight: 1000, ... }
 */
export function coverCropTarget(
    naturalWidth: number,
    naturalHeight: number,
    targetAspect: number,
    maxDim: number = MAX_IMAGE_DIM,
): CoverCrop {
    const safeAspect =
        Number.isFinite(targetAspect) && targetAspect > 0 ? targetAspect : 1;
    const sourceAspect = naturalWidth / naturalHeight;
    let sx = 0;
    let sy = 0;
    let sWidth = naturalWidth;
    let sHeight = naturalHeight;
    if (sourceAspect > safeAspect) {
        // Wider than the cell: keep full height, trim the sides.
        sWidth = naturalHeight * safeAspect;
        sx = (naturalWidth - sWidth) / 2;
    } else if (sourceAspect < safeAspect) {
        // Taller than the cell: keep full width, trim top and bottom.
        sHeight = naturalWidth / safeAspect;
        sy = (naturalHeight - sHeight) / 2;
    }
    const { width, height, needsResize } = computeImageTarget(
        sWidth,
        sHeight,
        maxDim,
    );
    const aspectMatches = Math.abs(sourceAspect - safeAspect) <= ASPECT_EPSILON;
    return {
        sx,
        sy,
        sWidth,
        sHeight,
        width,
        height,
        needsCrop: !aspectMatches || needsResize,
    };
}

/**
 * Resolve an image Blob to a data URL cropped to `targetAspect`.
 *
 * An image that already matches its cell and fits the dimension cap keeps
 * its original bytes - no canvas, no re-encode - so colour and quality are
 * preserved exactly, the same choice `blobToDataUrlForPdf` makes. Anything
 * else is redrawn onto a canvas pre-filled white, because JPEG carries no
 * alpha and a transparent PNG would otherwise composite against black.
 * A decode failure falls back to the uncropped path rather than losing the
 * panel.
 */
export async function blobToCoverDataUrl(
    blob: Blob,
    targetAspect: number,
): Promise<string> {
    try {
        const bitmap = await createImageBitmap(blob);
        const crop = coverCropTarget(bitmap.width, bitmap.height, targetAspect);
        if (!crop.needsCrop) {
            bitmap.close?.();
            return blobToDataUrlForPdf(blob);
        }
        const canvas = document.createElement("canvas");
        canvas.width = crop.width;
        canvas.height = crop.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            bitmap.close?.();
            return blobToDataUrlForPdf(blob);
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, crop.width, crop.height);
        ctx.drawImage(
            bitmap,
            crop.sx,
            crop.sy,
            crop.sWidth,
            crop.sHeight,
            0,
            0,
            crop.width,
            crop.height,
        );
        bitmap.close?.();
        return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
        return blobToDataUrlForPdf(blob);
    }
}

/** Map a stored bubble row onto what the PDF builder reads. */
export function toPdfBubble(row: {
    bubble_type: string;
    anchor: Record<string, unknown>;
    width_pct: number;
    height_pct: number;
    tail_direction: string;
    tail_position_pct: number;
    tail_length_px: number;
    bubble_config: Record<string, unknown> | null;
    text_content: string | null;
}): ComicPdfBubble {
    return {
        bubbleType: row.bubble_type,
        anchor: (row.anchor ?? null) as { x_pct?: number; y_pct?: number } | null,
        widthPct: row.width_pct,
        heightPct: row.height_pct,
        tailDirection: row.tail_direction,
        tailPositionPct: row.tail_position_pct,
        tailLengthPx: row.tail_length_px,
        config: row.bubble_config,
        text: row.text_content,
    };
}

/**
 * Resolve a book's comic Pages to PDF-ready entries.
 *
 * `format` is needed here, not only by the builder: a panel's image is
 * cropped to its cell, and the cell's aspect ratio comes from the trim
 * size and the page's grid template together.
 */
export async function gatherComicPdfPages(
    bookId: string,
    format?: string,
): Promise<ComicPdfPage[]> {
    const storage = getStorage();
    const [pages, assets] = await Promise.all([
        storage.pages.list(bookId),
        storage.assets.list(bookId),
    ]);
    const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
    const [pageWidth, pageHeight] = comicFormatDims(format);
    const box = {
        x: MARGIN,
        y: MARGIN,
        width: pageWidth - MARGIN * 2,
        height: pageHeight - MARGIN * 2,
    };

    const result: ComicPdfPage[] = [];
    for (const page of pages) {
        const template = resolveComicGridTemplate(
            page.layout_config as Record<string, unknown> | null,
        );
        const rects = comicPanelRects(template, box, COMIC_GRID_GUTTER);
        const rows = await storage.comics.listPanels(bookId, page.id);
        const panels: ComicPdfPanel[] = [];
        for (const [index, row] of rows.entries()) {
            const rect = rects[index];
            let imageDataUrl: string | null = null;
            const filename = row.image_asset_id
                ? filenameById.get(row.image_asset_id)
                : undefined;
            if (filename && rect && rect.height > 0) {
                const blob = await storage.assets.getBlob(bookId, filename);
                if (blob) {
                    imageDataUrl = await blobToCoverDataUrl(
                        blob,
                        rect.width / rect.height,
                    );
                }
            }
            const bubbles = await storage.comics.listBubbles(bookId, row.id);
            panels.push({
                imageDataUrl,
                config: row.panel_config,
                bubbles: bubbles.map(toPdfBubble),
            });
        }
        result.push({ template, panels });
    }
    return result;
}

/** Build + download a comic-book PDF entirely client-side. */
export async function downloadComicPdf(
    bookId: string,
    filenameBase: string,
    format?: string,
): Promise<void> {
    const pages = await gatherComicPdfPages(bookId, format);
    const blob = await comicToPdfBlob(pages, format);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filenameBase || bookId}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
