import { describe, it, expect, vi, beforeEach } from "vitest";

import {
    importFile,
    OfflineNotSupportedError,
    UnknownFormatError,
} from "./importRouter";

const {
    importMarkdownAsChapter,
    importTextAsChapter,
    importHtmlAsChapter,
    importFullBackup,
    parseMediumZip,
    importParsed,
    getApp,
} = vi.hoisted(() => ({
    importMarkdownAsChapter: vi.fn(async () => ({
        bookId: "b1",
        bookTitle: "Md",
        chapterId: "c1",
        chapterTitle: "Md",
        createdBook: true,
    })),
    importTextAsChapter: vi.fn(async () => ({
        bookId: "b2",
        bookTitle: "Txt",
        chapterId: "c2",
        chapterTitle: "Txt",
        createdBook: true,
    })),
    importHtmlAsChapter: vi.fn(async () => ({
        bookId: "b3",
        bookTitle: "Html",
        chapterId: "c3",
        chapterTitle: "Html",
        createdBook: true,
    })),
    importFullBackup: vi.fn(async () => ({
        imported: { books: 2, articles: 1 },
        skipped: {},
    })),
    parseMediumZip: vi.fn(async () => ({
        preview: { items: [{ filename: "p1.html" }, { filename: "p2.html" }] },
        parsed: new Map(),
    })),
    importParsed: vi.fn(async () => ({ imported_count: 2 })),
    getApp: vi.fn(async () => ({ app: { default_language: "de" } })),
}));

vi.mock("./chapterImporters", () => ({
    importMarkdownAsChapter,
    importTextAsChapter,
    importHtmlAsChapter,
}));
vi.mock("../export/backupImport", () => ({ importFullBackup }));
vi.mock("../medium-import/clientImport", () => ({ parseMediumZip, importParsed }));
vi.mock("../storage", () => ({
    getStorage: () => ({ settings: { getApp } }),
}));

function file(name: string): File {
    return new File(["x"], name);
}

beforeEach(() => vi.clearAllMocks());

describe("importFile routing", () => {
    it("routes markdown/text/html to the chapter importers", async () => {
        const target = { kind: "new-book" } as const;
        expect((await importFile(file("a.md"), "markdown")).kind).toBe(
            "chapter",
        );
        expect(importMarkdownAsChapter).toHaveBeenCalledWith(
            expect.any(File),
            target,
        );
        expect((await importFile(file("a.txt"), "text")).kind).toBe("chapter");
        expect(importTextAsChapter).toHaveBeenCalled();
        expect((await importFile(file("a.html"), "html")).kind).toBe("chapter");
        expect(importHtmlAsChapter).toHaveBeenCalled();
    });

    it("passes an existing-book target through", async () => {
        await importFile(file("a.md"), "markdown", {
            target: { kind: "existing-book", bookId: "x" },
        });
        expect(importMarkdownAsChapter).toHaveBeenCalledWith(expect.any(File), {
            kind: "existing-book",
            bookId: "x",
        });
    });

    it("routes json-backup to importFullBackup", async () => {
        const out = await importFile(file("b.json"), "json-backup");
        expect(out.kind).toBe("backup");
        expect(importFullBackup).toHaveBeenCalled();
    });

    it("routes medium-zip through parse + import-all of the preview", async () => {
        const out = await importFile(file("m.zip"), "medium-zip", { now: 42 });
        expect(out.kind).toBe("medium");
        expect(parseMediumZip).toHaveBeenCalledWith(expect.any(File), 42);
        expect(importParsed).toHaveBeenCalledWith(
            expect.anything(),
            ["p1.html", "p2.html"],
            expect.objectContaining({ defaultLanguage: "de" }),
        );
    });

    it("throws OfflineNotSupportedError for bgb", async () => {
        await expect(importFile(file("x.bgb"), "bgb")).rejects.toBeInstanceOf(
            OfflineNotSupportedError,
        );
    });

    it("throws UnknownFormatError for unknown", async () => {
        await expect(importFile(file("x.pdf"), "unknown")).rejects.toBeInstanceOf(
            UnknownFormatError,
        );
    });
});
