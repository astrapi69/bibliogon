/**
 * Sentence-complexity analysis for the quality report's nested-sentence
 * candidates (#283).
 *
 * Pure, framework-free helpers: text in, score out. No React, no storage,
 * no network. The complexity score is a deliberately simple proxy for
 * nesting depth (word count + comma count) so the result stays explainable
 * to authors and cheap to compute on the client.
 */

/** A single sentence scored for split-candidate ranking. */
export interface SentenceComplexity {
  /** Full sentence text (untrimmed of inner whitespace beyond a basic trim). */
  text: string;
  /** Words in the sentence (whitespace split, matching the backend count). */
  wordCount: number;
  /** Comma count, used as a proxy for the number of sub-clauses. */
  clauseCount: number;
  /** Composite complexity score: ``wordCount + clauseCount``. */
  score: number;
}

/**
 * Strip HTML tags and decode the handful of named entities that survive a
 * TipTap-to-HTML round trip, then collapse whitespace.
 *
 * The backend supplies the long-sentence candidate texts with their original
 * inline/block HTML still attached (e.g. ``"…stellt sie.</p> <h2>Was…"``),
 * which leaks raw tags into the on-screen list and the PDF report. Cleaning
 * here keeps both surfaces (and the word/clause counts) tag-free.
 *
 * @param text - Possibly HTML-bearing sentence text.
 * @returns The plain-text content with collapsed whitespace.
 */
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countCommas(text: string): number {
  const matches = text.match(/,/g);
  return matches ? matches.length : 0;
}

/**
 * Score a single sentence.
 *
 * @param text - The sentence text.
 * @returns Word count, comma-based clause count, and the composite score.
 *
 * @example
 * ```ts
 * analyzeSentence("Er ging, weil er musste, schnell nach Hause.")
 * // -> { wordCount: 8, clauseCount: 2, score: 10, text: "..." }
 * ```
 */
export function analyzeSentence(text: string): SentenceComplexity {
  const clean = stripHtml(text);
  const wordCount = countWords(clean);
  const clauseCount = countCommas(clean);
  return {
    text: clean,
    wordCount,
    clauseCount,
    score: wordCount + clauseCount,
  };
}

/**
 * Rank candidate sentences by complexity (descending) and return the top N.
 *
 * Empty/whitespace-only entries are dropped. Ties keep the input order so
 * the result is stable for a given input.
 *
 * @param sentences - Candidate sentence texts.
 * @param limit - Maximum number of candidates to return (default 10).
 * @returns The most complex sentences, highest score first.
 */
export function rankSentences(
  sentences: readonly string[],
  limit = 10,
): SentenceComplexity[] {
  return sentences
    .map(analyzeSentence)
    .filter((s) => s.wordCount > 0)
    .map((s, index) => ({ s, index }))
    .sort((a, b) => b.s.score - a.s.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.s);
}

/**
 * Build a short anchor from the start of a sentence so an author can locate
 * it in the chapter without rendering the whole (long) sentence inline.
 *
 * @param text - The sentence text.
 * @param wordCount - How many leading words to include (default 5).
 * @returns The leading words, with an ellipsis appended when truncated.
 */
export function sentenceAnchor(text: string, wordCount = 5): string {
  const words = stripHtml(text).split(/\s+/).filter(Boolean);
  if (words.length <= wordCount) return words.join(" ");
  return `${words.slice(0, wordCount).join(" ")} …`;
}
