# module-comics

Frontend offline counterpart of **`bibliogon-plugin-comics`**.

- **Offline status:** Available (browser-native + storage seam).
- **Implemented:** comic-book authoring — multi-panel grids and per-panel speech
  bubbles — with client-side CRUD through the storage seam (`getStorage()` →
  Dexie `comicPanels` / `comicBubbles`). The bubble/tail geometry + styling is
  pure browser code: `buildBubblePath`, `bubbleTypeClassName`,
  `computeVisibleTipPosition`, `deriveTailFromTip`.
- **Backed by:** `src/components/comics/*` (editor + the re-exported pure
  helpers) + `src/storage/dexie/comics.ts` (persistence).
- **Gating:** `FEATURES.COMICS` is active in both modes.
- **Missing / desktop-only:** comic-panel-grid PDF rendering goes through
  plugin-export's Pandoc-adjacent path (`FEATURES.PANDOC_EXPORT`); the browser
  PDF engine covers the prose/picture-book model, not the comic grid.
