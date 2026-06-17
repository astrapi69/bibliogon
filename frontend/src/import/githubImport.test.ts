import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./detectFormat", () => ({ detectImportFormat: vi.fn() }));
vi.mock("./importRouter", () => ({ importFile: vi.fn() }));

import { detectImportFormat } from "./detectFormat";
import { importFile } from "./importRouter";
import {
    GitHubNotFoundError,
    GitHubRateLimitError,
    downloadGitHubFile,
    listGitHubContents,
    parseGitHubUrl,
    runGitHubImport,
    type GitHubEntry,
} from "./githubImport";

const detect = vi.mocked(detectImportFormat);
const doImport = vi.mocked(importFile);

interface FakeResInit {
    status?: number;
    headers?: Record<string, string>;
    json?: unknown;
    blob?: Blob;
}

function fakeRes(init: FakeResInit): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (k: string) => init.headers?.[k.toLowerCase()] ?? null,
        },
        json: async () => init.json,
        blob: async () => init.blob ?? new Blob([""]),
    } as unknown as Response;
}

function fileEntry(name: string, path = name): GitHubEntry {
    return {
        name,
        path,
        type: "file",
        size: 10,
        download_url: `https://raw.example/${path}`,
        sha: "sha",
    };
}

describe("parseGitHubUrl", () => {
    it("parses a plain repo URL", () => {
        expect(parseGitHubUrl("https://github.com/octo/cat")).toEqual({
            owner: "octo",
            repo: "cat",
            ref: undefined,
            path: "",
        });
    });

    it("strips a trailing .git", () => {
        expect(parseGitHubUrl("https://github.com/octo/cat.git")?.repo).toBe("cat");
    });

    it("parses tree URLs with a ref + sub-path", () => {
        expect(parseGitHubUrl("https://github.com/octo/cat/tree/main/docs/guide")).toEqual({
            owner: "octo",
            repo: "cat",
            ref: "main",
            path: "docs/guide",
        });
    });

    it("parses the owner/repo shorthand with a sub-path", () => {
        expect(parseGitHubUrl("octo/cat/docs")).toEqual({
            owner: "octo",
            repo: "cat",
            ref: undefined,
            path: "docs",
        });
    });

    it("rejects non-github hosts and malformed input", () => {
        expect(parseGitHubUrl("https://gitlab.com/octo/cat")).toBeNull();
        expect(parseGitHubUrl("not a url")).toBeNull();
        expect(parseGitHubUrl("")).toBeNull();
        expect(parseGitHubUrl("octo")).toBeNull();
    });
});

describe("listGitHubContents", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("maps entries and sorts dirs before files", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                fakeRes({
                    json: [
                        {
                            name: "z.md",
                            path: "z.md",
                            type: "file",
                            size: 1,
                            download_url: "u",
                            sha: "a",
                        },
                        {
                            name: "sub",
                            path: "sub",
                            type: "dir",
                            size: 0,
                            download_url: null,
                            sha: "b",
                        },
                        {
                            name: "a.md",
                            path: "a.md",
                            type: "file",
                            size: 2,
                            download_url: "u2",
                            sha: "c",
                        },
                    ],
                }),
            ),
        );
        const entries = await listGitHubContents({ owner: "o", repo: "r", path: "" }, "");
        expect(entries.map((e) => e.name)).toEqual(["sub", "a.md", "z.md"]);
        expect(entries[0].type).toBe("dir");
    });

    it("throws GitHubNotFoundError on 404", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ status: 404 })),
        );
        await expect(
            listGitHubContents({ owner: "o", repo: "r", path: "" }, ""),
        ).rejects.toBeInstanceOf(GitHubNotFoundError);
    });

    it("throws GitHubRateLimitError on 403 with no remaining quota", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                fakeRes({
                    status: 403,
                    headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" },
                }),
            ),
        );
        const err = await listGitHubContents({ owner: "o", repo: "r", path: "" }, "").catch(
            (e) => e,
        );
        expect(err).toBeInstanceOf(GitHubRateLimitError);
        expect((err as GitHubRateLimitError).resetAt).toBeInstanceOf(Date);
    });
});

describe("downloadGitHubFile", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("returns a File named after the entry", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ blob: new Blob(["# Hi"], { type: "text/markdown" }) })),
        );
        const file = await downloadGitHubFile(fileEntry("intro.md"));
        expect(file).toBeInstanceOf(File);
        expect(file.name).toBe("intro.md");
        expect(await file.text()).toBe("# Hi");
    });
});

describe("runGitHubImport", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => fakeRes({ blob: new Blob(["body"], { type: "text/markdown" }) })),
        );
        detect.mockReset();
        doImport.mockReset();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("groups chapter files into one book and reports counts", async () => {
        detect.mockResolvedValue("markdown");
        doImport
            .mockResolvedValueOnce({
                kind: "chapter",
                format: "markdown",
                result: {
                    bookId: "book-1",
                    bookTitle: "A",
                    chapterId: "c1",
                    chapterTitle: "A",
                    createdBook: true,
                },
            })
            .mockResolvedValueOnce({
                kind: "chapter",
                format: "markdown",
                result: {
                    bookId: "book-1",
                    bookTitle: "A",
                    chapterId: "c2",
                    chapterTitle: "B",
                    createdBook: false,
                },
            });

        const summary = await runGitHubImport([fileEntry("a.md"), fileEntry("b.md")]);

        expect(summary.importedCount).toBe(2);
        expect(summary.createdBookId).toBe("book-1");
        // First import creates a new book; second appends to it.
        expect(doImport.mock.calls[0][2]).toEqual({ target: { kind: "new-book" } });
        expect(doImport.mock.calls[1][2]).toEqual({
            target: { kind: "existing-book", bookId: "book-1" },
        });
    });

    it("skips unknown formats and records errors without aborting", async () => {
        detect.mockResolvedValueOnce("unknown").mockResolvedValueOnce("markdown");
        doImport.mockRejectedValueOnce(new Error("boom"));

        const summary = await runGitHubImport([fileEntry("readme.bin"), fileEntry("x.md")]);

        expect(summary.skippedCount).toBe(1);
        expect(summary.errorCount).toBe(1);
        expect(summary.importedCount).toBe(0);
        expect(summary.items.map((i) => i.status)).toEqual(["skipped", "error"]);
    });
});
