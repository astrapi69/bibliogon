/**
 * Browser mirror of the backend's import-path style allowlist (#988, #736).
 *
 * Imported HTML lands in a chapter's content as HTML and stays HTML until
 * someone opens and saves it in the editor (#787). Until then nothing has
 * filtered it, so a declaration the author never wrote travels into the
 * document that is rendered, exported and shipped to a store. No script
 * executes - the TipTap schema and DOMPurify keep the dangerous attributes
 * out - but `position: fixed` inside the editor, a `background-image:
 * url(...)` that fetches from a third party when the chapter opens, and
 * declarations that change a layout the author approved in the EPUB or print
 * PDF all reach further than they look.
 *
 * Why this is a port and not a call: the backend filter runs inside
 * `md_to_html`, which the browser does not have. The client import path
 * converges here instead, so the stored document is the clean one either way.
 *
 * Why it is a regex over the attribute VALUE and not a DOM parse: it rewrites
 * the contents of one attribute, which cannot nest and cannot contain the
 * quote that delimits it. The document structure is never parsed, so the
 * repo's "no regex for nested HTML" rule is not in play. Parsing with
 * DOMParser and re-serialising would also normalise markup the backend leaves
 * alone, and the parity record pins the backend's output.
 *
 * @example
 * filterImportStyles('<p style="text-align: center; position: fixed">X</p>')
 * // '<p style="text-align: center">X</p>'
 */

/**
 * CSS properties the editor itself emits, derived from the extensions it
 * mounts rather than from a guess about what looks harmless: `text-align`
 * from TextAlign on headings and paragraphs, `color` from
 * `@tiptap/extension-color`, `background-color` from Highlight with
 * multicolor, and `width`/`min-width` from resizable table columns. Anything
 * else in an imported style attribute arrived from an importer.
 *
 * Kept in lockstep with `ALLOWED_STYLE_PROPERTIES` in
 * `backend/app/services/backup/markdown_utils.py`; the parity record is what
 * notices when they drift.
 */
export const ALLOWED_STYLE_PROPERTIES: ReadonlySet<string> = new Set([
    "text-align",
    "color",
    "background-color",
    "width",
    "min-width",
]);

/**
 * One `style` attribute in any of the three forms HTML allows.
 *
 * The quoted alternatives are quote-type-specific on purpose: one character
 * class excluding BOTH quotes would fail to match a double-quoted value that
 * contains an apostrophe, such as a font-family stack, and would leave that
 * attribute - declarations and all - unfiltered.
 */
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

/**
 * The allowlisted declarations of one style attribute value.
 *
 * Declarations split on `;` and match on the property name, lower-cased and
 * stripped. A fragment without a colon is not a declaration and is dropped.
 */
export function filterStyleDeclarations(value: string): string {
    const kept: string[] = [];
    for (const declaration of value.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon === -1) continue;
        const prop = declaration.slice(0, colon).trim().toLowerCase();
        if (!ALLOWED_STYLE_PROPERTIES.has(prop)) continue;
        kept.push(`${prop}: ${declaration.slice(colon + 1).trim()}`);
    }
    return kept.join("; ");
}

/**
 * Every `style` attribute in `html`, rewritten down to the allowlist.
 *
 * An attribute left with nothing is removed entirely rather than left as
 * `style=""`. An unquoted value is re-emitted quoted, which is the same
 * attribute in valid markup. A single-quoted value keeps its quotes, so a
 * value containing a double quote stays valid.
 */
export function filterImportStyles(html: string): string {
    if (!html || !html.toLowerCase().includes("style")) return html;

    return html.replace(
        STYLE_ATTR_RE,
        (_match, prefix: string, dq?: string, sq?: string, bare?: string) => {
            let raw: string;
            let quote: string;
            if (dq !== undefined) {
                raw = dq;
                quote = '"';
            } else if (sq !== undefined) {
                raw = sq;
                quote = "'";
            } else {
                raw = bare ?? "";
                quote = '"';
            }
            const filtered = filterStyleDeclarations(raw);
            if (!filtered) return "";
            return `${prefix}${quote}${filtered}${quote}`;
        },
    );
}
