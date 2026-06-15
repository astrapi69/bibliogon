/**
 * Plain-text statistics for the editor status bar (#307).
 *
 * Pure, framework-free: text in, counts out. No React, no app imports, so
 * it can be unit-tested and reused anywhere (editor footer, export preview,
 * quality report). Reading time uses 250 words per minute, the common
 * silent-reading estimate.
 */

/** Words per minute used for the reading-time estimate. */
export const WORDS_PER_MINUTE = 250;

/** Aggregate text statistics. */
export interface TextStats {
  /** Whitespace-separated word count. */
  words: number;
  /** Total character count (spaces included). */
  characters: number;
  /** Character count excluding all whitespace. */
  charactersNoSpaces: number;
  /** Estimated reading time in whole minutes (0 for empty text). */
  readingTimeMinutes: number;
}

/**
 * Compute word, character and reading-time statistics for a plain-text
 * string (e.g. TipTap's `editor.getText()`).
 *
 * @param text - The plain text to analyze.
 * @returns The aggregate {@link TextStats}.
 *
 * @example
 * ```ts
 * getTextStats("Hello world");
 * // { words: 2, characters: 11, charactersNoSpaces: 10, readingTimeMinutes: 1 }
 * ```
 */
export function getTextStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
    readingTimeMinutes: words > 0 ? Math.ceil(words / WORDS_PER_MINUTE) : 0,
  };
}
