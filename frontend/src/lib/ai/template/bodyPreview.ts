/**
 * The body preview a per-record `.biblio.yaml` carries (#745).
 *
 * Mirrors `extract_body_preview` / `extract_body_text` in
 * `backend/app/ai/template_body.py`, including the branch that matters
 * most in practice: an imported chapter or article is HTML until someone
 * opens and saves it in the editor (#787), so a failed `JSON.parse` is
 * not "no content" - it is usually "HTML content" (#824). Measured on
 * the dev library, 778 of 833 chapters were HTML and none were TipTap
 * JSON, so the HTML branch is the common case.
 *
 * The walker concatenates raw text with no list or heading markers,
 * rather than reusing `flattenTipTapText`, because this text goes into a
 * file whose prompts were written against the backend's shape.
 *
 * @example
 * const [preview, words] = extractBodyPreview(article.content_json);
 */

import { htmlToPlainText } from "../../utils/content/htmlToPlainText";

/** Plain text from a stored TipTap doc, HTML string, or plain string. */
export function extractBodyText(stored: string | null | undefined): string {
    if (!stored) return "";
    const trimmed = stored.trim();
    if (!trimmed) return "";
    let doc: unknown;
    try {
        doc = JSON.parse(stored);
    } catch {
        // `<` is the backend's own test for the HTML case; anything else
        // is treated as plain text rather than discarded, which is what
        // a legacy row holds.
        return trimmed.startsWith("<") ? htmlToPlainText(stored) : trimmed;
    }
    const parts: string[] = [];
    const walk = (node: unknown): void => {
        if (typeof node !== "object" || node === null) return;
        const record = node as Record<string, unknown>;
        if (typeof record.text === "string") parts.push(record.text);
        const children = record.content;
        if (Array.isArray(children)) children.forEach(walk);
    };
    walk(doc);
    return parts.filter(Boolean).join("\n").trim();
}

/** Default word budget for the preview, mirroring the backend's. */
export const BODY_WORD_LIMIT = 500;

/**
 * `[preview, totalWordCount]` for a body.
 *
 * The count is of the WHOLE body, not of the preview, so the assistant
 * can tell how much of the text it is looking at. Truncation appends
 * ` [...]`, like the backend.
 */
export function extractBodyPreview(
    stored: string | null | undefined,
    wordLimit: number = BODY_WORD_LIMIT,
): [string, number] {
    const text = extractBodyText(stored);
    if (!text) return ["", 0];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= wordLimit) return [text, words.length];
    return [words.slice(0, wordLimit).join(" ") + " [...]", words.length];
}

/**
 * The preview for a whole book: its chapters' text, joined the way the
 * backend joins it, then truncated as one body.
 *
 * Joining before truncating is what makes the word count the book's and
 * not the first chapter's.
 */
export function extractBookBodyPreview(
    chapterContents: (string | null | undefined)[],
    wordLimit: number = BODY_WORD_LIMIT,
): [string, number] {
    const joined = chapterContents
        .map((content) => extractBodyText(content))
        .filter(Boolean)
        .join("\n\n");
    if (!joined) return ["", 0];
    const words = joined.split(/\s+/).filter(Boolean);
    if (words.length <= wordLimit) return [joined, words.length];
    return [words.slice(0, wordLimit).join(" ") + " [...]", words.length];
}
