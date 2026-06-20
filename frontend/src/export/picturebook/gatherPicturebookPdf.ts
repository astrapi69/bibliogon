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
 *  bounded on phones (the task's "Base64 zu gross" concern). */
const MAX_IMAGE_DIM = 1600;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Downscale an image Blob to a JPEG data URL no larger than MAX_IMAGE_DIM on
 *  its longest edge. Falls back to the raw bytes if canvas is unavailable. */
async function blobToDownscaledDataUrl(blob: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_IMAGE_DIM ? MAX_IMAGE_DIM / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.82);
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
          imageDataUrl = await blobToDownscaledDataUrl(blob);
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
