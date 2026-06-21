/**
 * module-kinderbuch — browser-side counterpart of `plugin-kinderbuch`.
 *
 * Full offline parity (Maximal Offline, #34). Picture-book authoring — the
 * one-image-per-page layouts (image-top-text-bottom, split, overlay, collage,
 * …) — is pure client-side rendering. Page CRUD goes through the storage seam
 * (`getStorage()` → Dexie `pages` table); the per-layout text/geometry styling
 * is computed in the browser. This barrel re-exports the pure layout helpers
 * (the stable plugin-parity seam under `modules/`); the `LayoutPicker` UI lives
 * at `src/components/LayoutPicker.tsx`.
 *
 * Desktop-only sibling: the picture-book PDF render goes through plugin-export's
 * Pandoc-adjacent path (`FEATURES.PANDOC_EXPORT`).
 *
 * @example
 * import { computeTierTextStyles, isMultiImageLayout } from "@/modules/module-kinderbuch";
 */
export {
    readBubbleConfig,
    hexToRgb,
    computeTierTextStyles,
    speechBubbleInlineStyle,
    isMultiImageLayout,
} from "../../lib/utils/pageLayoutStyles";
export {
    isTipTapLayout,
    parseTextContentToJson,
    serializeJsonToText,
    extractPlainText,
} from "../../lib/utils/pageTextContent";
