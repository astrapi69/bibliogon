/**
 * #743: which path a bulk export takes, pinned at the branch.
 *
 * #1042 shipped because a port assumed what a route supplies. The branch
 * itself is the thing to assert here: offline it must reach the storage
 * seam and fire no `api.*` bulk call, online it must reach the backend and
 * render nothing locally. Asserting the OUTPUT of each mode, not that a
 * helper was called with the right argument.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

// `vi.mock` is hoisted above the file's own consts, so the fakes live
// behind `vi.hoisted` rather than in a top-level `const` the factory
// would read before initialisation.
const mocks = vi.hoisted(() => ({
    booksBulkExport: vi.fn(),
    articlesBulkExport: vi.fn(),
    bookGet: vi.fn(),
    articleGet: vi.fn(),
    storageMode: { mode: "dexie" as "dexie" | "api" },
}));

vi.mock("../../api/client", () => ({
    api: {
        books: { bulkExport: mocks.booksBulkExport },
        articles: { bulkExport: mocks.articlesBulkExport },
    },
}));

vi.mock("../../storage", () => ({
    getStorage: () => ({
        mode: mocks.storageMode.mode,
        books: { get: mocks.bookGet },
        articles: { get: mocks.articleGet },
    }),
}));

import { runArticleBulkExport, runBookBulkExport } from "./bulkExportRun";

const { booksBulkExport, articlesBulkExport, bookGet, articleGet, storageMode } = mocks;

function body(text: string) {
    return JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
}

beforeEach(() => {
    storageMode.mode = "dexie";
    booksBulkExport.mockReset();
    articlesBulkExport.mockReset();
    bookGet.mockReset();
    articleGet.mockReset();
    bookGet.mockImplementation(async (id: string) => ({
        id,
        title: `Buch ${id}`,
        author: "Asterios Raptis",
        language: "de",
        chapters: [
            { id: `${id}-c1`, title: "Kapitel eins", content: body("Anfang."), position: 0 },
        ],
    }));
    articleGet.mockImplementation(async (id: string) => ({
        id,
        title: `Text ${id}`,
        author: "Asterios Raptis",
        language: "de",
        content_json: body(`Inhalt ${id}.`),
    }));
});

async function entriesOf(blob: Blob): Promise<Record<string, Uint8Array>> {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("offline (dexie)", () => {
    it("builds the book archive from the seam without any api call", async () => {
        const { blob, filename } = await runBookBulkExport(["a", "b"], "markdown" as never);
        expect(booksBulkExport).not.toHaveBeenCalled();
        expect(bookGet.mock.calls).toEqual([
            // `true` is the chapter-CONTENT flag: without it the archive
            // would hold titles and no text.
            ["a", true],
            ["b", true],
        ]);
        expect(filename).toMatch(/^books-\d{4}-\d{2}-\d{2}\.zip$/);
        const entries = await entriesOf(blob);
        expect(Object.keys(entries)).toEqual(["buch-a.md", "buch-b.md"]);
        expect(strFromU8(entries["buch-a.md"])).toContain("Anfang.");
    });

    it("builds the article archive in zip mode", async () => {
        const { blob, filename } = await runArticleBulkExport(
            ["x", "y"],
            "markdown",
            "zip",
        );
        expect(articlesBulkExport).not.toHaveBeenCalled();
        expect(filename).toMatch(/^articles-\d{4}-\d{2}-\d{2}\.zip$/);
        const entries = await entriesOf(blob);
        expect(Object.keys(entries)).toEqual(["text-x.md", "text-y.md"]);
    });

    it("builds one document in combined mode, not an archive", async () => {
        const { blob, filename } = await runArticleBulkExport(
            ["x", "y"],
            "markdown",
            "combined",
            undefined,
            "Sammlung",
        );
        expect(filename).toMatch(/^articles-\d{4}-\d{2}-\d{2}\.md$/);
        const text = await blob.text();
        // Each article is a section of the one document, so a combined PDF
        // or DOCX gets one table-of-contents entry per article.
        expect(text).toContain("Text x");
        expect(text).toContain("Text y");
        expect(text).toContain("Inhalt x.");
        expect(text).toContain("Inhalt y.");
    });

    it("reports progress through the zip path", async () => {
        const steps: string[] = [];
        await runArticleBulkExport(["x", "y"], "markdown", "zip", (p) =>
            steps.push(`${p.step}:${p.current}/${p.total}`),
        );
        expect(steps).toEqual(["rendering:0/2", "rendering:1/2", "archiving:2/2"]);
    });
});

describe("online (api)", () => {
    beforeEach(() => {
        storageMode.mode = "api";
    });

    it("hands books to the backend and reads nothing from the seam", async () => {
        booksBulkExport.mockResolvedValue({
            blob: new Blob(["zip"]),
            filename: "books-2026-10-10.zip",
        });
        const result = await runBookBulkExport(["a"], "epub");
        expect(booksBulkExport).toHaveBeenCalledWith(["a"], "epub");
        expect(bookGet).not.toHaveBeenCalled();
        expect(result.filename).toBe("books-2026-10-10.zip");
    });

    it("passes the article mode through instead of deciding locally", async () => {
        // The mode is the backend's to honour online; dropping it here is
        // how "combined" would silently become a ZIP.
        articlesBulkExport.mockResolvedValue({
            blob: new Blob(["doc"]),
            filename: "articles-2026-10-10.pdf",
        });
        await runArticleBulkExport(["x"], "pdf", "combined");
        expect(articlesBulkExport).toHaveBeenCalledWith(["x"], "pdf", "combined");
        expect(articleGet).not.toHaveBeenCalled();
    });
});
