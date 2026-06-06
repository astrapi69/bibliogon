/**
 * Book marketing-copy prompts (offline AI, #34 P4). A TS port of
 * `_MARKETING_PROMPTS` + `_build_marketing_prompt` in backend/app/ai/routes.py,
 * so the browser-direct client builds the SAME system/user prompts the backend
 * does for the four generatable book fields.
 */

import type { AiGenerateMarketingRequest } from "../api/client";
import type { AiChatMessage } from "./llmClient";

/** ISO 639-1 -> English language name (mirrors backend LANG_MAP). */
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

/** Per-field system prompts (verbatim from the backend). */
export const MARKETING_PROMPTS: Record<string, string> = {
  html_description: `Write a compelling book description for an online book store (e.g. Amazon KDP).

Rules:
- Use simple HTML: <p>, <b>, <i>, <br> tags only. No headings, no lists.
- 150-300 words.
- Start with a hook that grabs attention.
- Describe the premise without spoilers.
- End with a question or teaser that makes the reader want to buy.
- Do NOT include the title or author name in the description.
- Write in {language}.`,
  backpage_description: `Write a back cover description for a printed book.

Rules:
- Plain text, no HTML.
- 80-150 words (must fit on a physical back cover).
- Concise, punchy, enticing.
- Write in {language}.`,
  backpage_author_bio: `Write a short author biography for the back cover of a book.

Rules:
- Plain text, no HTML.
- 50-100 words.
- Third person ("The author..." / "Der Autor...").
- Professional but warm tone.
- If no specific details are provided, write a plausible generic bio based on the genre.
- Write in {language}.`,
  keywords: `Generate 7 Amazon KDP keywords (search terms) for this book.

Rules:
- Return ONLY a JSON array of strings, e.g. ["keyword 1", "keyword 2", ...]
- Each keyword can be a phrase (2-4 words are ideal for Amazon).
- Focus on what readers would search for.
- Include genre terms, theme terms, and comparable-title terms.
- No duplicates, no single-character entries.
- Write keywords in {language}.`,
};

export const MARKETING_FIELDS = Object.keys(MARKETING_PROMPTS);

/** Build the [system, user] chat messages for a marketing field. Throws on an
 *  unknown field. */
export function buildMarketingMessages(
  req: AiGenerateMarketingRequest,
): AiChatMessage[] {
  const template = MARKETING_PROMPTS[req.field];
  if (!template) throw new Error(`Unknown marketing field: ${req.field}`);
  const language = LANG_NAMES[req.language] ?? req.language;
  const system = template.replace("{language}", language);

  const parts = [`Title: ${req.book_title}`];
  if (req.author) parts.push(`Author: ${req.author}`);
  if (req.genre) parts.push(`Genre: ${req.genre}`);
  if (req.description) parts.push(`Description: ${req.description}`);
  if (req.chapter_titles.length) {
    parts.push(`Chapter titles: ${req.chapter_titles.slice(0, 20).join(", ")}`);
  }
  if (req.existing_text) {
    parts.push(`\nCurrent text to improve:\n${req.existing_text}`);
  }
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n") },
  ];
}
