import { describe, it, expect, beforeEach, vi } from "vitest";

import {
    importHtmlAsChapter,
    importMarkdownAsChapter,
    importTextAsChapter,
} from "./chapterImporters";
import type { TipTapDoc } from "../medium-import/walker";

const booksCreate = vi.fn(async (d: { title: string }) => ({
    id: "book-1",
    title: d.title,
}));
const booksGet = vi.fn(async (id: string) => ({ id, title: "Existing Book" }));
const chaptersCreate = vi.fn(
    async (
        _bookId: string,
        d: { title: string; content?: string; position?: number },
    ) => ({ id: "chapter-1", title: d.title, position: d.position }),
);
const chaptersList = vi.fn(async (_bookId: string) => [] as unknown[]);

vi.mock("../storage", () => ({
    getStorage: () => ({
        books: { create: booksCreate, get: booksGet },
        chapters: { create: chaptersCreate, list: chaptersList },
    }),
}));

function file(content: string, name: string): File {
    return new File([content], name);
}

function lastContent(): TipTapDoc {
    const call = chaptersCreate.mock.calls.at(-1);
    return JSON.parse(call![1].content as string) as TipTapDoc;
}

beforeEach(() => {
    vi.clearAllMocks();
    chaptersList.mockResolvedValue([]);
});

describe("importMarkdownAsChapter", () => {
    it("uses the first H1 as the book title and drops it from the body", async () => {
        const result = await importMarkdownAsChapter(
            file("# My Novel\n\nFirst line.", "draft.md"),
            { kind: "new-book" },
        );
        expect(result.createdBook).toBe(true);
        expect(booksCreate).toHaveBeenCalledWith({
            title: "My Novel",
            book_type: "prose",
        });
        const doc = lastContent();
        expect(doc.content[0]).toMatchObject({ type: "paragraph" });
        expect(JSON.stringify(doc)).not.toContain("My Novel");
        expect(JSON.stringify(doc)).toContain("First line.");
    });

    it("falls back to the filename when there is no H1", async () => {
        await importMarkdownAsChapter(file("just text", "ideas.md"), {
            kind: "new-book",
        });
        expect(booksCreate).toHaveBeenCalledWith({
            title: "ideas",
            book_type: "prose",
        });
    });
});

describe("importTextAsChapter", () => {
    it("uses the filename stem as title and splits blank-line blocks", async () => {
        await importTextAsChapter(file("Para one.\n\nPara two.", "notes.txt"), {
            kind: "new-book",
        });
        expect(booksCreate).toHaveBeenCalledWith({
            title: "notes",
            book_type: "prose",
        });
        const doc = lastContent();
        expect(doc.content).toHaveLength(2);
        expect(doc.content[0]).toMatchObject({
            type: "paragraph",
            content: [{ type: "text", text: "Para one." }],
        });
    });
});

describe("importHtmlAsChapter", () => {
    it("uses <title> when present", async () => {
        await importHtmlAsChapter(
            file("<title>Doc Title</title><p>Body.</p>", "page.html"),
            { kind: "new-book" },
        );
        expect(booksCreate).toHaveBeenCalledWith({
            title: "Doc Title",
            book_type: "prose",
        });
    });
});

describe("append to an existing book", () => {
    it("appends a chapter at the end and does not create a book", async () => {
        chaptersList.mockResolvedValue([{ id: "a" }, { id: "b" }]);
        const result = await importTextAsChapter(file("Hi.", "extra.txt"), {
            kind: "existing-book",
            bookId: "book-9",
        });
        expect(booksCreate).not.toHaveBeenCalled();
        expect(chaptersCreate).toHaveBeenCalledWith(
            "book-9",
            expect.objectContaining({ position: 2 }),
        );
        expect(result.createdBook).toBe(false);
        expect(result.bookTitle).toBe("Existing Book");
    });
});
