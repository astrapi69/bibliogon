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
        expect(mockFetch).toHaveBeenCalledWith("/api/books/abc", expect.anything());
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

    it("update sends PATCH", async () => {
        mockFetch.mockReturnValue(jsonResponse({id: "c1", title: "Renamed"}));
        const ch = await api.chapters.update("b1", "c1", {title: "Renamed"});
        expect(ch.title).toBe("Renamed");
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/chapters/c1", expect.objectContaining({
            method: "PATCH",
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
