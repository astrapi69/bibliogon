/**
 * module-pdf-export — browser-side counterpart of `plugin-export` (PDF format).
 *
 * Offline parity layer (Maximal Offline, #34). The actual implementation lives
 * in the client export engine (`src/export/formatPdf.ts`, backed by `pdfmake`);
 * this barrel is the stable public seam under `modules/` so that consumers can
 * address the offline PDF path by its plugin-parity name. No physical code move
 * — the engine stays the single source of truth; this re-exports it.
 *
 * The high-fidelity Pandoc/LaTeX PDF path is desktop-only and gated separately
 * (`FEATURES.PANDOC_EXPORT`); this browser path is always available offline.
 *
 * @example
 * import { toPdfBlob } from "@/modules/module-pdf-export";
 * const blob = await toPdfBlob(doc);
 */
export { toPdfBlob, docToPdfContent, renderPdfDefinition } from "../../export/formatPdf";
export type { PdfDocDefinition } from "../../export/formatPdf";
