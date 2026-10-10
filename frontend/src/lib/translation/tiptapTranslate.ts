/**
 * Turning a chapter or article body into translatable prose, and back
 * (#751).
 *
 * Port of `extract_plain_text_from_tiptap` and
 * `rebuild_tiptap_with_translation` in
 * `plugins/bibliogon-plugin-translation/bibliogon_translation/book_translator.py`,
 * checked against a recording of what those two actually do
 * (`tiptapTranslate.parity.json`). The quirks below are theirs, reproduced
 * on purpose - a port that "improves" them stops being a port and starts
 * being a second, differently-behaved translator.
 *
 * Library-grade: no storage, no React, no provider. The caller supplies
 * the translation.
 *
 * @example
 * const prose = extractPlainTextFromTiptap(chapter.content);
 * const translated = await translate(prose);
 * chapter.content = rebuildTiptapWithTranslation(chapter.content, translated);
 */

import { htmlToPlainText } from "../utils/content/htmlToPlainText";

/** Block types after which the extractor emits a separator. */
const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem"]);

interface TiptapNode {
    type?: string;
    text?: string;
    content?: unknown;
    [key: string]: unknown;
}

function isNode(value: unknown): value is TiptapNode {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collect(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        for (const item of node) collect(item, out);
        return;
    }
    if (!isNode(node)) return;
    if (node.type === "text") {
        const text = typeof node.text === "string" ? node.text : "";
        if (text) out.push(text);
        return;
    }
    if ("content" in node && Array.isArray(node.content)) {
        for (const child of node.content) collect(child, out);
        if (node.type && BLOCK_TYPES.has(node.type)) out.push("");
    }
}

/**
 * The body's text, one line per text node, with a blank line after each
 * block.
 *
 * Four content shapes reach this, and all four are real: TipTap JSON is
 * what the editor writes, HTML is what every imported chapter holds until
 * someone opens and saves it (#787), plain text is legacy rows, and empty
 * is a new chapter. Anything that does not parse as JSON and starts with
 * `<` is stripped to prose rather than sent to a translator as markup;
 * anything else is already prose and passes through.
 */
export function extractPlainTextFromTiptap(content: string | null | undefined): string {
    if (!content || !content.trim()) return "";
    let doc: unknown;
    try {
        doc = JSON.parse(content);
    } catch {
        return content.trim().startsWith("<") ? htmlToPlainText(content) : content;
    }
    const texts: string[] = [];
    collect(doc, texts);
    return texts.join("\n");
}

function replace(node: unknown, segments: string[], cursor: { index: number }): void {
    if (Array.isArray(node)) {
        for (const item of node) replace(item, segments, cursor);
        return;
    }
    if (!isNode(node)) return;
    if (node.type === "text") {
        // Out of segments: keep the original. A shorter translation
        // leaves the tail untranslated rather than blanking it.
        if (cursor.index < segments.length) node.text = segments[cursor.index++];
        return;
    }
    if ("content" in node && Array.isArray(node.content)) {
        for (const child of node.content) replace(child, segments, cursor);
    }
}

/**
 * The original document with its text nodes replaced by the translation,
 * in document order.
 *
 * Structure, marks and attrs survive; the mapping is positional, which is
 * why the extractor's blank separators are dropped here - they are
 * separators, not content, and feeding them to a text node would blank it.
 * A translation with more lines than the document has text nodes loses the
 * surplus; one with fewer leaves the tail in the source language. Both are
 * the Python behaviour, and both are why the caller needs the guard in
 * `translatedBody`.
 *
 * A non-JSON original returns the translation itself: there is no
 * structure to preserve, and returning the untranslated markup instead
 * would silently discard the work.
 */
export function rebuildTiptapWithTranslation(
    originalContent: string | null | undefined,
    translatedText: string,
): string {
    if (!originalContent || !originalContent.trim()) return originalContent ?? "";
    let doc: unknown;
    try {
        doc = JSON.parse(originalContent);
    } catch {
        return translatedText;
    }
    const segments = translatedText.split("\n").filter((segment) => segment !== "");
    replace(doc, segments, { index: 0 });
    return JSON.stringify(doc);
}
