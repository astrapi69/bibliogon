import {beforeEach, describe, expect, it, vi} from "vitest";

import {runStyleCheck} from "./runStyleCheck";

const getStorageMock = vi.fn();
const checkMock = vi.fn();
const getBookMock = vi.fn();

/** A dexie-mode storage whose book carries the given overrides. */
function dexieWithBook(book: Record<string, unknown> | Error) {
    getBookMock.mockImplementation(() =>
        book instanceof Error ? Promise.reject(book) : Promise.resolve(book),
    );
    getStorageMock.mockReturnValue({
        mode: "dexie",
        books: {get: (id: string) => getBookMock(id)},
    });
}

/** 30 words, so it is long by the default limit of 25 but not by 40. */
const THIRTY_WORDS = `${"wort ".repeat(29)}wort.`;

vi.mock("../../storage", () => ({
    getStorage: () => getStorageMock(),
}));

vi.mock("../../api/client", () => ({
    api: {msTools: {check: (...args: unknown[]) => checkMock(...args)}},
}));

describe("runStyleCheck", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("asks the backend in api mode", async () => {
        getStorageMock.mockReturnValue({mode: "api"});
        checkMock.mockResolvedValue({findings: [], total_words: 3});

        const result = await runStyleCheck("Das ist einfach.", "de", "book-1");

        expect(checkMock).toHaveBeenCalledWith("Das ist einfach.", "de", "book-1");
        expect(result.total_words).toBe(3);
    });

    it("computes in the browser in dexie mode, with no /api call", async () => {
        dexieWithBook({});

        const result = await runStyleCheck("Das ist eigentlich einfach.", "de");

        expect(checkMock).not.toHaveBeenCalled();
        expect(result.findings.some((f) => f.type === "filler_word")).toBe(true);
    });

    it("passes the language through to the browser checker", async () => {
        dexieWithBook({});

        // "actually" is an English filler; the German tables do not have it,
        // so a hard-coded language would report nothing here.
        const result = await runStyleCheck("This is actually simple.", "en");

        expect(
            result.findings.some(
                (f) => f.type === "filler_word" && f.word === "actually",
            ),
        ).toBe(true);
    });

    it("applies the book's sentence-length override (#1042)", async () => {
        dexieWithBook({ms_tools_max_sentence_length: 40});

        const result = await runStyleCheck(THIRTY_WORDS, "de", "book-1");

        expect(getBookMock).toHaveBeenCalledWith("book-1");
        expect(result.long_sentence_count).toBe(0);
    });

    it("falls back to the default limit when the book sets none", async () => {
        dexieWithBook({ms_tools_max_sentence_length: null});

        const result = await runStyleCheck(THIRTY_WORDS, "de", "book-1");

        expect(result.long_sentence_count).toBe(1);
        expect(result.findings[0].max_words).toBe(25);
    });

    it("applies the book's repetition window", async () => {
        dexieWithBook({ms_tools_repetition_window: 100});
        const far = `Garten ${"der ".repeat(60)}Garten.`;

        expect(
            (await runStyleCheck(far, "de", "book-1")).repetition_count,
        ).toBe(1);

        dexieWithBook({});
        expect(
            (await runStyleCheck(far, "de", "book-1")).repetition_count,
        ).toBe(0);
    });

    it("does not read the book when there is no id", async () => {
        dexieWithBook({ms_tools_max_sentence_length: 40});

        await runStyleCheck(THIRTY_WORDS, "de");

        expect(getBookMock).not.toHaveBeenCalled();
    });

    it("still checks when the book cannot be read", async () => {
        // The defaults are what the user would have got anyway, so a
        // failed read is not worth failing the whole check over.
        dexieWithBook(new Error("gone"));

        const result = await runStyleCheck(THIRTY_WORDS, "de", "book-1");

        expect(result.long_sentence_count).toBe(1);
    });
});
