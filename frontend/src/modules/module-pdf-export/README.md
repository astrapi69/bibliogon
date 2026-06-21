# module-pdf-export

Frontend offline counterpart of **`bibliogon-plugin-export`** (PDF format).

- **Offline status:** Available (browser-native, `pdfmake`).
- **Implemented:** `toPdfBlob` renders a PDF Blob in the browser from the shared
  `ExportDocument` (headings, paragraphs with bold/italic runs, lists,
  blockquotes). `docToPdfContent` is the pure content walker (unit-tested).
- **Backed by:** `src/export/formatPdf.ts` (re-exported, not relocated).
- **Missing / desktop-only:** the high-fidelity Pandoc/LaTeX PDF pipeline (gated
  `FEATURES.PANDOC_EXPORT`). The browser path trades fidelity for offline
  capability.
