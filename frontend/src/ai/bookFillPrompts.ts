/**
 * Book aiFill prompts + field-class registry (offline AI 1b).
 *
 * A TypeScript port of `backend/app/ai/book_template_prompts.py` and the
 * field-class registry in `backend/app/routers/book_ai_fill.py`, adapted to
 * request a JSON object instead of a YAML fragment (see templateApply.ts).
 *
 * Offline scope: all five of the backend's field-classes since #1077.
 * `cover_prompt` was omitted while its `cover_image_prompt` column was
 * absent from the frontend shape and no PATCH accepted it (#1076 fixed
 * both), and `chapter_summaries` while the chapter-reconcile had no browser
 * implementation - it does now, ported for the `.biblio.yaml` round-trip
 * (#745), and this registry calls that one rather than a second copy.
 */

import type { AiChatMessage } from "./llmClient";
import type { FillClassSpec } from "./fillTypes";

/** Minimal book shape the prompt builders read. */
export interface BookPromptInput {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  genre?: string | null;
  series?: string | null;
  language: string;
  /**
   * One block per chapter for the `chapter_summaries` class, which asks
   * for a summary per chapter rather than from the aggregated body.
   * Mirrors `_build_chapter_input` in the backend router.
   */
  chapters?: { chapter_id: string; title: string; excerpt: string }[];
}

/** Per-chapter excerpt cap, mirroring the backend `_CHAPTER_EXCERPT_LIMIT`
 *  so the prompt stays compact for books with many long chapters. */
export const CHAPTER_EXCERPT_LIMIT = 600;

const BODY_EXCERPT_LIMIT = 1500;

function formatHeader(book: BookPromptInput): string {
  const lines = [`Book title: ${book.title}`];
  if (book.subtitle) lines.push(`Subtitle: ${book.subtitle}`);
  if (book.author) lines.push(`Author: ${book.author}`);
  if (book.genre) lines.push(`Genre: ${book.genre}`);
  if (book.series) lines.push(`Series: ${book.series}`);
  lines.push(`Language: ${book.language}`);
  return lines.join("\n");
}

function excerpt(body: string): string {
  return body.slice(0, BODY_EXCERPT_LIMIT);
}

function systemPrompt(book: BookPromptInput): string {
  return `You are filling metadata fields for a book in a Bibliogon AI template. Follow these rules:

1. Respond with a JSON object ONLY. No prose, no markdown fences, no commentary outside the JSON.
2. Respond in the book's language: ${book.language}. All generated marketing copy must be in that language. Image prompts can stay in English (image generators are most reliable with English prompts).
3. Use real UTF-8 characters (umlauts, accents, CJK characters). Do NOT escape them and do NOT substitute ASCII transliterations.
4. If you cannot generate a field with high confidence, set it to null. Do not invent.
5. Output ONLY the fields requested in the user message; do not echo unrelated fields.`;
}

function userPrefix(book: BookPromptInput, body: string): string {
  return `${formatHeader(book)}

Book content (excerpt across chapters):
${excerpt(body)}`;
}

function messages(book: BookPromptInput, user: string): AiChatMessage[] {
  return [
    { role: "system", content: systemPrompt(book) },
    { role: "user", content: user },
  ];
}

function buildMarketingCopyMessages(book: BookPromptInput, body: string): AiChatMessage[] {
  return messages(
    book,
    `${userPrefix(book, body)}

Generate marketing copy for this book. Output exactly this JSON shape:

{"backpage_description": "<100-200 words, back-cover blurb. Hook -> conflict -> stakes. No spoilers.>", "backpage_author_bio": "<50-100 words, third person. Credentials + personal note. null if the author is unknown.>", "html_description": "<200-300 word Amazon-style HTML description. Allowed tags: b, i, br, p, h2, ul, li. Hook in the first paragraph; benefits as a list; soft call-to-action at the end.>"}`,
  );
}

function buildTagsMessages(book: BookPromptInput, body: string): AiChatMessage[] {
  return messages(
    book,
    `${userPrefix(book, body)}

Generate 5-10 keywords for this book. Each keyword is single-word or hyphenated, lowercase, in the book's language. Optimised for both SEO and Amazon marketplace search. Output exactly this JSON shape:

{"keywords": ["keyword-1", "keyword-2"]}`,
  );
}

function buildDescriptionGenreMessages(book: BookPromptInput, body: string): AiChatMessage[] {
  return messages(
    book,
    `${userPrefix(book, body)}

Generate a short plain-text book description and identify the primary genre. Output exactly this JSON shape:

{"description": "<1-2 paragraph plain-text description, used internally; separate from the Amazon HTML description>", "genre": "<single word or short phrase, e.g. Non-Fiction / Reference>"}`,
  );
}

function buildCoverPromptMessages(book: BookPromptInput, body: string): AiChatMessage[] {
  return messages(
    book,
    `${userPrefix(book, body)}

Generate a Stable-Diffusion-style prompt for the book cover. The prompt can stay in English even if the book language differs - image generators are most reliable with English prompts. Include:

- style (photorealistic, illustration, hand-drawn, ...)
- mood and color palette
- dominant subject and composition
- portrait orientation (book covers are usually 6x9 inches)
- "no text in image" since title and author overlay separately

Output exactly this JSON shape:

{"cover_image_prompt": "<prompt body>"}`,
  );
}

/**
 * One summary per chapter, keyed by `chapter_id`.
 *
 * Reads the chapters off the prompt input rather than the aggregated
 * body, because the answer has to be per chapter and matched back by id -
 * which is also why this class carries `isChapterSummaries` and runs
 * through the reconcile before anything is written.
 */
function buildChapterSummariesMessages(
  book: BookPromptInput,
  _body: string,
): AiChatMessage[] {
  const blocks = (book.chapters ?? []).map(
    (chapter) =>
      `chapter_id: ${chapter.chapter_id}\ntitle: ${chapter.title}\nexcerpt: ${chapter.excerpt.slice(
        0,
        CHAPTER_EXCERPT_LIMIT,
      )}`,
  );
  return messages(
    book,
    `${formatHeader(book)}

Chapters (one block per chapter):
${blocks.join("\n\n---\n\n")}

Generate a one-sentence summary for EACH chapter listed above. Match each summary to its chapter by chapter_id - do NOT invent new chapter_ids and do NOT skip chapters. Output exactly this JSON shape, one entry per chapter in the same order:

{"chapter_summaries": [{"chapter_id": "<id from above>", "title": "<title from above>", "summary": "<one-sentence summary>"}]}`,
  );
}

/** The book field-classes, all five of them since #1077. */
export const BOOK_FILL_CLASSES: Record<string, FillClassSpec<BookPromptInput>> = {
  marketing_copy: {
    buildMessages: buildMarketingCopyMessages,
    targets: [
      { aiKey: "backpage_description", column: "backpage_description", isList: false },
      { aiKey: "backpage_author_bio", column: "backpage_author_bio", isList: false },
      { aiKey: "html_description", column: "html_description", isList: false },
    ],
  },
  tags: {
    buildMessages: buildTagsMessages,
    targets: [{ aiKey: "keywords", column: "keywords", isList: true }],
  },
  cover_prompt: {
    buildMessages: buildCoverPromptMessages,
    targets: [
      { aiKey: "cover_image_prompt", column: "cover_image_prompt", isList: false },
    ],
  },
  chapter_summaries: {
    buildMessages: buildChapterSummariesMessages,
    targets: [{ aiKey: "chapter_summaries", column: "chapter_summaries", isList: true }],
    isChapterSummaries: true,
  },
  description_genre: {
    buildMessages: buildDescriptionGenreMessages,
    targets: [
      { aiKey: "description", column: "description", isList: false },
      { aiKey: "genre", column: "genre", isList: false },
    ],
  },
};

/** Field-class names supported offline, in display order. */
export const BOOK_OFFLINE_FILL_CLASSES = Object.keys(BOOK_FILL_CLASSES);
