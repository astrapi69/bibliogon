# module-epub-export

Frontend offline counterpart of **`bibliogon-plugin-export`** (EPUB format).

- **Offline status:** Available (browser-native, `epub-gen-memory`).
- **Implemented:** `toEpubBlob` assembles one EPUB3 chapter per export section
  and returns an in-memory Blob (no filesystem, no Pandoc).
- **Backed by:** `src/export/formatEpub.ts` (re-exported, not relocated).
- **Missing / desktop-only:** none for the client document model; the Pandoc
  pipeline (`FEATURES.PANDOC_EXPORT`) remains the higher-fidelity desktop option.
