/**
 * The HTML subset Amazon KDP accepts in a book description (#1119).
 *
 * KDP's "Supported HTML" help lists exactly the tags in
 * {@link KDP_DESCRIPTION_TAGS}. A description carrying any other tag -
 * `strong`, `h1` to `h3`, `blockquote` - is rejected as a whole when it
 * is pasted, so a sanitizer that lets one through shows a preview the
 * store will not take.
 *
 * {@link toKdpHtml} keeps the author's intent where KDP has an
 * equivalent (`strong` becomes `b`, `h1`-`h3` become `h4`) and only then
 * drops what is left, keeping its text. {@link kdpRejectedTags} names
 * what a value still contains that KDP would refuse.
 *
 * @example
 * toKdpHtml("<h2><strong>Neu</strong></h2>"); // "<h4><b>Neu</b></h4>"
 * kdpRejectedTags("<h2>Neu</h2>");           // ["h2"]
 */

import DOMPurify from "dompurify";

/** The tags KDP's "Supported HTML" help lists for descriptions. */
export const KDP_DESCRIPTION_TAGS: readonly string[] = [
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
];

/** Rejected tags with an accepted equivalent, rewritten before sanitizing. */
const KDP_EQUIVALENTS: Readonly<Record<string, string>> = {
    strong: "b",
    h1: "h4",
    h2: "h4",
    h3: "h4",
};

function parseBody(html: string): HTMLElement {
    return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
}

function renameEquivalents(body: HTMLElement): void {
    const doc = body.ownerDocument;
    for (const [from, to] of Object.entries(KDP_EQUIVALENTS)) {
        for (const element of Array.from(body.querySelectorAll(from))) {
            const replacement = doc.createElement(to);
            replacement.append(...Array.from(element.childNodes));
            element.replaceWith(replacement);
        }
    }
}

/**
 * Convert HTML into what KDP accepts: equivalents rewritten, every other
 * tag and every attribute removed, text kept.
 */
export function toKdpHtml(html: string): string {
    if (!html) return "";
    const body = parseBody(html);
    renameEquivalents(body);
    return DOMPurify.sanitize(body.innerHTML, {
        ALLOWED_TAGS: [...KDP_DESCRIPTION_TAGS],
        ALLOWED_ATTR: [],
    });
}

/** Lower-case names of the tags in `html` that KDP rejects, sorted, once each. */
export function kdpRejectedTags(html: string): string[] {
    if (!html) return [];
    const allowed = new Set(KDP_DESCRIPTION_TAGS);
    const found = new Set<string>();
    for (const element of Array.from(parseBody(html).querySelectorAll("*"))) {
        const tag = element.tagName.toLowerCase();
        if (!allowed.has(tag)) found.add(tag);
    }
    return [...found].sort();
}
