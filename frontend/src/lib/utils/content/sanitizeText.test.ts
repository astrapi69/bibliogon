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
        expect(sanitizeText('<span></span><div>  </div>Text').sanitized).toBe("Text");
        expect(
            fixHtmlArtifacts('<p class="MsoNormal" style="color:red">Hallo</p>')[0],
        ).toBe("<p>Hallo</p>");
    });

    // The Python rules are case-sensitive and its walker lowercases END
    // tags only, so `<DIV>x</DIV>` comes out half-stripped as `<DIV>x`.
    // Word emits uppercase tags, which is the input this exists for.
    it("strips uppercase wrappers at both ends (deliberate divergence, #934)", () => {
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
