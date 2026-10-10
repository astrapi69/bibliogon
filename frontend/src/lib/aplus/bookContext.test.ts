/**
 * #890: the parts of the context assembly a recording cannot state.
 *
 * `context.parity.test.ts` pins this module against output recorded
 * from the Python side, which is the authority on WHAT it produces.
 * What a record cannot express is the contract the cache key carries
 * (a changed field or ruleset version has to change the hash) or the
 * invariants the marker table has to hold to work at all. Those live
 * here.
 */

import {describe, expect, it} from "vitest";

import {
    JUVENILE_TEXT_MARKERS,
    type BookContextSource,
    buildBookContext,
    computeSourceHash,
    findMissingFields,
} from "./bookContext";

const BOOK: BookContextSource = {
    id: "book-1",
    title: "Ein Buch",
    subtitle: "Ein Untertitel",
    author: "Asterios Raptis",
    language: "de",
    description: "Eine Beschreibung.",
    bisac_codes: ["FIC000000"],
    categories: ["Fiction"],
    keywords: ["Katze"],
};

const VERSION = "4";

describe("the juvenile-marker table's own invariants", () => {
    it("holds every marker lowercase", () => {
        // The match lowercases the haystack, never the needle, so an
        // uppercase entry here could never match anything. The parity
        // record cannot see this: it only probes markers that work.
        const offenders = Object.entries(JUVENILE_TEXT_MARKERS).flatMap(
            ([language, markers]) =>
                markers
                    .filter((marker) => marker !== marker.toLowerCase())
                    .map((marker) => `${language}: ${marker}`),
        );
        expect(offenders).toEqual([]);
    });

    it("holds no marker that is blank or padded", () => {
        const offenders = Object.values(JUVENILE_TEXT_MARKERS)
            .flat()
            .filter((marker) => marker !== marker.trim() || !marker);
        expect(offenders).toEqual([]);
    });
});

describe("computeSourceHash as a cache key", () => {
    it("is stable for the same context", async () => {
        const context = buildBookContext(BOOK);
        expect(await computeSourceHash(context, VERSION)).toBe(
            await computeSourceHash(buildBookContext(BOOK), VERSION),
        );
    });

    it("changes when the ruleset version changes", async () => {
        // A new ruleset means a differently-shaped package, so a row
        // cached under the old one has to miss.
        const context = buildBookContext(BOOK);
        expect(await computeSourceHash(context, "4")).not.toBe(
            await computeSourceHash(context, "5"),
        );
    });

    it.each<[string, Partial<BookContextSource>]>([
        ["title", {title: "Ein anderes Buch"}],
        ["subtitle", {subtitle: "Anders"}],
        ["author", {author: "Jemand anderes"}],
        ["language", {language: "en"}],
        ["description", {description: "Etwas anderes."}],
        ["genre", {genre: "roman"}],
        ["bisac_codes", {bisac_codes: ["FIC000001"]}],
        ["categories", {categories: ["Nonfiction"]}],
        ["keywords", {keywords: ["Hund"]}],
    ])("changes when %s changes", async (_field, patch) => {
        const base = await computeSourceHash(buildBookContext(BOOK), VERSION);
        const changed = await computeSourceHash(
            buildBookContext({...BOOK, ...patch}),
            VERSION,
        );
        expect(changed).not.toBe(base);
    });

    it("does not confuse a field boundary with field content", async () => {
        // Two books whose title and subtitle split the same words at a
        // different point. On a separator a user can type - a space, a
        // comma - these collide into one cache key and the second book
        // is served the first one's package. The unit separator cannot
        // be typed, which is the whole reason it is the separator.
        const early = await computeSourceHash(
            buildBookContext({...BOOK, title: "Die Katze", subtitle: "auf dem Dach"}),
            VERSION,
        );
        const late = await computeSourceHash(
            buildBookContext({...BOOK, title: "Die Katze auf", subtitle: "dem Dach"}),
            VERSION,
        );
        expect(early).not.toBe(late);
    });

    it("is lowercase hex of the full digest", async () => {
        const hash = await computeSourceHash(buildBookContext(BOOK), VERSION);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("buildBookContext tolerates what either storage layer hands it", () => {
    it("reads a list column whether it arrives as JSON text or an array", () => {
        const asText = buildBookContext({...BOOK, keywords: '["a", "b"]'});
        const asArray = buildBookContext({...BOOK, keywords: ["a", "b"]});
        expect(asText.keywords).toEqual(["a", "b"]);
        expect(asArray.keywords).toEqual(asText.keywords);
    });

    it("yields an empty list for a JSON value that is not a list", () => {
        expect(buildBookContext({...BOOK, categories: '{"a": 1}'}).categories)
            .toEqual([]);
    });

    it("keeps a missing optional field null rather than undefined", () => {
        const context = buildBookContext({id: "b", title: "T"});
        expect(context.subtitle).toBeNull();
        expect(context.author).toBeNull();
        expect(context.genre_key).toBeNull();
    });
});

describe("findMissingFields", () => {
    it("is empty for a book that can be generated", () => {
        expect(findMissingFields(BOOK)).toEqual([]);
    });

    it("names author before description when both are missing", () => {
        // The caller renders these in order; author is the cheaper fix.
        expect(findMissingFields({id: "b", title: "T"}).map((m) => m.field))
            .toEqual(["author", "description"]);
    });

    it("treats a whitespace-only author as missing", () => {
        expect(findMissingFields({...BOOK, author: "   "}).map((m) => m.field))
            .toEqual(["author"]);
    });

    it("accepts a description in any of the three columns", () => {
        for (const field of [
            "description",
            "html_description",
            "backpage_description",
        ] as const) {
            const book: BookContextSource = {
                id: "b",
                title: "T",
                author: "A",
                [field]: "Text.",
            };
            expect(findMissingFields(book)).toEqual([]);
        }
    });

    it("treats markup with no text as missing", () => {
        expect(
            findMissingFields({
                ...BOOK,
                description: null,
                html_description: "<p></p>",
            }).map((m) => m.field),
        ).toEqual(["description"]);
    });
});
