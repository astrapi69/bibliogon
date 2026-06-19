# module-docx-export

Frontend offline counterpart of **`bibliogon-plugin-export`** (DOCX format).

- **Offline status:** Available (browser-native, `docx`).
- **Implemented:** `toDocxBlob` walks the export model into docx
  Paragraphs/TextRuns and packs a `.docx` Blob in the browser (`Packer.toBlob`).
- **Backed by:** `src/export/formatDocx.ts` (re-exported, not relocated).
- **Missing / desktop-only:** the Pandoc pipeline (`FEATURES.PANDOC_EXPORT`)
  for higher-fidelity Word output.
