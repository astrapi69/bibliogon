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
 * The editor's inline style check - filler words, passive voice, long
 * sentences, repetitions, adverbs, adjectives, redundant phrases - mirrors
 * `style_checker.py` in `src/lib/utils/msTools/styleFindings.ts`, including
 * the offsets the decorations need, so the toolbar button works offline
 * instead of being hidden (#733). Behaviour is pinned against output
 * recorded from the Python checker itself.
 *
 * Not in the browser: the user allowlist YAML (no browser equivalent, ships
 * empty), and the `/sanitize`, `/readability`, `/languages` and
 * `/metrics/export` endpoints - none of which has ever had a frontend
 * caller, in either mode.
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
export { checkStyle } from "../../lib/utils/msTools/styleFindings";
export type {
    StyleCheckOptions,
    StyleCheckResult,
    StyleFinding,
    StyleFindingMessage,
} from "../../lib/utils/msTools/styleFindings";
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
