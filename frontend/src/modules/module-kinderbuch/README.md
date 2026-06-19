# module-kinderbuch

Frontend offline counterpart of **`bibliogon-plugin-kinderbuch`**.

- **Offline status:** Available (browser-native + storage seam).
- **Implemented:** picture-book authoring — the one-image-per-page layouts
  (image-top-text-bottom, split, overlay, collage, …) — with page CRUD through
  the storage seam (`getStorage()` → Dexie `pages`). The per-layout text/geometry
  styling is computed in the browser: `computeTierTextStyles`,
  `speechBubbleInlineStyle`, `isMultiImageLayout`, `parseTextContentToJson`,
  `serializeJsonToText`.
- **Backed by:** `src/lib/utils/{pageLayoutStyles,pageTextContent}.ts`
  (re-exported) + `src/components/LayoutPicker.tsx` (the picker UI).
- **Gating:** `FEATURES.PICTURE_BOOK` is active in both modes.
- **Missing / desktop-only:** the picture-book PDF render goes through
  plugin-export's Pandoc-adjacent path (`FEATURES.PANDOC_EXPORT`).
