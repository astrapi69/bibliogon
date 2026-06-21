# module-ms-tools

Frontend offline counterpart of **`bibliogon-plugin-ms-tools`**.

- **Offline status:** Partial (metrics yes; server-side style checks no).
- **Implemented:** client-side manuscript metrics — word/character counts,
  reading time, Flesch readability, and sentence-complexity (Schachtelsatz)
  ranking — computed from TipTap JSON. Powers the offline quality report.
- **Backed by:** `src/lib/utils/{chapterMetrics,sentenceComplexity,textStats}.ts`
  (pure, library-grade) + `src/lib/components/{MetricsTable,FleschScale}.tsx`
  (re-exported, not relocated).
- **Missing:** the LanguageTool-style style checks / sanitization the backend
  plugin runs against a server have no browser equivalent.
