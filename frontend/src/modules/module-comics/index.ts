/**
 * module-comics — browser-side counterpart of `plugin-comics`.
 *
 * Full offline parity (Maximal Offline, #34). Comic-book authoring — multi-panel
 * grids and per-panel speech bubbles — runs entirely client-side: CRUD goes
 * through the storage seam (`getStorage()` → Dexie `comicPanels` /
 * `comicBubbles` tables), and the bubble/tail geometry + styling is pure
 * browser code. This barrel re-exports the pure rendering helpers (the stable
 * plugin-parity seam under `modules/`); the editor components live under
 * `src/components/comics/` and persistence under `src/storage/dexie/comics.ts`.
 *
 * Desktop-only sibling: comic-book PDF rendering goes through plugin-export's
 * Pandoc-adjacent path (`FEATURES.PANDOC_EXPORT`); the browser PDF engine
 * covers the prose/picture-book document model, not the comic panel grid.
 *
 * @example
 * import { buildBubblePath } from "@/modules/module-comics";
 */
export { buildBubblePath } from "../../components/comics/bubblePath";
export type { BubbleShape, BubblePathInput, BubblePathOutput } from "../../components/comics/bubblePath";
export { bubbleTypeClassName } from "../../components/comics/bubbleTypeStyle";
export type { BubbleType } from "../../components/comics/bubbleTypeStyle";
export { computeVisibleTipPosition, deriveTailFromTip } from "../../components/comics/tailDerivation";
export type { CompassDirection } from "../../components/comics/tailDerivation";
