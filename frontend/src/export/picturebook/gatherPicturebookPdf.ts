/**
 * Gather + download a picture-book PDF client-side (#497).
 *
 * Reads the book's Pages + offline image bytes through the storage seam
 * (`getStorage()`), downscales large images via canvas to keep mobile memory
 * bounded, builds the PDF with `picturebookToPdfBlob`, and triggers a browser
 * download. IO + canvas live here so `picturebookPdf.ts` stays pure.
 *
 * Only invoked on the backendless/offline path (Dexie mode); backend
 * deployments keep the high-fidelity WeasyPrint export.
 */

import { getStorage } from "../../storage";
import {
  picturebookToPdfBlob,
  type PicturebookPdfPage,
} from "./picturebookPdf";

/** Longest-edge cap (px) for embedded images — keeps base64 + pdfmake memory
 *  bounded on phones (the task's "Base64 zu gross" concern). Images at or
 *  below this on their longest edge are embedded as-is (no re-encode). */
export const MAX_IMAGE_DIM = 1600;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Compute the embed dimensions for an image, preserving aspect ratio.
 *
 * Returns `needsResize: false` when the image already fits within `maxDim`
 * on its longest edge — the caller then embeds the original bytes untouched
 * (full colour + transparency + quality preserved, no lossy re-encode). For
 * larger images the longest edge is capped to `maxDim` and the other edge is
 * scaled by the SAME factor, so the result is never geometrically distorted.
 *
 * @example
 * computeImageTarget(3200, 1600) // -> { width: 1600, height: 800, needsResize: true }
 * computeImageTarget(800, 600)   // -> { width: 800, height: 600, needsResize: false }
 */
export function computeImageTarget(
  naturalWidth: number,
  naturalHeight: number,
  maxDim: number = MAX_IMAGE_DIM,
): { width: number; height: number; needsResize: boolean } {
  const longest = Math.max(naturalWidth, naturalHeight);
  if (longest <= maxDim) {
    return { width: naturalWidth, height: naturalHeight, needsResize: false };
  }
  const scale = maxDim / longest;
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
    needsResize: true,
  };
}

/**
 * Resolve an image Blob to a data URL for embedding in the picture-book PDF.
 *
 * Colour-fidelity fix: an image that already fits within {@link MAX_IMAGE_DIM}
 * is returned as its ORIGINAL bytes — no canvas, no re-encode — so colour,
 * transparency and quality are preserved exactly. A larger image is downscaled
 * through a canvas that is **pre-filled white** before the bitmap is drawn:
 * JPEG carries no alpha channel, so without the white backdrop a transparent
 * PNG composites against black and the illustration prints on a black ground.
 * White matches the picture-book page colour, so the appearance is unchanged
 * while memory stays bounded. Aspect ratio is always preserved (no distortion).
 * Falls back to the raw bytes if the image cannot be decoded or no 2D context
 * is available.
 *
 * @example
 * const dataUrl = await blobToDataUrlForPdf(pngBlob);
 */
export async function blobToDataUrlForPdf(blob: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height, needsResize } = computeImageTarget(
      bitmap.width,
      bitmap.height,
    );
    if (!needsResize) {
      bitmap.close?.();
      return blobToDataUrl(blob);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return blobToDataUrl(blob);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return blobToDataUrl(blob);
  }
}

/** Resolve a book's Pages to PDF-ready entries (image data URL + text). */
export async function gatherPicturebookPdfPages(
  bookId: string,
): Promise<PicturebookPdfPage[]> {
  const storage = getStorage();
  const [pages, assets] = await Promise.all([
    storage.pages.list(bookId),
    storage.assets.list(bookId),
  ]);
  const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));

  const result: PicturebookPdfPage[] = [];
  for (const page of pages) {
    let imageDataUrl: string | null = null;
    if (page.image_asset_id) {
      const filename = filenameById.get(page.image_asset_id);
      if (filename) {
        const blob = await storage.assets.getBlob(bookId, filename);
        if (blob) {
          imageDataUrl = await blobToDataUrlForPdf(blob);
        }
      }
    }
    result.push({ imageDataUrl, text: page.text_content });
  }
  return result;
}

/** Build + download a picture-book PDF entirely client-side. */
export async function downloadPicturebookPdf(
  bookId: string,
  filenameBase: string,
  format?: string,
): Promise<void> {
  const pages = await gatherPicturebookPdfPages(bookId);
  const blob = await picturebookToPdfBlob(pages, format);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameBase || bookId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
