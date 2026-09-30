/**
 * Strip HTML down to readable plain text.
 *
 * A faithful TypeScript mirror of the backend
 * `app/services/html_text.py::html_to_plain_text` (#818), for the
 * consumers that have to run without a backend: the offline Story-Bible
 * text analysis reads chapter bodies straight out of IndexedDB, and an
 * imported chapter stays HTML until someone opens and saves it in the
 * editor (#787) — measured on the dev library, 779 of 834 chapters are
 * HTML and none are TipTap JSON, so the HTML branch is the common case,
 * not the edge case.
 *
 * Passing raw markup to a word-boundary matcher fails twice (#806): a
 * multi-word name split across two adjacent inline tags
 * (`<em>Frau</em> <strong>Mueller</strong>`) never matches the literal
 * string, and a name inside an `href` counts as a mention that was never
 * in the prose. Stripping first fixes both.
 *
 * Parsing goes through the platform `DOMParser` rather than a hand-rolled
 * tokenizer, so character references, malformed nesting and
 * `<script>`/`<style>` bodies behave the way the browser says they do.
 *
 * @example
 * htmlToPlainText("<p>Hello <strong>world</strong>.</p>"); // "Hello world."
 */

/** Tags whose end produces a line break (mirrors `_BLOCK_TAGS`). */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "blockquote",
    "br",
    "tr",
]);

/** Tags whose text content is markup plumbing, never prose. */
const SKIPPED_CONTENT_TAGS: ReadonlySet<string> = new Set(["script", "style"]);

/**
 * Strip HTML down to readable prose — no Markdown, no tags.
 *
 * @param html Raw HTML, as stored in an imported chapter's content.
 * @returns Plain text with character references decoded, one line per
 * block element, internal whitespace collapsed to single spaces and
 * empty lines dropped. Empty or whitespace-only input yields `""`.
 *
 * Known deliberate divergence from the Python original: a void `<br>`
 * breaks the line here. The backend lists `br` in its block tags but
 * feeds them to `HTMLParser`, which only calls `handle_endtag` for an
 * explicit `</br>`, so a bare `<br>` silently glues the two lines into
 * one word there. Mirroring that would turn `Foo<br>Bar` into the single
 * token `FooBar` and lose both names to the word-boundary matcher, so
 * this follows the backend's evident intent rather than its behaviour.
 */
export function htmlToPlainText(html: string): string {
    if (!html || !html.trim()) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const lines: string[][] = [[]];
    collect(doc.body, lines);
    return lines
        .map((parts) => parts.join("").replace(/\s+/g, " ").trim())
        .filter((line) => line)
        .join("\n");
}

/**
 * Depth-first walk appending text to the current line and starting a new
 * one at every block boundary.
 *
 * The boundary is a structural marker, not a newline character in the
 * text: a literal newline inside a text node is ordinary whitespace and
 * gets collapsed into the surrounding line, exactly as the backend's
 * chunk-list split does.
 */
function collect(node: Node, lines: string[][]): void {
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 /* Node.TEXT_NODE */) {
            lines[lines.length - 1].push(child.nodeValue ?? "");
            continue;
        }
        if (child.nodeType !== 1 /* Node.ELEMENT_NODE */) continue;
        const tag = (child as Element).tagName.toLowerCase();
        if (SKIPPED_CONTENT_TAGS.has(tag)) continue;
        collect(child, lines);
        if (BLOCK_TAGS.has(tag)) lines.push([]);
    }
}
