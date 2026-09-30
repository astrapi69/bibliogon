/**
 * module-ms-tools — browser-side counterpart of `plugin-ms-tools`.
 *
 * Offline parity layer (Maximal Offline, #34). The manuscript-quality metrics
 * (word/character counts, reading time, Flesch readability, sentence-complexity
 * / Schachtelsatz ranking) compute entirely client-side from the TipTap JSON,
 * so the quality report works offline. Implementation lives in
 * `src/lib/utils/{chapterMetrics,sentenceComplexity,textStats}.ts` (pure,
 * library-grade); this barrel is the stable plugin-parity seam under `modules/`.
 *
 * The text sanitizer (invisible characters, typographic quotes, whitespace,
 * dashes, ellipsis, Word's HTML debris) mirrors `sanitizer.py` in
 * `src/lib/utils/content/sanitizeText.ts` and runs offline too, so a file
 * imported in the backendless build is cleaned exactly as a desktop import
 * cleans it (#733).
 *
 * Partial parity: the LanguageTool-style style checks the backend plugin
 * performs against a server have no browser counterpart.
 *
 * @example
 * import { computeChapterMetrics, sanitizeText } from "@/modules/module-ms-tools";
 */
export { extractPlainText, computeChapterMetrics } from "../../lib/utils/chapterMetrics";
export {
    stripHtml,
    analyzeSentence,
    rankSentences,
    sentenceAnchor,
} from "../../lib/utils/sentenceComplexity";
export type { SentenceComplexity } from "../../lib/utils/sentenceComplexity";
export { WORDS_PER_MINUTE, getTextStats } from "../../lib/utils/textStats";
export type { TextStats } from "../../lib/utils/textStats";
export {
    sanitizeText,
    sanitizePreview,
    applyToTextNodes,
    looksLikeHtml,
} from "../../lib/utils/content/sanitizeText";
export type {
    SanitizeOptions,
    SanitizeResult,
    SanitizeFixCounts,
    SanitizeDiffLine,
    SanitizePreviewResult,
} from "../../lib/utils/content/sanitizeText";
