# module-medium-import

Frontend offline counterpart of **`bibliogon-plugin-medium-import`**.

- **Offline status:** Available (browser-native).
- **Implemented:** parse a Medium HTML-export ZIP fully in the browser (`fflate`
  unzip + `DOMParser` walker), preview the posts, and import them as Article +
  Publication rows through the storage seam — zero `/api`. `parseMediumPost`,
  `detectLanguage`, `classifyAsComment`, `parseMediumZip`, `importParsed`.
- **Backed by:** `src/medium-import/{clientImport,walker}.ts` (re-exported).
- **Gating:** `FEATURES.MEDIUM_IMPORT` is active in both modes.
- **Missing:** none for the export-ZIP flow. (Medium's export omits incoming
  comments + SEO metadata — a platform limitation, not a Bibliogon gap.)
