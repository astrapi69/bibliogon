/**
 * Client-side picture-book PDF (#497, Maximal-Offline).
 *
 * Browser counterpart of the backend WeasyPrint picture-book renderer
 * (`plugins/bibliogon-plugin-export/.../picture_book_pdf.py`). The high-
 * fidelity 13-layout backend path stays the default on backend deployments;
 * this engine gives the backendless PWA a usable, downloadable PDF offline:
 * one PDF page per book Page, the page image fit to the trim size, the page
 * text below it.
 *
 * The content walker (`buildPicturebookPdfDefinition`) is pure + framework-
 * free so it is unit-testable; the actual pdfmake render is verified in the
 * browser (E2E), mirroring `formatPdf.ts`. Image bytes are resolved + base64-
 * encoded by the caller (`gatherPicturebookPdf.ts`) so this module stays IO-
 * free.
 *
 * @example
 * const blob = await picturebookToPdfBlob(
 *   [{ imageDataUrl: dataUrl, text: "Once upon a time" }],
 *   "8.5x8.5",
 * );
 */

import { renderPdfDefinition, type PdfDocDefinition } from "../formatPdf";
import { extractPlainText } from "../../lib/utils/pageTextContent";

/** KDP picture-book trim sizes (inches) -> pdfmake point dimensions
 *  (1 in = 72 pt). Kept in sync with `PICTURE_BOOK_FORMATS` in
 *  `components/export/PdfExportControls.tsx`. */
export const PICTUREBOOK_PDF_FORMAT_DIMS: Record<string, [number, number]> = {
  "8.5x8.5": [612, 612],
  "8x10": [576, 720],
  "8.5x11": [612, 792],
  "11x8.5": [792, 612],
  "10x8": [720, 576],
};

const DEFAULT_DIMS: [number, number] = PICTUREBOOK_PDF_FORMAT_DIMS["8.5x8.5"];

/** 0.5 in page margin. */
const MARGIN = 36;

export interface PicturebookPdfPage {
  /** base64 data URL of the page image, if any (resolved by the caller). */
  imageDataUrl?: string | null;
  /**
   * Page text, if any. Accepts either legacy plain text OR a stringified
   * TipTap doc (`Page.text_content` is the latter for the rich text
   * layouts); the builder harvests it to plain text via `extractPlainText`
   * so the raw `{"type":"doc",...}` JSON never reaches the PDF.
   */
  text?: string | null;
}

/** Resolve a trim-size key to its point dimensions (defaults to 8.5x8.5). */
export function picturebookFormatDims(format?: string): [number, number] {
  return (format && PICTUREBOOK_PDF_FORMAT_DIMS[format]) || DEFAULT_DIMS;
}

/**
 * Build a pdfmake document definition for a picture book (pure; testable).
 *
 * One PDF page per `pages` entry. A page with an image fits it to the trim
 * size (centered); a page with text renders it centered below the image (or
 * alone). Empty pages still emit a blank page so pagination matches the book.
 */
export function buildPicturebookPdfDefinition(
  pages: PicturebookPdfPage[],
  format?: string,
): PdfDocDefinition {
  const [width, height] = picturebookFormatDims(format);
  const innerWidth = width - MARGIN * 2;
  const innerHeight = height - MARGIN * 2;
  const content: Record<string, unknown>[] = [];

  pages.forEach((page, index) => {
    const block: Record<string, unknown>[] = [];
    // `Page.text_content` is a stringified TipTap doc for the rich text
    // layouts; harvest it to plain prose so the raw JSON never prints.
    // Legacy plain text passes through unchanged (idempotent).
    const plainText = extractPlainText(page.text).trim();
    const hasText = plainText.length > 0;

    if (page.imageDataUrl) {
      const imageMaxHeight = (hasText ? 0.68 : 0.94) * innerHeight;
      block.push({
        image: page.imageDataUrl,
        fit: [innerWidth, imageMaxHeight],
        alignment: "center",
        margin: [0, 0, 0, hasText ? 10 : 0],
      });
    }
    if (hasText) {
      block.push({
        text: plainText,
        fontSize: 14,
        lineHeight: 1.3,
        alignment: "center",
      });
    }
    if (block.length === 0) {
      block.push({ text: "" });
    }
    if (index > 0) {
      (block[0] as Record<string, unknown>).pageBreak = "before";
    }
    content.push(...block);
  });

  if (content.length === 0) {
    content.push({ text: "" });
  }

  return {
    pageSize: { width, height },
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    content,
  };
}

/** Render a picture-book PDF Blob (lazy pdfmake via the shared renderer). */
export async function picturebookToPdfBlob(
  pages: PicturebookPdfPage[],
  format?: string,
): Promise<Blob> {
  return renderPdfDefinition(buildPicturebookPdfDefinition(pages, format));
}
