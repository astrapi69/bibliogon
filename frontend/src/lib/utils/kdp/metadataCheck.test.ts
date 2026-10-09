/**
 * Parity pins for the KDP metadata checker mirror (#738).
 *
 * The expected (field, severity) pairs come from
 * `bibliogon_kdp/metadata_checker.py`, which is the authority: the
 * backend path still runs it, so a divergence here would mean the same
 * book passes in one storage mode and fails in the other.
 */
import { describe, it, expect } from "vitest";

import { checkMetadataCompleteness, KDP_MAX_BISAC_CODES } from "./metadataCheck";

/** A book that satisfies every rule, so each case can break exactly one. */
const COMPLETE = {
    title: "Das Muster",
    subtitle: "Ein Roman",
    author: "Aster",
    language: "de",
    description: "Ein Buch über Muster.",
    keywords: ["muster", "roman", "spannung"],
    cover_image: "cover.png",
    isbn_ebook: "978-3-16-148410-0",
    publisher: "Selbstverlag",
    backpage_description: "Klappentext.",
    categories: ["Literature & Fiction"],
    bisac_codes: ["FIC022020"],
    chapters: [{ id: "c1" }],
};

const fieldsWithSeverity = (book: Record<string, unknown>) =>
    checkMetadataCompleteness(book)
        .issues.map((i) => `${i.field}:${i.severity}`)
        .sort();

describe("checkMetadataCompleteness", () => {
    it("reports nothing for a complete book", () => {
        const result = checkMetadataCompleteness(COMPLETE);
        expect(result.issues).toEqual([]);
        expect(result.complete).toBe(true);
        expect(result.error_count).toBe(0);
        expect(result.warning_count).toBe(0);
    });

    it("blocks on the four required fields and on no chapters", () => {
        expect(fieldsWithSeverity({})).toEqual(
            [
                "title:error",
                "author:error",
                "language:error",
                "description:error",
                "keywords:warning",
                "cover_image:warning",
                "isbn:warning",
                "publisher:warning",
                "backpage_description:warning",
                "subtitle:warning",
                "categories:warning",
                "bisac_codes:warning",
                "chapters:error",
            ].sort(),
        );
    });

    it("accepts html_description in place of description", () => {
        const { description: _drop, ...rest } = COMPLETE;
        expect(fieldsWithSeverity({ ...rest, html_description: "<p>Text</p>" })).toEqual([]);
    });

    it("treats whitespace-only required fields as missing", () => {
        expect(fieldsWithSeverity({ ...COMPLETE, title: "   " })).toEqual(["title:error"]);
    });

    it("warns below three keywords and accepts the legacy JSON-string form", () => {
        expect(fieldsWithSeverity({ ...COMPLETE, keywords: ["one", "two"] })).toEqual([
            "keywords:warning",
        ]);
        expect(fieldsWithSeverity({ ...COMPLETE, keywords: '["a","b","c"]' })).toEqual([]);
        // Unparseable JSON degrades to "no keywords" rather than throwing.
        expect(fieldsWithSeverity({ ...COMPLETE, keywords: "not json" })).toEqual([
            "keywords:warning",
        ]);
    });

    it("blocks a malformed BISAC code and warns above the cap", () => {
        expect(fieldsWithSeverity({ ...COMPLETE, bisac_codes: ["fic022020"] })).toEqual([
            "bisac_codes:error",
        ]);
        const tooMany = Array.from({ length: KDP_MAX_BISAC_CODES + 1 }, () => "FIC022020");
        expect(fieldsWithSeverity({ ...COMPLETE, bisac_codes: tooMany })).toEqual([
            "bisac_codes:warning",
        ]);
    });

    it("counts errors and warnings the way the result object does", () => {
        const result = checkMetadataCompleteness({ title: "Nur ein Titel" });
        expect(result.complete).toBe(false);
        expect(result.error_count).toBe(result.issues.filter((i) => i.severity === "error").length);
        expect(result.warning_count).toBe(
            result.issues.filter((i) => i.severity === "warning").length,
        );
    });
});
