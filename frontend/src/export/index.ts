/**
 * Client-side export engine — public entry point (Maximal-Offline P2).
 *
 * `downloadExport` is the single call the UI makes: model + format in, a
 * browser download out. No backend, no Pandoc. Books and articles map to the
 * shared `ExportDocument` via the builders re-exported here.
 */

import type { ExportDocument, ExportFormat } from "./documentModel";
import { downloadBlob, downloadText, slugifyFilename } from "./download";
import { toDocxBlob } from "./formatDocx";
import { toEpubBlob } from "./formatEpub";
import { toHtml } from "./formatHtml";
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
};

/** All formats the client-side engine can produce, in display order. */
export const EXPORT_FORMATS: ExportFormat[] = [
  "markdown",
  "html",
  "text",
  "pdf",
  "epub",
  "docx",
];

/** Produce + download `doc` in `format`. Binary formats lazy-load their
 *  (heavy) generator libraries; text formats are synchronous. */
export async function downloadExport(
  doc: ExportDocument,
  format: ExportFormat,
): Promise<void> {
  const spec = FORMAT_SPECS[format];
  const filename = `${slugifyFilename(doc.title)}.${spec.ext}`;

  if (!spec.binary) {
    const payload =
      format === "markdown"
        ? toMarkdown(doc)
        : format === "html"
          ? toHtml(doc)
          : toText(doc);
    downloadText(payload, filename, spec.mime);
    return;
  }

  const blob =
    format === "pdf"
      ? await toPdfBlob(doc)
      : format === "epub"
        ? await toEpubBlob(doc)
        : await toDocxBlob(doc);
  downloadBlob(blob, filename);
}
