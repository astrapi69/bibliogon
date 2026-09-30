import { describe, expect, it } from "vitest";

import {
    applyToTextNodes,
    fixDashes,
    fixEllipsis,
    fixHtmlArtifacts,
    fixInvisibleChars,
    fixQuotes,
    fixWhitespace,
    looksLikeHtml,
    sanitizePreview,
    sanitizeText,
} from "./sanitizeText";

// Every expectation below was produced by running the real
// plugins/bibliogon-plugin-ms-tools sanitizer, not by reading it.

describe("individual fixes", () => {
    it("removes invisible characters and counts each one", () => {
        expect(fixInvisibleChars("a b​c﻿")).toEqual(["a bc", 3]);
    });

    it("pairs double quotes and classifies apostrophes", () => {
        expect(fixQuotes('Er sagte "hallo" und ging.')).toEqual([
            "Er sagte „hallo“ und ging.",
            2,
        ]);
        // Between two letters an apostrophe is always a right single
        // quote; leading/trailing positions pick the inner pair.
        expect(fixQuotes("Anna's")[0]).toBe("Anna’s");
        expect(fixQuotes("Peters'")[0]).toBe("Peters‘");
    });

    it("leaves a standalone apostrophe pair alone", () => {
        expect(fixQuotes("Mehrfach '' Apostrophe ''")).toEqual(["Mehrfach '' Apostrophe ''", 0]);
    });

    it("uses the language's quote characters", () => {
        expect(fixQuotes('"x"', "en")[0]).toBe("“x”");
        expect(fixQuotes('"x"', "es")[0]).toBe("«x»");
        // An unknown language falls back to English rather than failing.
        expect(fixQuotes('"x"', "kl")[0]).toBe("“x”");
    });

    it("collapses spaces, fixes punctuation spacing and trims lines", () => {
        expect(fixWhitespace("Nur   Leerzeichen   am Ende   ")).toEqual([
            "Nur Leerzeichen am Ende",
            4,
        ]);
        expect(fixWhitespace("hier .Und hier")[0]).toBe("hier. Und hier");
    });

    it("does not split a decimal number", () => {
        expect(fixWhitespace("Pi ist 3.14 und e ist 2.71")).toEqual([
            "Pi ist 3.14 und e ist 2.71",
            0,
        ]);
    });

    it("puts a space before an accented letter after punctuation", () => {
        expect(fixWhitespace("Satzende.Ärger")).toEqual(["Satzende. Ärger", 1]);
    });

    it("caps runs of blank lines at two", () => {
        expect(fixWhitespace("a\n\n\n\n\nb")).toEqual(["a\n\n\nb", 1]);
    });

    it("converts hyphen runs to the right dash", () => {
        expect(fixDashes("Ein --- langer -- Gedankenstrich")).toEqual([
            "Ein — langer – Gedankenstrich",
            2,
        ]);
    });

    it("converts three dots to an ellipsis", () => {
        expect(fixEllipsis("Warten...")).toEqual(["Warten…", 1]);
    });

    it("strips Word debris: empty tags, style/class, span and div", () => {
        // In isolation the empty-tag rule keeps the tag's inner whitespace
        // (`$3`); only the later whitespace pass collapses it away, so the
        // full-pipeline result below is the one a caller actually sees.
        expect(fixHtmlArtifacts('<span></span><div>  </div>Text')[0]).toBe("  Text");
        // The collapsed single space survives: it sits at the end of a
        // FRAGMENT (the div's body), which the whitespace fix no longer
        // trims (#939). The backend produces the same string.
        expect(sanitizeText('<span></span><div>  </div>Text').sanitized).toBe(" Text");
        expect(
            fixHtmlArtifacts('<p class="MsoNormal" style="color:red">Hallo</p>')[0],
        ).toBe("<p>Hallo</p>");
    });

    // Word emits uppercase tags, which is the input this exists for. Was
    // this port's one divergence until #934 fixed the backend the same
    // way; now a plain parity pin.
    it("strips uppercase wrappers at both ends (#934)", () => {
        expect(fixHtmlArtifacts("<DIV>Uppercase</DIV>")[0]).toBe("Uppercase");
    });
});

describe("HTML awareness", () => {
    it("detects markup anywhere, not only at the start", () => {
        expect(looksLikeHtml("Text mit <em>Tag</em> mittendrin")).toBe(true);
        expect(looksLikeHtml("5 < 7 und 9 > 3")).toBe(false);
    });

    it("leaves attribute values untouched while fixing the prose", () => {
        const [fixed] = applyToTextNodes(
            '<img src="a.png" alt="Der \'Titel\'"> im Text',
            (part) => fixQuotes(part),
        );
        expect(fixed).toContain(`alt="Der 'Titel'"`);
    });

    it("re-emits character references verbatim", () => {
        const result = sanitizeText('Entity &amp; bleibt "roh"');
        expect(result.sanitized).toBe("Entity &amp; bleibt „roh“");
    });

    it("takes the direct path for text without markup", () => {
        expect(applyToTextNodes("Nur Text", (part) => fixQuotes(part))).toEqual(["Nur Text", 0]);
    });
});

describe("sanitizeText", () => {
    it("applies every fix and reports per-fix counts", () => {
        const result = sanitizeText('Er sagte "hallo"...');
        expect(result.sanitized).toBe("Er sagte „hallo“…");
        expect(result.fixes.quotes).toBe(2);
        expect(result.fixes.ellipsis).toBe(1);
        expect(result.total_fixes).toBe(3);
        expect(result.changed).toBe(true);
    });

    it("reports no change for text that needs none", () => {
        const result = sanitizeText("Nur Text ohne alles");
        expect(result.changed).toBe(false);
        expect(result.total_fixes).toBe(0);
        expect(result.original).toBe("Nur Text ohne alles");
    });

    it("handles empty input", () => {
        expect(sanitizeText("")).toMatchObject({sanitized: "", total_fixes: 0, changed: false});
    });

    it("honours a disabled fix", () => {
        const result = sanitizeText("Warten...", {fixEllipses: false});
        expect(result.sanitized).toBe("Warten...");
        expect(result.fixes.ellipsis).toBeUndefined();
    });

    it("keeps table markup while fixing the cell text", () => {
        const result = sanitizeText('<table><tr><td>Zelle "A"</td></tr></table>');
        expect(result.sanitized).toBe("<table><tr><td>Zelle „A“</td></tr></table>");
    });
});

describe("sanitizePreview", () => {
    it("marks changed lines as removed plus added, unchanged ones once", () => {
        const {diff} = sanitizePreview('Zeile eins\nZwei "mit" Quotes');
        expect(diff).toEqual([
            {line: 1, type: "unchanged", text: "Zeile eins"},
            {line: 2, type: "removed", text: 'Zwei "mit" Quotes'},
            {line: 2, type: "added", text: "Zwei „mit“ Quotes"},
        ]);
    });

    it("carries the sanitize result alongside the diff", () => {
        const result = sanitizePreview("Warten...");
        expect(result.sanitized).toBe("Warten…");
        expect(result.diff).toHaveLength(2);
    });
});

// Mirrors TestFragmentBoundaries in the Python suite. fixWhitespace ends
// with a per-line trailing trim, which is right for a whole document and
// wrong for a text node: its last line is usually cut mid-sentence where
// the next tag begins, so the trim ate a space that was carrying meaning
// (#939).
describe("fragment boundaries (#939)", () => {
    it("keeps the space before an inline tag", () => {
        const html = "<p>Ein <em>Satz</em> mit <strong>Markup</strong>.</p>";
        expect(sanitizeText(html).sanitized).toBe(html);
    });

    it("keeps the space before an embedded image in markdown prose", () => {
        const markdown =
            'Ein Satz mit einem Bild <img src="assets/figures/a.png" alt="Bild" /> im Text.';
        expect(sanitizeText(markdown).sanitized).toBe(markdown);
    });

    it("keeps the space after an end tag", () => {
        expect(sanitizeText("<p><em>Kursiv</em> danach.</p>").sanitized).toContain(
            "</em> danach.",
        );
    });

    it("still trims a line that really does end inside a text node", () => {
        const result = sanitizeText("<p>Erste Zeile   \nZweite Zeile</p>").sanitized;
        expect(result).toContain("Erste Zeile\nZweite Zeile");
    });

    it("keeps the per-line trim for plain text with no markup", () => {
        expect(sanitizeText("Zeile eins   \nZeile zwei   ").sanitized).toBe(
            "Zeile eins\nZeile zwei",
        );
    });

    it("still collapses double spaces inside a fragment", () => {
        expect(sanitizeText("<p>Zu    viele Leerzeichen <em>hier</em>.</p>").sanitized).toContain(
            "Zu viele Leerzeichen <em>hier</em>.",
        );
    });

    it("leaves one trailing space when a document ends in whitespace after a tag", () => {
        // Accepted trade-off. The final text node is a fragment like any
        // other, and the walker cannot tell mid-stream that it is the
        // last one, so its trailing whitespace is kept. A single space at
        // the very end of a document is cosmetic; eating a space in the
        // middle of a sentence was not. The backend behaves identically.
        expect(sanitizeText("<p>Ende.</p>   ").sanitized).toBe("<p>Ende.</p> ");
    });

    it("stays idempotent", () => {
        const html = '<p>Ein <em>Satz</em> mit "Zitat" <img src="a.png" alt="B" /> Ende.</p>';
        const once = sanitizeText(html).sanitized;
        expect(sanitizeText(once).sanitized).toBe(once);
    });
});

// The port finds markup with a regex where the backend uses HTMLParser.
// A plain `[^>]*` attribute run ends the tag at the first `>`, even one
// inside a quoted value, and the text fixes then rewrote the attributes
// (#941). Every expectation is the backend's output for the same input.
describe("tags carrying '>' inside an attribute value (#941)", () => {
    it("leaves a double-quoted value containing '>' alone", () => {
        const html = '<img alt="a>b" src="x.png"/>Text';
        expect(sanitizeText(html).sanitized).toBe(html);
    });

    it("leaves a single-quoted value containing '>' alone", () => {
        const html = "<img alt='a>b' src='x.png'/>Text";
        expect(sanitizeText(html).sanitized).toBe(html);
    });

    it("leaves the other quote style nested inside a value alone", () => {
        const html = "<p title=\"Er sagte 'hallo'\">Text</p>";
        expect(sanitizeText(html).sanitized).toBe(html);
    });

    it("leaves a URL with an ampersand alone", () => {
        const html = '<a href="x?a=1&b=2">Link</a>';
        expect(sanitizeText(html).sanitized).toBe(html);
    });

    it("leaves an unquoted value alone", () => {
        const html = "<p class=foo>Text</p>";
        expect(sanitizeText(html).sanitized).toBe(html);
    });
});
