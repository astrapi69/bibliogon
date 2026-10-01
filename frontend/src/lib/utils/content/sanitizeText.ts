/**
 * Manuscript text sanitizer: the client-side mirror of `sanitizer.py`.
 *
 * Fixes what copy-paste drags in - invisible characters, straight
 * quotes, sloppy whitespace, double hyphens, three dots, and Word's
 * HTML debris - so the sanitizer works in the backendless build
 * instead of being a desktop-only tool (#733, part of #727).
 *
 * Two of the six fixes are HTML-aware. `fixQuotes` and `fixWhitespace`
 * are pure string transforms, so running them over an imported
 * chapter's raw markup mangles the markup too: an ASCII quote inside an
 * attribute becomes typographic, and the missing-space-after-punctuation
 * rule inserts a space into a file extension. Both are therefore routed
 * through {@link applyToTextNodes}, which is the only part of this
 * module that understands markup at all (#805).
 *
 * @example
 * const result = sanitizeText('Er sagte "hallo"...', { language: "de" });
 * result.sanitized;    // 'Er sagte „hallo“…'
 * result.total_fixes;  // 3
 */

/** Per-language quote characters: outer open/close, inner open/close. */
const QUOTE_STYLES: Record<string, readonly [string, string, string, string]> = {
    de: ["„", "“", "‚", "‘"],
    en: ["“", "”", "‘", "’"],
    fr: ["«\u202f", "\u202f»", "“", "”"],
    es: ["«", "»", "“", "”"],
    el: ["«", "»", "“", "”"],
};

/** Which fixes to run. Every one defaults to on, as the endpoint does. */
export interface SanitizeOptions {
    language?: string;
    fixInvisible?: boolean;
    fixQuoteMarks?: boolean;
    fixSpaces?: boolean;
    fixDashMarks?: boolean;
    fixEllipses?: boolean;
    fixHtml?: boolean;
}

/** Per-fix replacement counts, keyed as the endpoint keys them. */
export interface SanitizeFixCounts {
    invisible_chars?: number;
    quotes?: number;
    whitespace?: number;
    dashes?: number;
    ellipsis?: number;
    html_artifacts?: number;
}

/** Field-for-field the `/ms-tools/sanitize` response. */
export interface SanitizeResult {
    original: string;
    sanitized: string;
    total_fixes: number;
    fixes: SanitizeFixCounts;
    changed: boolean;
}

/** One line of a {@link sanitizePreview} diff. */
export interface SanitizeDiffLine {
    line: number;
    type: "unchanged" | "removed" | "added";
    text: string;
}

/** A {@link sanitizeText} result plus the line-by-line diff. */
export interface SanitizePreviewResult extends SanitizeResult {
    diff: SanitizeDiffLine[];
}

/** A fix: text in, fixed text plus a replacement count out. */
type Transform = (text: string) => [string, number];

function replaceCounting(text: string, pattern: RegExp, replacement: string): [string, number] {
    let count = 0;
    const fixed = text.replace(pattern, (...args) => {
        count += 1;
        // `replace` passes the capture groups between the match and the
        // offset; $1/$2 in the replacement resolve against them.
        return replacement.replace(/\$(\d)/g, (_, index: string) => String(args[Number(index)] ?? ""));
    });
    return [fixed, count];
}

/** One pattern per invisible character, as the Python does. Deliberately not
 *  a single character class: a class holding the zero-width joiner is
 *  "misleading" (it can bind surrogate pairs) and the linter rejects it. */
const INVISIBLE_PATTERNS = [
    /\u200b/g,
    /\u200c/g,
    /\u200d/g,
    /\u2060/g,
    /\ufeff/g,
    /\u00ad/g,
];

/**
 * Strip the invisible characters that survive a copy-paste and then
 * break an export: non-breaking and zero-width spaces, byte-order
 * marks, soft hyphens, joiners.
 */
export function fixInvisibleChars(text: string): [string, number] {
    let [fixed, count] = replaceCounting(text, /\u00a0/g, " ");
    for (const pattern of INVISIBLE_PATTERNS) {
        const [next, n] = replaceCounting(fixed, pattern, "");
        fixed = next;
        count += n;
    }
    return [fixed, count];
}

/**
 * Turn straight quotes into the typographic pair the language uses.
 *
 * An apostrophe between two letters is always a right single quote;
 * otherwise a leading or trailing position decides which inner quote it
 * becomes. Double quotes simply alternate open/close.
 */
export function fixQuotes(text: string, language = "de"): [string, number] {
    const [outerOpen, outerClose, innerOpen, innerClose] =
        QUOTE_STYLES[language] ?? QUOTE_STYLES.en;
    const isAlpha = (char: string | undefined) => !!char && /\p{L}/u.test(char);

    const result: string[] = [];
    let count = 0;
    let inQuote = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '"') {
            result.push(inQuote ? outerClose : outerOpen);
            inQuote = !inQuote;
            count += 1;
        } else if (char === "'") {
            const prevIsWord = i > 0 && isAlpha(text[i - 1]);
            const nextIsWord = isAlpha(text[i + 1]);
            if (prevIsWord && nextIsWord) {
                result.push("’");
                count += 1;
            } else if (!prevIsWord && nextIsWord) {
                result.push(innerOpen);
                count += 1;
            } else if (prevIsWord && !nextIsWord) {
                result.push(innerClose);
                count += 1;
            } else {
                result.push(char);
            }
        } else {
            result.push(char);
        }
    }
    return [result.join(""), count];
}

/**
 * Collapse doubled spaces, pull punctuation back onto its word, put a
 * space after punctuation that lost one, trim line ends, and cap runs
 * of blank lines at two.
 *
 * `trimLastLine: false` leaves the final line's trailing whitespace
 * alone. Callers pass it when the input is a FRAGMENT rather than a whole
 * document - a text node between two tags, whose last line ends at the
 * next tag rather than at a line break, so its trailing space is carrying
 * meaning instead of being noise (#939). Every earlier line in the
 * fragment does end where it says it ends and is trimmed as usual.
 *
 * Accepted trade-off: the walker cannot tell mid-stream which text node
 * is the document's last, so a document ending in whitespace after a tag
 * keeps one space. Cosmetic, where eating a space mid-sentence was not.
 */
export function fixWhitespace(text: string, trimLastLine = true): [string, number] {
    let count = 0;
    let [fixed, n] = replaceCounting(text, / {2,}/g, " ");
    count += n;
    [fixed, n] = replaceCounting(fixed, / +([.,;:!?])/g, "$1");
    count += n;
    [fixed, n] = replaceCounting(fixed, /([.,;:!?])([A-Za-zÀ-ɏ])/g, "$1 $2");
    count += n;

    const lines = fixed.split("\n");
    const last = lines.length - 1;
    const trimmed = lines.map((line, index) => {
        if (index === last && !trimLastLine) return line;
        const stripped = line.replace(/\s+$/, "");
        if (stripped !== line) count += 1;
        return stripped;
    });
    fixed = trimmed.join("\n");

    [fixed, n] = replaceCounting(fixed, /\n{4,}/g, "\n\n\n");
    count += n;
    return [fixed, count];
}

/** Three hyphens become an em dash, two an en dash. */
export function fixDashes(text: string): [string, number] {
    let [fixed, count] = replaceCounting(text, /---/g, "—");
    const [next, n] = replaceCounting(fixed, /(?<!-)--(?!-)/g, "–");
    fixed = next;
    count += n;
    return [fixed, count];
}

/** Three dots become a single ellipsis character. */
export function fixEllipsis(text: string): [string, number] {
    return replaceCounting(text, /\.{3}/g, "…");
}

/**
 * Class tokens a paste leaves behind, by the shape their producer gives
 * them. Deliberately narrow: a token is dropped only when it MATCHES one
 * of these, so a class nobody has catalogued survives rather than being
 * destroyed (#818).
 *
 * - `Mso…` Word (MsoNormal, MsoListParagraph, MsoBodyText, …)
 * - `WordSection1` Word's page-section wrapper
 * - `c1`, `c12` Google Docs
 * - `kix-…` Google Docs' editor internals
 */
const PASTE_CLASS_RES: readonly RegExp[] = [
    /^mso/i,
    /^wordsection\d+$/i,
    /^c\d+$/,
    /^kix-/i,
];

/**
 * The OPENING of the attribute only, with the whitespace before it and the
 * value after it both walked in code. `(\s+)class="([^"]*)"` reads better
 * and was the first shape here, but it lets a run of k spaces start a match
 * attempt at each of its k positions, so a chapter carrying a long
 * whitespace run that no class attribute follows costs O(n^2) - 1.8s at 64k
 * spaces in the browser. Anchoring it with `(?<!\s)` removed the cost but
 * not the ambiguity CodeQL reports on the Python mirror
 * (`py/polynomial-redos`, #949), so the repetition is gone from the pattern
 * instead. A literal has nothing to backtrack over.
 */
const CLASS_OPEN_RE = /class="/gi;

/**
 * One character at a time, so the whitespace walk agrees with `\s+` exactly
 * rather than approximately.
 */
const WS_RE = /\s/;

function isPasteClass(token: string): boolean {
    return PASTE_CLASS_RES.some((pattern) => pattern.test(token));
}

/**
 * Remove paste-cruft class tokens, keeping every other one.
 *
 * An attribute whose tokens are all cruft is removed entirely, as is an
 * empty `class=""`; one with survivors is rewritten with them. Each
 * changed attribute counts once, as the all-or-nothing rule did.
 *
 * Reproduces what the regular expression it replaced accepted, which is
 * load-bearing in two places a quick reading misses. An occurrence with no
 * whitespace in front of it is not an attribute of the tag being read, so
 * it is skipped by its OPENING rather than by its whole span - skipping the
 * span would swallow a real attribute nested inside the value, as
 * `class="\nclass=""` does. And the value ends at the next quote, because
 * `[^"]*` could not cross one either; with no next quote there is no match
 * here and none later, since any later opening would itself contain one.
 */
function stripPasteClasses(text: string): [string, number] {
    const out: string[] = [];
    let count = 0;
    let cursor = 0;

    CLASS_OPEN_RE.lastIndex = 0;
    let opening = CLASS_OPEN_RE.exec(text);
    while (opening !== null) {
        const start = opening.index;
        const afterQuote = start + opening[0].length;
        let run = start;
        while (run > cursor && WS_RE.test(text[run - 1])) run -= 1;

        if (run === start) {
            CLASS_OPEN_RE.lastIndex = afterQuote;
            opening = CLASS_OPEN_RE.exec(text);
            continue;
        }

        const closing = text.indexOf('"', afterQuote);
        if (closing === -1) break;

        const tokens = text.slice(afterQuote, closing).split(/\s+/).filter(Boolean);
        const kept = tokens.filter((token) => !isPasteClass(token));
        out.push(text.slice(cursor, run));
        if (kept.length > 0 && kept.length === tokens.length) {
            out.push(text.slice(run, closing + 1));
        } else {
            count += 1;
            if (kept.length > 0) {
                out.push(`${text.slice(run, start)}class="${kept.join(" ")}"`);
            }
        }
        cursor = closing + 1;
        CLASS_OPEN_RE.lastIndex = cursor;
        opening = CLASS_OPEN_RE.exec(text);
    }

    out.push(text.slice(cursor));
    return [out.join(""), count];
}

/**
 * Remove the debris a Word or browser copy-paste leaves behind: empty
 * tags, style and class attributes, conditional and plain comments,
 * Word namespace tags, and bare span/div wrappers.
 *
 * The rules match case-insensitively, and tag casing is preserved rather
 * than normalised. That was this port's one deliberate divergence: the
 * Python rules were case-sensitive and its walker lower-cased END tags
 * only, so `<SPAN>a</SPAN>` came back as the unbalanced `<SPAN>a`, and
 * Word emits exactly the uppercase tags this function exists for.
 * Mirroring the bug would have shipped it to the offline build. #934
 * fixed the backend the same way, so this is now plain parity rather than
 * a divergence.
 *
 * The class rule is per-token: a token is dropped only when it matches a
 * known paste-cruft shape, so a structural class survives (#818). Until
 * then it removed EVERY class attribute, which could not tell `MsoNormal`
 * from the `dedication` / `epigraph` / `part` wrappers the project's own
 * exporter writes and a book's `custom_css` styles.
 *
 * Known issue still carried over: the `div` / `span` rules delete those
 * tags whatever attributes they carry, so an exporter wrapper is removed
 * before its class matters (#948).
 */
export function fixHtmlArtifacts(text: string): [string, number] {
    let count = 0;
    let fixed = text;
    // Order matters and mirrors the Python exactly: the class rule runs
    // BEFORE the span/div rules, so a `<span class="MsoNormal">` is counted
    // once for its class and once for its tag, as it is on the backend.
    const rules: Array<[RegExp, string] | Transform> = [
        // `[^>]*` cannot consume the `>` that follows it and `\s*` cannot
        // consume the `<`, so backtracking is bounded despite the nested
        // quantifier the linter flags; the shape mirrors the Python rule.
        // eslint-disable-next-line security/detect-unsafe-regex
        [/<(\w+)(\s[^>]*)?>(\s*)<\/\1>/gi, "$3"],
        [/\s+style="[^"]*"/gi, ""],
        [/\s+style='[^']*'/gi, ""],
        stripPasteClasses,
        [/<!--\[if[^>]*>[\s\S]*?<!\[endif\]-->/g, ""],
        [/<!--[\s\S]*?-->/g, ""],
        [/<\/?[owm]:[^>]*>/gi, ""],
        [/<\/?span[^>]*>/gi, ""],
        [/<\/?div[^>]*>/gi, ""],
    ];
    for (const rule of rules) {
        const [next, n] = Array.isArray(rule)
            ? replaceCounting(fixed, rule[0], rule[1])
            : rule(fixed);
        fixed = next;
        count += n;
    }
    return [fixed, count];
}

/**
 * Markup, comments, declarations and character references - everything
 * a text transform must be kept away from.
 *
 * A tag's attribute list is matched as quoted values or unquoted
 * non-`>` characters, never as a plain `[^>]*` run: a `>` inside a
 * quoted value does not end the tag. Getting that wrong split
 * `<img alt="a>b" src="x.png"/>` into a tag and a "text node" of
 * `b" src="x.png"/>`, and the text fixes then rewrote the attributes -
 * typographic quotes in `alt`, a space inserted into the filename in
 * `src` (#941). The backend has no such gap; its walker is `HTMLParser`,
 * which tracks quoting itself.
 *
 * The linter flags the alternation under a `*` as a backtracking risk.
 * It is not: the three branches are disjoint on their first character
 * (`"`, `'`, and a class excluding both), so no input can match two of
 * them. Measured on an unterminated tag carrying 40 000 attributes: 4 ms.
 */
const NON_TEXT_RE =
    // eslint-disable-next-line security/detect-unsafe-regex
    /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>|&#?\w+;/g;

/** Whether the text carries markup ANYWHERE, not only at its start. */
export function looksLikeHtml(text: string): boolean {
    return /<[a-zA-Z/][^>]*>/.test(text);
}

/**
 * Run `transform` over the text nodes only, re-emitting markup verbatim.
 *
 * Plain text takes the direct path, so the standalone endpoint's normal
 * case is unaffected. A quote opened in one text node and closed after
 * an intervening tag is not paired across the boundary - each node
 * starts fresh, the same narrow limitation the backend documents.
 *
 * `fragmentTransform` is the variant used on the text-node path, for a
 * fix whose behaviour differs between a whole document and a fragment
 * (`fixWhitespace`'s per-line trailing trim; see #939). It defaults to
 * `transform`, so a fix that does not care passes one callable.
 */
export function applyToTextNodes(
    text: string,
    transform: Transform,
    fragmentTransform: Transform = transform,
): [string, number] {
    if (!looksLikeHtml(text)) return transform(text);
    const chunks: string[] = [];
    let count = 0;
    let cursor = 0;
    NON_TEXT_RE.lastIndex = 0;
    for (let match = NON_TEXT_RE.exec(text); match; match = NON_TEXT_RE.exec(text)) {
        if (match.index > cursor) {
            const [fixed, n] = fragmentTransform(text.slice(cursor, match.index));
            chunks.push(fixed);
            count += n;
        }
        chunks.push(match[0]);
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) {
        const [fixed, n] = fragmentTransform(text.slice(cursor));
        chunks.push(fixed);
        count += n;
    }
    return [chunks.join(""), count];
}

/**
 * Apply every enabled fix, in the order the endpoint applies them.
 *
 * @param text The manuscript text, plain or with embedded markup.
 * @param options Which fixes to run, and the language whose quote
 * characters to use. Everything defaults to on.
 */
export function sanitizeText(text: string, options: SanitizeOptions = {}): SanitizeResult {
    const {
        language = "de",
        fixInvisible = true,
        fixQuoteMarks = true,
        fixSpaces = true,
        fixDashMarks = true,
        fixEllipses = true,
        fixHtml = true,
    } = options;

    let result = text;
    const fixes: SanitizeFixCounts = {};
    const run = (key: keyof SanitizeFixCounts, transform: Transform) => {
        const [fixed, n] = transform(result);
        result = fixed;
        fixes[key] = n;
    };

    if (fixInvisible) run("invisible_chars", fixInvisibleChars);
    if (fixQuoteMarks) {
        run("quotes", (value) => applyToTextNodes(value, (part) => fixQuotes(part, language)));
    }
    if (fixSpaces) {
        run("whitespace", (value) =>
            applyToTextNodes(value, fixWhitespace, (part) =>
                fixWhitespace(part, false),
            ),
        );
    }
    if (fixDashMarks) run("dashes", fixDashes);
    if (fixEllipses) run("ellipsis", fixEllipsis);
    if (fixHtml) run("html_artifacts", fixHtmlArtifacts);

    const total = Object.values(fixes).reduce((sum, n) => sum + (n ?? 0), 0);
    return {
        original: text,
        sanitized: result,
        total_fixes: total,
        fixes,
        changed: result !== text,
    };
}

/** {@link sanitizeText} plus a line-by-line diff for the preview UI. */
export function sanitizePreview(
    text: string,
    options: SanitizeOptions = {},
): SanitizePreviewResult {
    const result = sanitizeText(text, options);
    const originalLines = result.original.split("\n");
    const sanitizedLines = result.sanitized.split("\n");
    const diff: SanitizeDiffLine[] = [];
    for (let i = 0; i < Math.max(originalLines.length, sanitizedLines.length); i += 1) {
        const before = originalLines[i] ?? "";
        const after = sanitizedLines[i] ?? "";
        if (before === after) {
            diff.push({line: i + 1, type: "unchanged", text: before});
            continue;
        }
        if (before) diff.push({line: i + 1, type: "removed", text: before});
        if (after) diff.push({line: i + 1, type: "added", text: after});
    }
    return {...result, diff};
}
