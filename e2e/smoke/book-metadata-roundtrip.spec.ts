/**
 * Book metadata save / reload round-trip tests.
 *
 * This spec exists to catch an entire class of bugs that unit
 * tests miss because they only check one layer at a time:
 *
 *   - Schema migration gaps (field exists in DB but not in
 *     Pydantic, so PATCH silently drops it)
 *   - Wrong serialization (list persisted as a JSON string and
 *     the client sees the raw string on reload)
 *   - Validators that strip user input on save
 *   - Default values that overwrite user input on reload
 *   - Type coercion bugs (int vs str vs float)
 *   - Non-ASCII encoding mishaps
 *
 * The Keywords feature already shipped this class of bug once
 * (the Pydantic schema exposed ``keywords: str | None`` while
 * the DB stored a JSON array, so the API client had to
 * parse/stringify manually in the form). A round-trip test
 * would have flagged it immediately.
 *
 * Pattern per field: PATCH the field with a known value, GET
 * the book, assert the value equals what was sent. Done at the
 * HTTP level on purpose - this is a backend contract test that
 * happens to run inside the Playwright runner so it stays next
 * to the other smoke tests. No browser mounting needed.
 */

import {test, expect, createBook} from "../fixtures/base";

const API = "http://localhost:8000/api";

interface BookData {
    id: string;
    [key: string]: unknown;
}

async function getBook(id: string): Promise<BookData> {
    const res = await fetch(`${API}/books/${id}`);
    if (!res.ok) throw new Error(`GET book: ${res.status} ${await res.text()}`);
    return res.json();
}

async function patchBook(id: string, patch: Record<string, unknown>): Promise<BookData> {
    const res = await fetch(`${API}/books/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`PATCH book: ${res.status} ${await res.text()}`);
    return res.json();
}

async function assertRoundTrip(
    bookId: string,
    field: string,
    value: unknown,
): Promise<void> {
    const patchResponse = await patchBook(bookId, {[field]: value});
    // The PATCH response should already reflect the new value.
    expect(patchResponse[field]).toEqual(value);
    // Fresh GET must also return it. This catches "PATCH echoes
    // the request but the persistence layer dropped it" bugs.
    const fetched = await getBook(bookId);
    expect(fetched[field]).toEqual(value);
}

test.describe("Book metadata round-trip - basic string fields", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip Basic");
        bookId = book.id;
    });

    test("title with non-ASCII characters survives save and reload", async () => {
        await assertRoundTrip(bookId, "title", "Schöne neue Welt");
    });

    test("author with umlauts, dash and hyphen survives round-trip", async () => {
        await assertRoundTrip(bookId, "author", "Müller-Lüdenscheidt");
    });

    test("subtitle, description, genre round-trip", async () => {
        await assertRoundTrip(bookId, "subtitle", "Eine dystopische Geschichte");
        await assertRoundTrip(
            bookId,
            "description",
            "Die längere Buchbeschreibung mit Umlauten (ä ö ü ß), " +
                "Sonderzeichen (\" ' - –) und Emoji 🎭.",
        );
        await assertRoundTrip(bookId, "genre", "science-fiction");
    });

    test("language round-trip with a non-default code", async () => {
        await assertRoundTrip(bookId, "language", "fr");
    });

    test("series and series_index round-trip as string and int", async () => {
        await assertRoundTrip(bookId, "series", "Die Foundation-Reihe");
        await assertRoundTrip(bookId, "series_index", 3);
    });
});

test.describe("Book metadata round-trip - publisher and identifiers", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip Publishing");
        bookId = book.id;
    });

    test("publisher metadata round-trips every field", async () => {
        await assertRoundTrip(bookId, "edition", "2. Auflage");
        await assertRoundTrip(bookId, "publisher", "Beispiel-Verlag GmbH");
        await assertRoundTrip(bookId, "publisher_city", "München");
        await assertRoundTrip(bookId, "publish_date", "2026-04-15");
    });

    test("ISBN fields (ebook, paperback, hardcover) round-trip", async () => {
        await assertRoundTrip(bookId, "isbn_ebook", "978-3-16-148410-0");
        await assertRoundTrip(bookId, "isbn_paperback", "978-3-16-148411-7");
        await assertRoundTrip(bookId, "isbn_hardcover", "978-3-16-148412-4");
    });

    test("ASIN fields (ebook, paperback, hardcover) round-trip", async () => {
        await assertRoundTrip(bookId, "asin_ebook", "B0BCDEFGHIJ");
        await assertRoundTrip(bookId, "asin_paperback", "B0BKLMNOPQR");
        await assertRoundTrip(bookId, "asin_hardcover", "B0BSTUVWXYZ");
    });
});

test.describe("Book metadata round-trip - list[str] fields", () => {
    // This describe specifically pins the JSON-string-vs-list bug
    // class. Every list field must round-trip as an array with
    // the same values in the same order - not as a JSON-encoded
    // string, and empty lists must come back as [] not null.
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip List Fields");
        bookId = book.id;
    });

    test("keywords non-empty round-trips as list[str], not as a JSON string", async () => {
        const keywords = ["science fiction", "dystopia", "Müller"];
        await patchBook(bookId, {keywords});
        const fetched = await getBook(bookId);
        // Strict assertion: must be an array, not a string.
        expect(Array.isArray(fetched.keywords)).toBe(true);
        expect(fetched.keywords).toEqual(keywords);
        // Regression pin for the specific bug that shipped once.
        expect(typeof fetched.keywords).not.toBe("string");
    });

    test("keywords empty list round-trips as [], not null", async () => {
        // Seed a non-empty list first so we can prove the PATCH
        // with [] actually clears it.
        await patchBook(bookId, {keywords: ["alpha", "beta"]});
        expect((await getBook(bookId)).keywords).toEqual(["alpha", "beta"]);

        await patchBook(bookId, {keywords: []});
        const fetched = await getBook(bookId);
        expect(fetched.keywords).toEqual([]);
        expect(fetched.keywords).not.toBeNull();
    });

    test("keywords preserves order across round-trip", async () => {
        const ordered = ["zebra", "apple", "mango", "kiwi"];
        await patchBook(bookId, {keywords: ordered});
        const fetched = await getBook(bookId);
        // Array equality enforces order.
        expect(fetched.keywords).toEqual(ordered);
    });

    test("audiobook_skip_chapter_types non-empty round-trips as list[str]", async () => {
        const types = ["preface", "foreword", "also_by_author"];
        await patchBook(bookId, {audiobook_skip_chapter_types: types});
        const fetched = await getBook(bookId);
        expect(Array.isArray(fetched.audiobook_skip_chapter_types)).toBe(true);
        expect(fetched.audiobook_skip_chapter_types).toEqual(types);
    });

    test("audiobook_skip_chapter_types empty list round-trips as []", async () => {
        await patchBook(bookId, {audiobook_skip_chapter_types: ["preface"]});
        await patchBook(bookId, {audiobook_skip_chapter_types: []});
        const fetched = await getBook(bookId);
        expect(fetched.audiobook_skip_chapter_types).toEqual([]);
        expect(fetched.audiobook_skip_chapter_types).not.toBeNull();
    });
});

test.describe("Book metadata round-trip - bool fields with default false", () => {
    // Bool fields with a ``default=False`` server-side are
    // classic default-overwrites-user-input bug territory. If the
    // PATCH response is correct but the GET returns the default,
    // the bug is in the serializer or the schema's from_attributes
    // loader.
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip Booleans");
        bookId = book.id;
    });

    test("ai_assisted=true persists across save and reload", async () => {
        const patch = await patchBook(bookId, {ai_assisted: true});
        expect(patch.ai_assisted).toBe(true);

        const fetched = await getBook(bookId);
        expect(fetched.ai_assisted).toBe(true);
    });

    test("ai_assisted=false stays false on reload", async () => {
        // Already the default, but the regression pin is that
        // setting it explicitly does not trip a coercion bug.
        await patchBook(bookId, {ai_assisted: true});
        await patchBook(bookId, {ai_assisted: false});
        const fetched = await getBook(bookId);
        expect(fetched.ai_assisted).toBe(false);
    });

    test("audiobook_overwrite_existing=true persists across reload", async () => {
        const patch = await patchBook(bookId, {audiobook_overwrite_existing: true});
        expect(patch.audiobook_overwrite_existing).toBe(true);

        const fetched = await getBook(bookId);
        expect(fetched.audiobook_overwrite_existing).toBe(true);
    });
});

test.describe("Book metadata round-trip - TTS and audiobook configuration", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip TTS");
        bookId = book.id;
    });

    test("all TTS string fields round-trip together", async () => {
        const config = {
            tts_engine: "edge-tts",
            tts_voice: "de-DE-KatjaNeural",
            tts_language: "de-DE",
            tts_speed: "1.25",
            audiobook_merge: "merged",
            audiobook_filename: "mein-hoerbuch",
        };
        await patchBook(bookId, config);
        const fetched = await getBook(bookId);
        for (const [key, value] of Object.entries(config)) {
            expect(fetched[key], `field: ${key}`).toBe(value);
        }
    });
});

test.describe("Book metadata round-trip - ms-tools numeric thresholds", () => {
    // Numeric thresholds include one float, so this also covers
    // the int-vs-float coercion edge.
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip Thresholds");
        bookId = book.id;
    });

    test("ms_tools_max_sentence_length (int) round-trips", async () => {
        await assertRoundTrip(bookId, "ms_tools_max_sentence_length", 35);
    });

    test("ms_tools_repetition_window (int) round-trips", async () => {
        await assertRoundTrip(bookId, "ms_tools_repetition_window", 75);
    });

    test("ms_tools_max_filler_ratio (float) round-trips with decimal precision", async () => {
        await assertRoundTrip(bookId, "ms_tools_max_filler_ratio", 0.035);
    });
});

test.describe("Book metadata round-trip - marketing long-form fields", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Round Trip Marketing");
        bookId = book.id;
    });

    test("html_description with HTML and non-ASCII round-trips", async () => {
        const html =
            "<p><strong>Ein dunkler Roman</strong> über die <em>Unendlichkeit</em>.</p>" +
            "<p>Mit Umlauten: ä ö ü ß und einem &bdquo;Zitat&ldquo;.</p>";
        await assertRoundTrip(bookId, "html_description", html);
    });

    test("backpage_description long text with newlines round-trips", async () => {
        const text =
            "Erste Zeile mit Umlauten: öäü.\n" +
            "Zweite Zeile mit Anführungszeichen \"test\".\n" +
            "Dritte Zeile mit Emoji 📖🔥.";
        await assertRoundTrip(bookId, "backpage_description", text);
    });

    test("backpage_author_bio round-trips", async () => {
        await assertRoundTrip(
            bookId,
            "backpage_author_bio",
            "Geboren 1975 in München. Autor von über 20 Romanen.",
        );
    });

    test("custom_css round-trips with braces and colons", async () => {
        // CSS contains characters (braces, colons, semicolons)
        // that some JSON/YAML escapers mishandle.
        const css = "body { font-family: 'Crimson Pro', serif; color: #2a1f15; }";
        await assertRoundTrip(bookId, "custom_css", css);
    });
});

test.describe("Book metadata round-trip - combined update with every supported field", () => {
    // One giant PATCH that touches every round-trippable field,
    // then a single GET and a deep equality check. This catches
    // cross-field interaction bugs that per-field tests miss.
    test("combined PATCH preserves every field in a single GET", async () => {
        const book = await createBook("Round Trip Combined");

        const fullUpdate: Record<string, unknown> = {
            title: "Großer Roman",
            subtitle: "Der vollständige Test",
            author: "Testauter Müller",
            language: "de",
            genre: "science-fiction",
            series: "Serie Nr. 1",
            series_index: 2,
            description: "Beschreibung mit Umlauten ä ö ü ß.",
            edition: "1. Auflage",
            publisher: "Test-Verlag",
            publisher_city: "München",
            publish_date: "2026-05-01",
            isbn_ebook: "978-3-16-148410-0",
            isbn_paperback: "978-3-16-148411-7",
            isbn_hardcover: "978-3-16-148412-4",
            asin_ebook: "B0BCDEFGHIJ",
            asin_paperback: "B0BKLMNOPQR",
            asin_hardcover: "B0BSTUVWXYZ",
            keywords: ["alpha", "beta", "gamma"],
            html_description: "<p>HTML mit <strong>ä ö ü</strong></p>",
            backpage_description: "Rückseite.",
            backpage_author_bio: "Biografie.",
            custom_css: "body { color: red; }",
            ai_assisted: true,
            tts_engine: "edge-tts",
            tts_voice: "de-DE-KatjaNeural",
            tts_language: "de-DE",
            tts_speed: "1.0",
            audiobook_merge: "merged",
            audiobook_filename: "combined-test",
            audiobook_overwrite_existing: true,
            audiobook_skip_chapter_types: ["preface", "foreword"],
            ms_tools_max_sentence_length: 30,
            ms_tools_repetition_window: 60,
            ms_tools_max_filler_ratio: 0.04,
        };

        await patchBook(book.id, fullUpdate);
        const fetched = await getBook(book.id);

        for (const [key, value] of Object.entries(fullUpdate)) {
            expect(fetched[key], `field: ${key}`).toEqual(value);
        }
    });
});
