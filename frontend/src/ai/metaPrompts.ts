/**
 * Article SEO-metadata prompts (offline AI, #450 / #34).
 *
 * Builds the chat messages for the three article-metadata generators
 * (SEO title, SEO description, tags) and parses the model's reply into the
 * same `{ generated_text?, generated_tags? }` shape the backend
 * `POST /api/articles/{id}/ai/generate-meta` route returns, so the offline
 * browser-direct path is a drop-in for the online one.
 *
 * @example
 * const messages = buildMetaMessages("tags", { title, language: "de", bodyText });
 * const { generated_tags } = parseMetaResponse("tags", reply);
 */

import type { AiChatMessage } from "./llmClient";

/** The article-metadata fields the generator supports. */
export type AiMetaField = "seo_title" | "seo_description" | "tags";

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

const FIELD_PROMPTS: Record<AiMetaField, string> = {
    seo_title:
        "Write a single SEO-optimized title for this article.\n\n" +
        "Rules:\n" +
        "- Return ONLY the title text, no quotes, no Markdown, no explanation.\n" +
        "- 50-60 characters is ideal.\n" +
        "- Compelling and search-friendly.\n" +
        "- Write in {language}.",
    seo_description:
        "Write a single SEO meta description for this article.\n\n" +
        "Rules:\n" +
        "- Return ONLY the description text, no quotes, no Markdown.\n" +
        "- 140-160 characters is ideal.\n" +
        "- Summarize the article and invite the click.\n" +
        "- Write in {language}.",
    tags:
        "Generate 5-8 topical tags for this article.\n\n" +
        "Rules:\n" +
        '- Return ONLY a JSON array of strings, e.g. ["tag one", "tag two"].\n' +
        "- Short tags (1-3 words each).\n" +
        "- No duplicates, no hashes, no single characters.\n" +
        "- Write tags in {language}.",
};

const BODY_CHAR_BUDGET = 6000;

/** Build the [system, user] chat messages for an article-metadata field. */
export function buildMetaMessages(
    field: AiMetaField,
    ctx: { title: string; language: string; bodyText: string; topic?: string | null },
): AiChatMessage[] {
    const language = LANG_NAMES[ctx.language] ?? ctx.language;
    const system = FIELD_PROMPTS[field].replace("{language}", language);

    const parts = [`Title: ${ctx.title}`];
    if (ctx.topic) parts.push(`Topic: ${ctx.topic}`);
    const body = ctx.bodyText.slice(0, BODY_CHAR_BUDGET);
    if (body.trim()) parts.push(`\nArticle text:\n${body}`);

    return [
        { role: "system", content: system },
        { role: "user", content: parts.join("\n") },
    ];
}

/**
 * Parse a model reply into the backend's generate-meta response shape. For
 * `tags` the reply is expected to be a JSON array; a non-array reply yields an
 * empty tag list. For the text fields the reply is trimmed and stray wrapping
 * quotes are stripped.
 */
export function parseMetaResponse(
    field: AiMetaField,
    content: string,
): { generated_text?: string; generated_tags?: string[] } {
    if (field === "tags") {
        return { generated_tags: parseTagList(content) };
    }
    return { generated_text: stripWrappingQuotes(content.trim()) };
}

function stripWrappingQuotes(text: string): string {
    const match = text.match(/^["'“”„](.*)["'“”„]$/s);
    return match ? match[1].trim() : text;
}

function parseTagList(content: string): string[] {
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
        const parsed: unknown = JSON.parse(content.slice(start, end + 1));
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry) => String(entry).trim()).filter((entry) => entry.length > 1);
    } catch {
        return [];
    }
}
