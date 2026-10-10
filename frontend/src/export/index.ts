/**
 * Client-side export engine — public entry point (Maximal-Offline P2).
 *
 * `downloadExport` is the single call the UI makes: model + format in, a
 * browser download out. No backend, no Pandoc. Books and articles map to the
 * shared `ExportDocument` via the builders re-exported here.
 */

import type { ExportDocument, ExportFormat } from "./documentModel";
import { downloadBlob, slugifyFilename } from "./download";
import { toDocxBlob } from "./formatDocx";
import { toEpubBlob } from "./formatEpub";
import { toHtml } from "./formatHtml";
import { toLatex } from "./formatLatex";
import { toMarkdown } from "./formatMarkdown";
import { toText } from "./formatText";
import { toPdfBlob } from "./formatPdf";

export type { ExportDocument, ExportFormat } from "./documentModel";
export { buildBookDocument, buildArticleDocument } from "./buildExportDocument";

interface FormatSpec {
  ext: string;
  mime: string;
  /** True when the generator yields a binary Blob (vs a text payload). */
  binary: boolean;
}

const FORMAT_SPECS: Record<ExportFormat, FormatSpec> = {
  markdown: { ext: "md", mime: "text/markdown", binary: false },
  html: { ext: "html", mime: "text/html", binary: false },
  text: { ext: "txt", mime: "text/plain", binary: false },
  pdf: { ext: "pdf", mime: "application/pdf", binary: true },
  epub: { ext: "epub", mime: "application/epub+zip", binary: true },
  docx: {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    binary: true,
  },
  latex: { ext: "tex", mime: "application/x-latex", binary: false },
};

/** All formats the client-side engine can produce, in display order. */
export const EXPORT_FORMATS: ExportFormat[] = [
  "markdown",
  "html",
  "text",
  "pdf",
  "epub",
  "docx",
  "latex",
];

/** One rendered document: the bytes plus how a browser should label them. */
export interface RenderedExport {
  /** The file's bytes, ready for a Blob or a ZIP entry. */
  bytes: Uint8Array;
  /** `<slug>.<ext>`, derived from the document title. */
  filename: string;
  /** Content type, with the charset for the text formats. */
  mime: string;
}

/**
 * Render `doc` in `format` without touching the DOM.
 *
 * Split out of {@link downloadExport} so the bulk path can put the same
 * bytes into a ZIP entry instead of a download (#743). Binary formats
 * lazy-load their (heavy) generator libraries; text formats are
 * synchronous and are encoded as UTF-8 here.
 *
 * @example
 * const { bytes, filename } = await renderExport(doc, "epub");
 */
export async function renderExport(
  doc: ExportDocument,
  format: ExportFormat,
): Promise<RenderedExport> {
  const spec = FORMAT_SPECS[format];
  const filename = `${slugifyFilename(doc.title)}.${spec.ext}`;

  if (!spec.binary) {
    const payload =
      format === "markdown"
        ? toMarkdown(doc)
        : format === "html"
          ? toHtml(doc)
          : format === "latex"
            ? toLatex(doc)
            : toText(doc);
    return {
      bytes: new TextEncoder().encode(payload),
      filename,
      // The charset stays on the text formats: `downloadText` has always
      // sent it, and dropping it here would change what the single-file
      // download produces.
      mime: `${spec.mime};charset=utf-8`,
    };
  }

  const blob =
    format === "pdf"
      ? await toPdfBlob(doc)
      : format === "epub"
        ? await toEpubBlob(doc)
        : await toDocxBlob(doc);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    filename,
    mime: spec.mime,
  };
}

/** Produce + download `doc` in `format`. */
export async function downloadExport(
  doc: ExportDocument,
  format: ExportFormat,
): Promise<void> {
  const { bytes, filename, mime } = await renderExport(doc, format);
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), filename);
}
