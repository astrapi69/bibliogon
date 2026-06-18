import {describe, it, expect, vi, beforeEach} from "vitest";
import {api} from "./client";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        statusText: "OK",
    } as Response);
}

function emptyResponse(status = 204) {
    return Promise.resolve({
        ok: true,
        status,
        json: () => Promise.resolve(undefined),
        statusText: "No Content",
    } as Response);
}

function errorResponse(status: number, detail: string) {
    return Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({detail}),
        statusText: "Error",
    } as Response);
}

beforeEach(() => {
    mockFetch.mockReset();
});

// --- Books ---

describe("api.books", () => {
    it("list fetches /api/books", async () => {
        mockFetch.mockReturnValue(jsonResponse([{id: "1", title: "Test"}]));
        const books = await api.books.list();
        expect(books).toHaveLength(1);
        expect(books[0].title).toBe("Test");
        expect(mockFetch).toHaveBeenCalledWith("/api/books", expect.objectContaining({
            headers: {"Content-Type": "application/json"},
        }));
    });

    it("get fetches /api/books/:id", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "abc", title: "My Book", chapters: []}));
        const book = await api.books.get("abc");
        expect(book.id).toBe("abc");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/abc?include_content=false", expect.anything());
    });

    it("create sends POST with body", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "new", title: "New Book", author: "Me"}));
        const book = await api.books.create({title: "New Book", author: "Me"});
        expect(book.title).toBe("New Book");
        expect(mockFetch).toHaveBeenCalledWith("/api/books", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({title: "New Book", author: "Me"}),
        }));
    });

    it("update sends PATCH", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "1", title: "Updated"}));
        const book = await api.books.update("1", {title: "Updated"});
        expect(book.title).toBe("Updated");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/1", expect.objectContaining({
            method: "PATCH",
        }));
    });

    it("delete sends DELETE", async () => {
        mockFetch.mockReturnValue(emptyResponse());
        await api.books.delete("1");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/1", expect.objectContaining({
            method: "DELETE",
        }));
    });

    it("exportUrl builds correct URL", () => {
        expect(api.books.exportUrl("abc", "epub")).toBe("/api/books/abc/export/epub");
        expect(api.books.exportUrl("abc", "pdf")).toBe("/api/books/abc/export/pdf");
    });

    it("listTrash fetches trash list", async () => {
        mockFetch.mockReturnValue(jsonResponse([{id: "t1", title: "Trashed"}]));
        const trash = await api.books.listTrash();
        expect(trash).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith("/api/books/trash/list", expect.anything());
    });

    it("restore sends POST to trash restore", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "t1", title: "Restored"}));
        const book = await api.books.restore("t1");
        expect(book.title).toBe("Restored");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/trash/t1/restore", expect.objectContaining({
            method: "POST",
        }));
    });

    it("permanentDelete sends DELETE to trash", async () => {
        mockFetch.mockReturnValue(emptyResponse());
        await api.books.permanentDelete("t1");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/trash/t1", expect.objectContaining({
            method: "DELETE",
        }));
    });

    it("emptyTrash sends DELETE to trash/empty", async () => {
        mockFetch.mockReturnValue(emptyResponse());
        await api.books.emptyTrash();
        expect(mockFetch).toHaveBeenCalledWith("/api/books/trash/empty", expect.objectContaining({
            method: "DELETE",
        }));
    });
});

// --- Chapters ---

describe("api.chapters", () => {
    it("list fetches chapters for a book", async () => {
        mockFetch.mockReturnValue(jsonResponse([{id: "c1", title: "Ch 1"}]));
        const chapters = await api.chapters.list("b1");
        expect(chapters).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters", expect.anything());
    });

    it("get fetches a specific chapter", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "c1", title: "Ch 1"}));
        const ch = await api.chapters.get("b1", "c1");
        expect(ch.id).toBe("c1");
    });

    it("create sends POST with chapter data", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "c2", title: "New Ch", chapter_type: "chapter"}));
        const ch = await api.chapters.create("b1", {title: "New Ch"});
        expect(ch.title).toBe("New Ch");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters", expect.objectContaining({
            method: "POST",
        }));
    });

    it("update sends PATCH with version", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "c1", title: "Renamed", version: 2}));
        const ch = await api.chapters.update("b1", "c1", {title: "Renamed", version: 1});
        expect(ch.title).toBe("Renamed");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters/c1", expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({title: "Renamed", version: 1}),
        }));
    });

    it("delete sends DELETE", async () => {
        mockFetch.mockReturnValue(emptyResponse());
        await api.chapters.delete("b1", "c1");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters/c1", expect.objectContaining({
            method: "DELETE",
        }));
    });

    it("reorder sends PUT with chapter_ids", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.chapters.reorder("b1", ["c2", "c1"]);
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters/reorder", expect.objectContaining({
            method: "PUT",
            body: JSON.stringify({chapter_ids: ["c2", "c1"]}),
        }));
    });

    it("validateToc sends POST", async () => {
        mockFetch.mockReturnValue(jsonResponse({valid: true, toc_found: true, total_links: 5, broken_count: 0}));
        const result = await api.chapters.validateToc("b1");
        expect(result.valid).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters/validate-toc", expect.objectContaining({
            method: "POST",
        }));
    });
});

// --- Settings ---

describe("api.settings", () => {
    it("getApp fetches app settings", async () => {
        mockFetch.mockReturnValue(jsonResponse({app: {default_language: "de"}}));
        const config = await api.settings.getApp();
        expect((config.app as Record<string, unknown>).default_language).toBe("de");
    });

    it("updateApp sends PATCH", async () => {
        mockFetch.mockReturnValue(jsonResponse({app: {default_language: "en"}}));
        await api.settings.updateApp({app: {default_language: "en"}});
        expect(mockFetch).toHaveBeenCalledWith("/api/settings/app", expect.objectContaining({
            method: "PATCH",
        }));
    });

    it("getApp single-flights a concurrent burst into one request (#cascade)", async () => {
        // The reported bug: ~15 components each fetch /settings/app on mount,
        // firing 15 parallel requests. The single-flight collapses the burst.
        mockFetch.mockReturnValue(jsonResponse({app: {default_language: "de"}}));
        const [a, b, c] = await Promise.all([
            api.settings.getApp(),
            api.settings.getApp(),
            api.settings.getApp(),
        ]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect((a.app as Record<string, unknown>).default_language).toBe("de");
        expect(b).toBe(a);
        expect(c).toBe(a);
    });

    it("getApp fetches again after the previous read settled (no stale retention)", async () => {
        mockFetch.mockReturnValue(jsonResponse({app: {}}));
        await api.settings.getApp();
        await api.settings.getApp();
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("enablePlugin sends POST", async () => {
        mockFetch.mockReturnValue(jsonResponse({plugin: "export", status: "enabled"}));
        const result = await api.settings.enablePlugin("export");
        expect(result.status).toBe("enabled");
    });

    it("disablePlugin sends POST", async () => {
        mockFetch.mockReturnValue(jsonResponse({plugin: "export", status: "disabled"}));
        const result = await api.settings.disablePlugin("export");
        expect(result.status).toBe("disabled");
    });
});

// --- Error Handling ---

describe("error handling", () => {
    it("throws Error with detail on 404", async () => {
        mockFetch.mockReturnValue(errorResponse(404, "Book not found"));
        await expect(api.books.get("nonexistent")).rejects.toThrow("Book not found");
    });

    it("throws Error with detail on 422", async () => {
        mockFetch.mockReturnValue(errorResponse(422, "Validation error"));
        await expect(api.books.create({title: "", author: ""})).rejects.toThrow("Validation error");
    });

    it("throws generic error when no detail", async () => {
        mockFetch.mockReturnValue(Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.reject(new Error("parse error")),
            statusText: "Internal Server Error",
        } as Response));
        await expect(api.books.list()).rejects.toThrow("Internal Server Error");
    });
});

// --- Backup ---

describe("api.backup", () => {
    it("exportUrl returns correct path", () => {
        expect(api.backup.exportUrl()).toBe("/api/backup/export");
    });
});

// --- Help ---

describe("api.help", () => {
    it("shortcuts fetches with language param", async () => {
        mockFetch.mockReturnValue(jsonResponse([{keys: "Ctrl+B", action: "Bold"}]));
        const shortcuts = await api.help.shortcuts("en");
        expect(shortcuts).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith("/api/help/shortcuts?lang=en", expect.anything());
    });

    it("faq fetches with default language", async () => {
        mockFetch.mockReturnValue(jsonResponse([{question: "Q?", answer: "A."}]));
        const faq = await api.help.faq();
        expect(faq).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith("/api/help/faq?lang=de", expect.anything());
    });
});

// --- Licenses ---

describe("api.licenses", () => {
    it("activate sends POST with plugin and key", async () => {
        mockFetch.mockReturnValue(jsonResponse({status: "activated"}));
        await api.licenses.activate("kdp", "KEY-123");
        expect(mockFetch).toHaveBeenCalledWith("/api/licenses", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({plugin_name: "kdp", license_key: "KEY-123"}),
        }));
    });

    it("deactivate sends DELETE", async () => {
        mockFetch.mockReturnValue(jsonResponse({status: "deactivated"}));
        await api.licenses.deactivate("kdp");
        expect(mockFetch).toHaveBeenCalledWith("/api/licenses/kdp", expect.objectContaining({
            method: "DELETE",
        }));
    });
});

// --- Audiobook voices ---

describe("api.audiobook.listVoices", () => {
    it("returns the cached voices when /api/voices has matches", async () => {
        mockFetch.mockReturnValueOnce(jsonResponse([
            {id: "de-DE-KatjaNeural", name: "Katja", language: "de-DE", gender: "Female"},
        ]));
        const voices = await api.audiobook.listVoices("edge-tts", "de");
        expect(voices).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/voices?engine=edge-tts&language=de",
            expect.any(Object),
        );
    });

    it("falls back to /api/audiobook/voices when the cache is empty", async () => {
        mockFetch
            .mockReturnValueOnce(jsonResponse([]))
            .mockReturnValueOnce(jsonResponse([{id: "Rachel", name: "Rachel"}]));
        const voices = await api.audiobook.listVoices("elevenlabs", "en");
        expect(voices).toHaveLength(1);
        expect(mockFetch).toHaveBeenNthCalledWith(
            2,
            "/api/audiobook/voices?engine=elevenlabs&language=en",
            expect.any(Object),
        );
    });

    it("returns [] - NOT a hardcoded Edge fallback - when both endpoints are empty", async () => {
        // Regression for the bug where /api/voices?engine=google-tts&language=de
        // returned [], the frontend then dumped EDGE_TTS_VOICES["de"] into the
        // dropdown so the user saw 16 Edge voices for an engine they did not pick.
        mockFetch
            .mockReturnValueOnce(jsonResponse([]))
            .mockReturnValueOnce(jsonResponse([]));
        const voices = await api.audiobook.listVoices("google-tts", "de");
        expect(voices).toEqual([]);
    });

    it("returns [] when both endpoints error", async () => {
        mockFetch
            .mockReturnValueOnce(errorResponse(500, "boom"))
            .mockReturnValueOnce(errorResponse(500, "boom"));
        const voices = await api.audiobook.listVoices("edge-tts", "de");
        expect(voices).toEqual([]);
    });

    it("returns [] without making any request when engine or language is empty", async () => {
        const voices = await api.audiobook.listVoices("edge-tts", "");
        expect(voices).toEqual([]);
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

// --- AI test connection ---

describe("api.ai.testConnection", () => {
    it("GETs /api/ai/test-connection and returns the success result", async () => {
        mockFetch.mockReturnValue(jsonResponse({
            success: true,
            error_key: "",
            error_detail: "",
        }));
        const res = await api.ai.testConnection();
        expect(res.success).toBe(true);
        expect(res.error_key).toBe("");
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/ai/test-connection",
            expect.objectContaining({
                headers: {"Content-Type": "application/json"},
            }),
        );
    });

    it("returns the structured error fields when the backend reports a failure", async () => {
        mockFetch.mockReturnValue(jsonResponse({
            success: false,
            error_key: "auth_error",
            error_detail: "Invalid API key",
        }));
        const res = await api.ai.testConnection();
        expect(res.success).toBe(false);
        expect(res.error_key).toBe("auth_error");
        expect(res.error_detail).toBe("Invalid API key");
    });

    it("returns the disabled-AI shape unchanged", async () => {
        mockFetch.mockReturnValue(jsonResponse({
            success: false,
            error_key: "disabled",
            error_detail: "",
        }));
        const res = await api.ai.testConnection();
        expect(res.error_key).toBe("disabled");
    });

    it("throws ApiError on a non-2xx response", async () => {
        mockFetch.mockReturnValue(errorResponse(500, "internal"));
        await expect(api.ai.testConnection()).rejects.toThrow();
    });
});

// --- formatVoiceLabel ---

import {formatVoiceLabel} from "./client";

describe("formatVoiceLabel", () => {
    it("includes language and gender when both are present", () => {
        expect(formatVoiceLabel({
            id: "de-DE-KatjaNeural", name: "Katja",
            language: "de-DE", gender: "Female",
        })).toBe("Katja (de-DE, Female)");
    });

    it("only language when gender is missing", () => {
        expect(formatVoiceLabel({
            id: "x", name: "Voice", language: "en-GB",
        })).toBe("Voice (en-GB)");
    });

    it("only gender when language is missing (multilingual engines)", () => {
        expect(formatVoiceLabel({
            id: "rachel", name: "Rachel", gender: "Female",
        })).toBe("Rachel (Female)");
    });

    it("bare name when no metadata at all", () => {
        expect(formatVoiceLabel({id: "x", name: "Voice"})).toBe("Voice");
    });

    it("falls back to the id when name is missing", () => {
        expect(formatVoiceLabel({id: "voice-id-only", name: ""})).toBe("voice-id-only");
    });
});


// --- MEDIUM-COMMENTS-UI-01 commit 2: comments API client ---

describe("api.articles.getComments", () => {
    it("GETs /api/articles/{id}/comments", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.articles.getComments("article-123");
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/article-123/comments",
            expect.objectContaining({
                headers: {"Content-Type": "application/json"},
            }),
        );
    });

    it("returns the array verbatim (preserves order)", async () => {
        mockFetch.mockReturnValue(
            jsonResponse([
                {id: "c1", body_text: "First", imported_from: "medium"},
                {id: "c2", body_text: "Second", imported_from: "medium"},
            ]),
        );
        const out = await api.articles.getComments("a1");
        expect(out.map((c) => c.id)).toEqual(["c1", "c2"]);
    });
});

describe("api.comments.list", () => {
    it("GETs /api/comments with no params when none provided", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.comments.list();
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments",
            expect.objectContaining({
                headers: {"Content-Type": "application/json"},
            }),
        );
    });

    it("encodes importedFrom as imported_from query param", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.comments.list({importedFrom: "medium"});
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments?imported_from=medium",
            expect.any(Object),
        );
    });

    it("encodes orphansOnly=true only when true (omits when false)", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.comments.list({orphansOnly: true});
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments?orphans_only=true",
            expect.any(Object),
        );
        mockFetch.mockClear();
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.comments.list({orphansOnly: false});
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments",
            expect.any(Object),
        );
    });

    it("encodes limit as integer query param", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.comments.list({limit: 250});
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments?limit=250",
            expect.any(Object),
        );
    });

    it("combines all params into a single query string", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.comments.list({
            importedFrom: "medium",
            orphansOnly: true,
            limit: 50,
        });
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl.startsWith("/api/comments?")).toBe(true);
        expect(calledUrl).toContain("imported_from=medium");
        expect(calledUrl).toContain("orphans_only=true");
        expect(calledUrl).toContain("limit=50");
    });
});

describe("api.comments.delete", () => {
    it("issues DELETE /api/comments/{id}", async () => {
        mockFetch.mockReturnValue(emptyResponse(204));
        await api.comments.delete("c1");
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments/c1",
            expect.objectContaining({method: "DELETE"}),
        );
    });
});

// --- Bug 10: trash-lifecycle methods on api.comments ---

describe("api.comments trash-lifecycle", () => {
    it("listTrashed fetches /api/comments/trash/list", async () => {
        mockFetch.mockReturnValue(jsonResponse([{id: "c1", body_text: "trashed"}]));
        const rows = await api.comments.listTrashed();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe("c1");
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments/trash/list",
            expect.anything(),
        );
    });

    it("restore issues POST /api/comments/trash/{id}/restore", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "c1", body_text: "alive again"}));
        const restored = await api.comments.restore("c1");
        expect(restored.id).toBe("c1");
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments/trash/c1/restore",
            expect.objectContaining({method: "POST"}),
        );
    });

    it("permanentDelete issues DELETE /api/comments/trash/{id}", async () => {
        mockFetch.mockReturnValue(emptyResponse(204));
        await api.comments.permanentDelete("c1");
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments/trash/c1",
            expect.objectContaining({method: "DELETE"}),
        );
    });

    it("emptyTrash issues DELETE /api/comments/trash/empty", async () => {
        mockFetch.mockReturnValue(emptyResponse(204));
        await api.comments.emptyTrash();
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments/trash/empty",
            expect.objectContaining({method: "DELETE"}),
        );
    });

    it("restore propagates 404 as an ApiError", async () => {
        mockFetch.mockReturnValue(errorResponse(404, "Comment not found in trash"));
        await expect(api.comments.restore("missing")).rejects.toThrow();
    });

    it("permanentDelete propagates 404 on live (not-in-trash) row", async () => {
        mockFetch.mockReturnValue(errorResponse(404, "Comment not found in trash"));
        await expect(api.comments.permanentDelete("live-id")).rejects.toThrow();
    });

    it("bulkRestore POSTs ids to /comments/trash/bulk-restore", async () => {
        mockFetch.mockReturnValue(jsonResponse({
            restored_count: 2,
            skipped_not_in_trash: [],
            failed: [],
        }));
        const result = await api.comments.bulkRestore(["a", "b"]);
        expect(result.restored_count).toBe(2);
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/comments/trash/bulk-restore",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ids: ["a", "b"]}),
            }),
        );
    });

    it("bulkRestore surfaces skipped + failed entries", async () => {
        mockFetch.mockReturnValue(jsonResponse({
            restored_count: 1,
            skipped_not_in_trash: ["already-live"],
            failed: [{id: "missing", error: "not found"}],
        }));
        const result = await api.comments.bulkRestore(["a", "already-live", "missing"]);
        expect(result.skipped_not_in_trash).toEqual(["already-live"]);
        expect(result.failed[0].error).toBe("not found");
    });
});

// --- Authors (Bug 8 Phase 1) ---

describe("api.authors", () => {
    it("list fetches /api/authors with no params", async () => {
        mockFetch.mockReturnValue(jsonResponse([{id: "a1", name: "Asterios", slug: "asterios"}]));
        const authors = await api.authors.list();
        expect(authors).toHaveLength(1);
        expect(authors[0].slug).toBe("asterios");
        expect(mockFetch).toHaveBeenCalledWith("/api/authors", expect.anything());
    });

    it("list appends ``search`` and ``limit`` as query params", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.authors.list({search: "räp", limit: 50});
        const [calledUrl] = mockFetch.mock.calls[0];
        expect(calledUrl).toContain("/api/authors?");
        expect(calledUrl).toContain("search=r%C3%A4p");
        expect(calledUrl).toContain("limit=50");
    });

    it("list omits ``search`` when undefined and ``limit`` when null", async () => {
        mockFetch.mockReturnValue(jsonResponse([]));
        await api.authors.list({});
        expect(mockFetch).toHaveBeenCalledWith("/api/authors", expect.anything());
    });

    it("get fetches /api/authors/{id}", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "a1", name: "X", slug: "x"}));
        const author = await api.authors.get("a1");
        expect(author.id).toBe("a1");
        expect(mockFetch).toHaveBeenCalledWith("/api/authors/a1", expect.anything());
    });

    it("create sends POST with JSON body", async () => {
        mockFetch.mockReturnValue(jsonResponse({
            id: "a1",
            name: "New",
            slug: "new",
            bio: "test",
            created_at: "2026-05-16T00:00:00Z",
            updated_at: "2026-05-16T00:00:00Z",
        }));
        const author = await api.authors.create({name: "New", bio: "test"});
        expect(author.slug).toBe("new");
        expect(mockFetch).toHaveBeenCalledWith("/api/authors", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({name: "New", bio: "test"}),
        }));
    });

    it("update sends PATCH with partial body", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "a1", name: "X", slug: "x", bio: "updated"}));
        await api.authors.update("a1", {bio: "updated"});
        expect(mockFetch).toHaveBeenCalledWith("/api/authors/a1", expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({bio: "updated"}),
        }));
    });

    it("delete issues DELETE /api/authors/{id}", async () => {
        mockFetch.mockReturnValue(emptyResponse(204));
        await api.authors.delete("a1");
        expect(mockFetch).toHaveBeenCalledWith("/api/authors/a1", expect.objectContaining({
            method: "DELETE",
        }));
    });
});
