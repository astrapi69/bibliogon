/**
 * Chapter AI-review prompts (offline AI, #450 / #34).
 *
 * Builds the system + user chat messages for a full-chapter review so the
 * browser-direct offline path produces a structured review without the
 * backend's async SSE pipeline. Online the backend route still owns the
 * streaming review; offline this is a single completion that returns the
 * review markdown directly.
 *
 * @example
 * const messages = buildReviewMessages({
 *   focus: "style",
 *   chapterText,
 *   chapterTitle,
 *   bookTitle,
 *   genre,
 *   language: "de",
 * });
 */

import type { AiChatMessage } from "./llmClient";

/** The review lenses offered in the editor's review panel. */
export type ReviewFocus = "style" | "consistency" | "beta_reader";

/** ISO 639-1 -> English language name (mirrors the other prompt builders). */
const LANG_NAMES: Record<string, string> = {
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    el: "Greek",
    pt: "Portuguese",
    tr: "Turkish",
    ja: "Japanese",
};

/** Per-focus instruction appended to the shared review system prompt. */
const FOCUS_INSTRUCTIONS: Record<ReviewFocus, string> = {
    style:
        "Focus on prose style: sentence rhythm and variety, word choice, " +
        "filler words, clarity, show-don't-tell, and pacing.",
    consistency:
        "Focus on internal consistency: character voice, tense, point of view, " +
        "timeline, names, and factual continuity within the chapter.",
    beta_reader:
        "Respond as an engaged beta reader: what worked, what confused you, " +
        "where attention dipped, and the emotional impact of key moments.",
};

/**
 * Build the [system, user] chat messages for a chapter review. The model is
 * asked to answer in the book's language and to return readable Markdown
 * (headings + bullet points), matching what the review panel renders.
 */
export function buildReviewMessages(args: {
    focus: ReviewFocus;
    chapterText: string;
    chapterTitle?: string;
    bookTitle?: string;
    genre?: string;
    language: string;
}): AiChatMessage[] {
    const language = LANG_NAMES[args.language] ?? args.language;
    const system = [
        "You are an experienced editor reviewing a single book chapter.",
        FOCUS_INSTRUCTIONS[args.focus],
        "",
        "Rules:",
        "- Write the entire review in " + language + ".",
        "- Return Markdown: short section headings and bullet points.",
        "- Be specific and actionable; quote short phrases from the text when useful.",
        "- Do not rewrite the chapter; give feedback the author can act on.",
    ].join("\n");

    const parts: string[] = [];
    if (args.bookTitle) parts.push(`Book: ${args.bookTitle}`);
    if (args.genre) parts.push(`Genre: ${args.genre}`);
    if (args.chapterTitle) parts.push(`Chapter: ${args.chapterTitle}`);
    parts.push("\nChapter text:\n" + args.chapterText);

    return [
        { role: "system", content: system },
        { role: "user", content: parts.join("\n") },
    ];
}
