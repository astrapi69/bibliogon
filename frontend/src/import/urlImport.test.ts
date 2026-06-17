import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./detectFormat", () => ({ detectImportFormat: vi.fn() }));
vi.mock("./importRouter", () => ({ importFile: vi.fn() }));

import { detectImportFormat } from "./detectFormat";
import { importFile } from "./importRouter";
import { UrlImportError, fetchUrlAsFile, filenameFromUrl, runUrlImport } from "./urlImport";

const detect = vi.mocked(detectImportFormat);
const doImport = vi.mocked(importFile);

function fakeRes(init: {
    status?: number;
    headers?: Record<string, string>;
    blob?: Blob;
}): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k: string) => init.headers?.[k.toLowerCase()] ?? null },
        blob: async () => init.blob ?? new Blob([""]),
    } as unknown as Response;
}

describe("filenameFromUrl", () => {
    it("uses the last path segment", () => {
        expect(filenameFromUrl("https://x.com/a/b/doc.md")).toBe("doc.md");
    });
    it("falls back to 'imported' for a bare host", () => {
        expect(filenameFromUrl("https://x.com")).toBe("imported");
    });
});

describe("fetchUrlAsFile", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("rejects non-http(s) URLs", async () => {
        await expect(fetchUrlAsFile("ftp://x.com/a.md")).rejects.toBeInstanceOf(UrlImportError);
    });

    it("infers an .html extension from the content type when missing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                fakeRes({ headers: { "content-type": "text/html" }, blob: new Blob(["<p>x</p>"]) }),
            ),
        );
        const file = await fetchUrlAsFile("https://x.com/page");
        expect(file.name).toBe("page.html");
    });

    it("wraps a network/CORS failure in UrlImportError", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        await expect(fetchUrlAsFile("https://x.com/a.md")).rejects.toBeInstanceOf(UrlImportError);
    });
});

describe("runUrlImport", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("fetches, detects and imports", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ blob: new Blob(["# Title"], { type: "text/markdown" }) })),
        );
        detect.mockResolvedValue("markdown");
        doImport.mockResolvedValue({
            kind: "chapter",
            format: "markdown",
            result: {
                bookId: "b1",
                bookTitle: "T",
                chapterId: "c",
                chapterTitle: "T",
                createdBook: true,
            },
        });

        const { format, result } = await runUrlImport("https://x.com/title.md");
        expect(format).toBe("markdown");
        expect(result.kind).toBe("chapter");
        expect(doImport).toHaveBeenCalledOnce();
    });

    it("throws when the URL content is an unsupported format", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ blob: new Blob(["x"]) })),
        );
        detect.mockResolvedValue("unknown");
        await expect(runUrlImport("https://x.com/weird.bin")).rejects.toBeInstanceOf(
            UrlImportError,
        );
    });
});

describe("filenameFromUrl edge cases and boundaries", () => {
    it("decodes percent-encoded segments", () => {
        expect(filenameFromUrl("https://x.com/a/my%20doc.md")).toBe("my doc.md");
    });

    it("uses the last segment even with a trailing slash (edge)", () => {
        expect(filenameFromUrl("https://x.com/a/b/")).toBe("b");
    });

    it("returns 'imported' for a bare host with no path (edge)", () => {
        expect(filenameFromUrl("https://x.com")).toBe("imported");
    });

    it("returns 'imported' for an unparseable URL (edge)", () => {
        expect(filenameFromUrl("::::")).toBe("imported");
    });

    it("keeps a long encoded filename (boundary)", () => {
        const name = "a".repeat(80) + ".md";
        expect(filenameFromUrl(`https://x.com/${encodeURIComponent(name)}`)).toBe(name);
    });
});

describe("fetchUrlAsFile edge cases and boundaries", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("throws on a non-ok response (edge)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ status: 404 })),
        );
        await expect(fetchUrlAsFile("https://x.com/a.md")).rejects.toBeInstanceOf(UrlImportError);
    });

    it("rejects an empty / whitespace URL (edge)", async () => {
        await expect(fetchUrlAsFile("   ")).rejects.toBeInstanceOf(UrlImportError);
    });

    it("infers .txt for text/plain without an extension", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                fakeRes({ headers: { "content-type": "text/plain" }, blob: new Blob(["x"]) }),
            ),
        );
        expect((await fetchUrlAsFile("https://x.com/notes")).name).toBe("notes.txt");
    });

    it("defaults to .md when neither URL nor content-type hint a type", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ blob: new Blob(["x"]) })),
        );
        expect((await fetchUrlAsFile("https://x.com/raw")).name).toBe("raw.md");
    });

    it("preserves an existing extension on a long encoded path (boundary)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ blob: new Blob(["x"]) })),
        );
        const name = "laeng & co " + "x".repeat(120) + ".md";
        const file = await fetchUrlAsFile("https://x.com/deep/path/" + encodeURIComponent(name));
        expect(file.name).toBe(name);
    });
});
