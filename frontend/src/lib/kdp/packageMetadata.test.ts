import {describe, it, expect} from "vitest";

import {
    isbnForFormat,
    isPrintFormat,
    KDP_MAX_KEYWORDS,
    kdpFormatLabel,
    kdpLanguageName,
    kdpPackageMetadata,
} from "./packageMetadata";

const AT = new Date("2026-10-10T04:00:00.000Z");

const BOOK = {
    id: "b1",
    title: "Mein Buch",
    subtitle: "Ein Untertitel",
    author: "Asterios Raptis",
    description: "Beschreibung",
    language: "de",
    series: "Reihe",
    series_index: 2,
    categories: ["Fiction", "Mystery"],
    keywords: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
    isbn_ebook: "ISBN-E",
    isbn_paperback: "ISBN-P",
};

describe("kdpPackageMetadata", () => {
    it("builds the listing fields the KDP form asks for", () => {
        const doc = kdpPackageMetadata(BOOK, {
            formatKind: "paperback",
            trimSize: "6x9",
            appVersion: "0.60.0",
            generatedAt: AT,
        });
        expect(doc.title).toBe("Mein Buch");
        expect(doc.subtitle).toBe("Ein Untertitel");
        expect(doc.author).toBe("Asterios Raptis");
        expect(doc.description).toBe("Beschreibung");
        expect(doc.categories).toEqual(["Fiction", "Mystery"]);
        expect(doc.series).toBe("Reihe");
        expect(doc.series_number).toBe(2);
        expect(doc.generated_by).toBe("Bibliogon v0.60.0");
        expect(doc.generated_at).toBe("2026-10-10T04:00:00.000Z");
    });

    it("caps keywords at seven, which is KDP's own limit", () => {
        const doc = kdpPackageMetadata(BOOK, {
            formatKind: "ebook",
            appVersion: "0",
            generatedAt: AT,
        });
        expect(doc.keywords).toHaveLength(KDP_MAX_KEYWORDS);
        expect(doc.keywords).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    });

    it("writes a trim only for the print formats", () => {
        // An eBook reflows. A trim in its metadata would be a claim about
        // a page size it does not have - and the wizard carries a trim in
        // its state whichever format is selected, so the filter has to be
        // here rather than at the call site.
        const ebook = kdpPackageMetadata(BOOK, {
            formatKind: "ebook",
            trimSize: "6x9",
            appVersion: "0",
            generatedAt: AT,
        });
        expect(ebook.trim_size).toBeNull();
        for (const kind of ["paperback", "hardcover"]) {
            const print = kdpPackageMetadata(BOOK, {
                formatKind: kind,
                trimSize: "7x10",
                appVersion: "0",
                generatedAt: AT,
            });
            expect(print.trim_size).toBe("7x10");
        }
    });

    it("picks the ISBN that matches the format, with hardcover falling back", () => {
        expect(isbnForFormat(BOOK, "ebook")).toBe("ISBN-E");
        expect(isbnForFormat(BOOK, "paperback")).toBe("ISBN-P");
        // One ISBN bought for print, used for both bindings - the common
        // case, and the Python's behaviour.
        expect(isbnForFormat(BOOK, "hardcover")).toBe("ISBN-P");
        expect(isbnForFormat({...BOOK, isbn_hardcover: "ISBN-H"}, "hardcover")).toBe(
            "ISBN-H",
        );
        expect(isbnForFormat({}, "paperback")).toBeNull();
        // Empty string is "unset", not an ISBN of length zero.
        expect(isbnForFormat({isbn_paperback: ""}, "paperback")).toBeNull();
    });

    it("maps language codes to the names KDP's form expects", () => {
        expect(kdpLanguageName("de")).toBe("German");
        expect(kdpLanguageName("ja")).toBe("Japanese");
        // Unmapped passes through: a code KDP happens to accept beats an
        // empty field.
        expect(kdpLanguageName("sv")).toBe("sv");
        // No language at all means the Python's default, not "".
        expect(kdpLanguageName(null)).toBe("German");
    });

    it("labels the format and lets an unknown one through", () => {
        expect(kdpFormatLabel("ebook")).toBe("eBook");
        expect(kdpFormatLabel("paperback")).toBe("Taschenbuch");
        expect(kdpFormatLabel("hardcover")).toBe("Hardcover");
        expect(kdpFormatLabel("audiobook")).toBe("audiobook");
        expect(isPrintFormat("ebook")).toBe(false);
        expect(isPrintFormat("hardcover")).toBe(true);
    });

    it("turns absent fields into empty strings and nulls, never undefined", () => {
        // The document is JSON-serialised straight into the ZIP; an
        // undefined field DISAPPEARS from the output, so a reader cannot
        // tell "unset" from "this build forgot it".
        const doc = kdpPackageMetadata({}, {
            formatKind: "paperback",
            appVersion: "0",
            generatedAt: AT,
        });
        expect(doc.title).toBe("");
        expect(doc.subtitle).toBe("");
        expect(doc.categories).toEqual([]);
        expect(doc.keywords).toEqual([]);
        expect(doc.series).toBeNull();
        expect(doc.series_number).toBeNull();
        expect(doc.page_count).toBeNull();
        expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    });
});
