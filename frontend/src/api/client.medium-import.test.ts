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
import { api, ApiError, type MediumImportResponse } from "./client";

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
