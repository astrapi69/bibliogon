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
