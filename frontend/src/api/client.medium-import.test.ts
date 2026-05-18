/**
 * Tests for api.mediumImport.importZip XHR helper.
 *
 * The helper is the codebase's only XMLHttpRequest call. These tests
 * stub the global XMLHttpRequest constructor so the helper can be
 * exercised without a backend, covering the four code paths that
 * matter:
 *   - 2xx response -> resolves with parsed JSON
 *   - non-2xx with JSON {detail, stacktrace} -> rejects with ApiError
 *     carrying the detail
 *   - non-2xx with non-JSON body -> rejects with ApiError carrying
 *     the status text
 *   - network failure -> rejects with ApiError(status=0)
 *
 * Also pins that upload.onprogress is invoked with the byte counts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    api,
    ApiError,
    type MediumImportCancelPreviewResponse,
    type MediumImportPreviewResponse,
    type MediumImportResponse,
} from "./client";

interface MockXHR {
    open: (method: string, url: string) => void;
    send: (body: BodyInit) => void;
    onload: ((this: MockXHR) => void) | null;
    onerror: ((this: MockXHR) => void) | null;
    upload: { onprogress: ((event: ProgressEvent) => void) | null };
    status: number;
    statusText: string;
    responseText: string;
}

function mockXhr(opts: { status: number; responseText: string; statusText?: string }) {
    const xhr: MockXHR = {
        open: vi.fn(),
        send: vi.fn(),
        onload: null,
        onerror: null,
        upload: { onprogress: null },
        status: opts.status,
        statusText: opts.statusText ?? "",
        responseText: opts.responseText,
    };
    return xhr;
}

const sampleResponse: MediumImportResponse = {
    imported_count: 2,
    skipped_count: 1,
    errored_count: 0,
    imported: [
        {
            id: "art-1",
            title: "First post",
            canonical_url: "https://medium.com/@x/p1",
            warnings: [],
        },
        {
            id: "art-2",
            title: "Second post",
            canonical_url: "https://medium.com/@x/p2",
            warnings: ["image-fetch-timeout"],
        },
    ],
    skipped: [
        {
            filename: "posts/p3.html",
            canonical_url: "https://medium.com/@x/p3",
            existing_article_id: "art-pre-existing",
        },
    ],
    errored: [],
};

afterEach(() => {
    vi.restoreAllMocks();
});

function makeFile(name = "archive.zip"): File {
    return new File([new Uint8Array([1, 2, 3, 4])], name, { type: "application/zip" });
}

describe("api.mediumImport.importZip", () => {
    it("resolves with parsed JSON on 200 + fires upload progress", async () => {
        const xhr = mockXhr({
            status: 200,
            responseText: JSON.stringify(sampleResponse),
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const progress: Array<[number, number]> = [];
        const promise = api.mediumImport.importZip(makeFile(), (loaded, total) => {
            progress.push([loaded, total]);
        });

        // Simulate XHR firing upload-progress + onload from inside the
        // promise body — has to wait for `xhr.send()` to register the
        // handlers, which is synchronous in the helper.
        expect(xhr.send).toHaveBeenCalledTimes(1);
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);
        xhr.onload?.call(xhr);

        const result = await promise;
        expect(result).toEqual(sampleResponse);
        expect(progress).toEqual([
            [50, 100],
            [100, 100],
        ]);
        expect(xhr.open).toHaveBeenCalledWith("POST", "/api/medium-import/import");
    });

    it("rejects with ApiError carrying the backend detail on 400 JSON body", async () => {
        const xhr = mockXhr({
            status: 400,
            responseText: JSON.stringify({
                detail: "Uploaded file is empty",
                stacktrace: "trace…",
            }),
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.importZip(makeFile());
        xhr.onload?.call(xhr);

        await expect(promise).rejects.toBeInstanceOf(ApiError);
        await promise.catch((err: ApiError) => {
            expect(err.status).toBe(400);
            expect(err.detail).toBe("Uploaded file is empty");
            expect(err.endpoint).toBe("/api/medium-import/import");
        });
    });

    it("falls back to statusText when the error body is not JSON", async () => {
        const xhr = mockXhr({
            status: 500,
            responseText: "<html>Internal Server Error</html>",
            statusText: "Internal Server Error",
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.importZip(makeFile());
        xhr.onload?.call(xhr);

        await promise.catch((err: ApiError) => {
            expect(err.status).toBe(500);
            expect(err.detail).toBe("Internal Server Error");
        });
    });

    it("rejects with status=0 ApiError on network failure", async () => {
        const xhr = mockXhr({ status: 0, responseText: "" });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.importZip(makeFile());
        xhr.onerror?.call(xhr);

        await promise.catch((err: ApiError) => {
            expect(err.status).toBe(0);
            expect(err.detail).toContain("Netzwerkfehler");
        });
    });

    it("does not require the onProgress callback", async () => {
        const xhr = mockXhr({
            status: 200,
            responseText: JSON.stringify(sampleResponse),
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.importZip(makeFile());
        // No upload.onprogress should have been wired up.
        expect(xhr.upload.onprogress).toBeNull();
        xhr.onload?.call(xhr);
        await expect(promise).resolves.toEqual(sampleResponse);
    });
});

// ---------------------------------------------------------------------------
// MEDIUM-IMPORT-V2-01 Phase 2: preview / importSelected / cancelPreview
// ---------------------------------------------------------------------------

const samplePreview: MediumImportPreviewResponse = {
    preview_id: "abc123",
    total_posts: 2,
    items: [
        {
            filename: "01_oldest_tech.html",
            title: "Migrate a maven project to Gradle",
            subtitle: "",
            author: "Asterios Raptis",
            published_at: "2020-02-04T15:46:58.820Z",
            canonical_url: "https://medium.com/@x/2f276c4a070e",
            detected_language: "en",
            classification: "article",
            existing_article_id: null,
            body_preview: "",
            warnings: [],
        },
        {
            filename: "comment_short_reply.html",
            title: "Re: thanks",
            subtitle: "",
            author: "Asterios Raptis",
            published_at: null,
            canonical_url: "",
            detected_language: "en",
            classification: "comment",
            existing_article_id: null,
            body_preview: "Thanks for pointing that out — you're right.",
            warnings: [],
        },
    ],
    errored: [],
    expires_at: Date.now() / 1000 + 1800,
};

describe("api.mediumImport.preview", () => {
    it("resolves with parsed preview JSON on 200 + fires upload progress", async () => {
        const xhr = mockXhr({
            status: 200,
            responseText: JSON.stringify(samplePreview),
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const progress: Array<[number, number]> = [];
        const promise = api.mediumImport.preview(makeFile(), (loaded, total) => {
            progress.push([loaded, total]);
        });

        expect(xhr.send).toHaveBeenCalledTimes(1);
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);
        xhr.onload?.call(xhr);

        const result = await promise;
        expect(result).toEqual(samplePreview);
        expect(result.preview_id).toBe("abc123");
        expect(result.items).toHaveLength(2);
        expect(progress).toEqual([
            [50, 100],
            [100, 100],
        ]);
        expect(xhr.open).toHaveBeenCalledWith("POST", "/api/medium-import/preview");
    });

    it("rejects with ApiError carrying the backend detail on 400 JSON body", async () => {
        const xhr = mockXhr({
            status: 400,
            responseText: JSON.stringify({
                detail: "ZIP does not contain a 'posts/' directory; this does not look like a Medium HTML export.",
            }),
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.preview(makeFile());
        xhr.onload?.call(xhr);

        await expect(promise).rejects.toBeInstanceOf(ApiError);
        await promise.catch((err: ApiError) => {
            expect(err.status).toBe(400);
            expect(err.detail).toContain("posts/");
            expect(err.endpoint).toBe("/api/medium-import/preview");
        });
    });

    it("falls back to 'Vorschau fehlgeschlagen' when error body is not JSON", async () => {
        const xhr = mockXhr({
            status: 500,
            responseText: "<html>Internal Server Error</html>",
            statusText: "",
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.preview(makeFile());
        xhr.onload?.call(xhr);

        await promise.catch((err: ApiError) => {
            expect(err.status).toBe(500);
            expect(err.detail).toBe("Vorschau fehlgeschlagen");
        });
    });

    it("rejects with status=0 ApiError on network failure", async () => {
        const xhr = mockXhr({ status: 0, responseText: "" });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.preview(makeFile());
        xhr.onerror?.call(xhr);

        await promise.catch((err: ApiError) => {
            expect(err.status).toBe(0);
            expect(err.detail).toContain("Netzwerkfehler");
        });
    });

    it("does not require the onProgress callback", async () => {
        const xhr = mockXhr({
            status: 200,
            responseText: JSON.stringify(samplePreview),
        });
        vi.stubGlobal("XMLHttpRequest", function () { return xhr; });

        const promise = api.mediumImport.preview(makeFile());
        expect(xhr.upload.onprogress).toBeNull();
        xhr.onload?.call(xhr);
        await expect(promise).resolves.toEqual(samplePreview);
    });
});

describe("api.mediumImport.importSelected", () => {
    it("POSTs the selection to /import/{previewId} and returns parsed response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => sampleResponse,
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await api.mediumImport.importSelected("abc123", [
            "01_oldest_tech.html",
            "02_german_philosophical.html",
        ]);

        expect(result).toEqual(sampleResponse);
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/medium-import/import/abc123");
        expect(opts.method).toBe("POST");
        expect(JSON.parse(opts.body as string)).toEqual({
            selected_filenames: ["01_oldest_tech.html", "02_german_philosophical.html"],
        });
    });

    it("rejects with ApiError on 404 (expired preview)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: "Not Found",
            json: async () => ({
                detail: "Preview not found or expired; please upload again",
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            api.mediumImport.importSelected("expired-id", ["foo.html"]),
        ).rejects.toBeInstanceOf(ApiError);
        await api.mediumImport
            .importSelected("expired-id", ["foo.html"])
            .catch((err: ApiError) => {
                expect(err.status).toBe(404);
                expect(err.detail).toContain("expired");
            });
    });

    it("rejects with ApiError on 400 (empty selection)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            json: async () => ({
                detail: "selected_filenames must contain at least one entry",
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await api.mediumImport.importSelected("abc123", []).catch((err: ApiError) => {
            expect(err.status).toBe(400);
            expect(err.detail).toContain("at least one");
        });
    });
});

describe("api.mediumImport.cancelPreview", () => {
    it("sends DELETE /preview/{previewId} and returns {deleted: true}", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () =>
                ({ deleted: true } as MediumImportCancelPreviewResponse),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await api.mediumImport.cancelPreview("abc123");
        expect(result).toEqual({ deleted: true });
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/medium-import/preview/abc123");
        expect(opts.method).toBe("DELETE");
    });

    it("returns {deleted: false} when the id is unknown (still HTTP 200)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () =>
                ({ deleted: false } as MediumImportCancelPreviewResponse),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await api.mediumImport.cancelPreview("does-not-exist");
        expect(result.deleted).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ASYNC-IMPORT-PROGRESS-01 Phase 2: importSelectedAsync / getJobResult /
// cancelJob
// ---------------------------------------------------------------------------

describe("api.mediumImport.importSelectedAsync", () => {
    it("POSTs the selection to /import/async/{previewId} and returns {job_id, status}", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 202,
            json: async () => ({ job_id: "job-123", status: "pending" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await api.mediumImport.importSelectedAsync("preview-x", [
            "a.html",
            "b.html",
        ]);

        expect(result).toEqual({ job_id: "job-123", status: "pending" });
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/medium-import/import/async/preview-x");
        expect(opts.method).toBe("POST");
        expect(JSON.parse(opts.body as string)).toEqual({
            selected_filenames: ["a.html", "b.html"],
        });
    });

    it("rejects with ApiError on 404 expired preview", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: "Not Found",
            json: async () => ({ detail: "Preview not found or expired" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            api.mediumImport.importSelectedAsync("expired", ["a.html"]),
        ).rejects.toBeInstanceOf(ApiError);
    });
});

describe("api.mediumImport.getJobResult", () => {
    it("GETs /jobs/{id}/result and returns the parsed ImportResponse", async () => {
        const responseBody = {
            imported_count: 1,
            skipped_count: 0,
            errored_count: 0,
            imported: [
                {
                    id: "art-1",
                    title: "Hello",
                    canonical_url: "https://x",
                    warnings: [],
                },
            ],
            skipped: [],
            errored: [],
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => responseBody,
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await api.mediumImport.getJobResult("job-77");
        expect(result).toEqual(responseBody);
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/medium-import/jobs/job-77/result");
        expect(opts?.method || "GET").toBe("GET");
    });

    it("rejects with ApiError on 409 not-yet-completed", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 409,
            statusText: "Conflict",
            json: async () => ({
                detail: {
                    code: "job_not_completed",
                    message: "Job is running",
                    status: "running",
                },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await api.mediumImport.getJobResult("job-busy").catch((err: ApiError) => {
            expect(err.status).toBe(409);
            // The conflict-payload shape is preserved via detailBody.
            expect(err.detailBody).toEqual({
                code: "job_not_completed",
                message: "Job is running",
                status: "running",
            });
        });
    });
});

describe("api.mediumImport.cancelJob", () => {
    it("DELETEs the generic /export/jobs/{id} endpoint (NOT a medium-import-specific path)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 204,
            json: async () => ({}),
        });
        vi.stubGlobal("fetch", fetchMock);

        await api.mediumImport.cancelJob("job-cx");
        const [url, opts] = fetchMock.mock.calls[0];
        // Critical: cancelJob hits the shared export-jobs route,
        // NOT a medium-import-namespaced one.
        expect(url).toBe("/api/export/jobs/job-cx");
        expect(opts.method).toBe("DELETE");
    });

    it("rejects with ApiError on 404 unknown job", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: "Not Found",
            json: async () => ({ detail: "Job not found" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            api.mediumImport.cancelJob("missing"),
        ).rejects.toBeInstanceOf(ApiError);
    });
});
