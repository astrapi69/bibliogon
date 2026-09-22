/**
 * A+ Content plugin API client (#887).
 *
 * The backend router is `POST /aplus/{book_id}/generate?language=&force=`
 * and `GET /aplus/{book_id}?language=`. These cases pin URL, method and
 * query shape, and the discrimination between a generated package and the
 * missing-fields answer the generate endpoint returns instead of calling
 * the AI.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { aplus, isAplusMissingFields, type AplusPackage } from "./aplus";

const fetchSpy = vi.fn();

const PACKAGE: AplusPackage = {
    short_description: "Kurz",
    bullets: [{ heading: "H", body: "B" }],
    module_header: {
        title: "T",
        text: "X",
        image: { prompt: "p", aspect_ratio: "16:9", size: "970x600", style_flags: [], rendered: "r" },
        alt_text: "a",
    },
    module_three_images: [],
    validation: [],
    meta: {
        book_id: "b1",
        language: "de",
        model: "m",
        ruleset_version: "1",
        generated_at: "2026-09-22T08:00:00Z",
    },
};

function jsonResponse(body: unknown, status = 200) {
    return {
        ok: status < 400,
        status,
        statusText: status < 400 ? "OK" : "Not Found",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => body,
    };
}

beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(jsonResponse(PACKAGE));
    vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const calledUrl = () => String(fetchSpy.mock.calls[0][0]);
const calledInit = () => fetchSpy.mock.calls[0][1] as RequestInit;

describe("aplus.generate", () => {
    it("posts to the generate route with the language and without force by default", async () => {
        const result = await aplus.generate("b1", { language: "de" });
        expect(calledUrl()).toMatch(/\/aplus\/b1\/generate\?language=de$/);
        expect(calledInit().method).toBe("POST");
        expect(result).toEqual(PACKAGE);
    });

    it("sends force=true for a regeneration", async () => {
        await aplus.generate("b1", { language: "en", force: true });
        expect(calledUrl()).toMatch(/\/aplus\/b1\/generate\?language=en&force=true$/);
    });

    it("omits the query entirely when no language is given", async () => {
        await aplus.generate("b1");
        expect(calledUrl()).toMatch(/\/aplus\/b1\/generate$/);
    });
});

describe("aplus.get", () => {
    it("reads the cached package for the language", async () => {
        const result = await aplus.get("b1", "fr");
        expect(calledUrl()).toMatch(/\/aplus\/b1\?language=fr$/);
        expect(calledInit()?.method ?? "GET").toBe("GET");
        expect(result).toEqual(PACKAGE);
    });

    it("returns null when nothing was generated yet (404)", async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ detail: "No A+ Content generated yet" }, 404));
        expect(await aplus.get("b1", "de")).toBeNull();
    });

    it("rethrows other errors", async () => {
        fetchSpy.mockResolvedValue({ ...jsonResponse({ detail: "boom" }, 500), statusText: "Error" });
        await expect(aplus.get("b1", "de")).rejects.toBeTruthy();
    });
});

const DOC = {
    content_name: "Buch - A+Content",
    short_description: "Kurz",
    bullets: [{ heading: "H", body: "B" }],
    modules: [],
};

describe("aplus documents", () => {
    it("reads the document for a language", async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ ...DOC, book_id: "b1", language: "es", updated_at: "t" }));
        const result = await aplus.getDocument("b1", "es");
        expect(calledUrl()).toMatch(/\/aplus\/b1\/document\?language=es$/);
        expect(result?.content_name).toBe("Buch - A+Content");
    });

    it("returns null when there is no document yet (404)", async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ detail: "No A+ document" }, 404));
        expect(await aplus.getDocument("b1", "es")).toBeNull();
    });

    it("saves with PUT and the document as JSON body", async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ ...DOC, book_id: "b1", language: "es", updated_at: "t" }));
        await aplus.saveDocument("b1", "es", DOC);
        expect(calledUrl()).toMatch(/\/aplus\/b1\/document\?language=es$/);
        expect(calledInit().method).toBe("PUT");
        expect(JSON.parse(String(calledInit().body))).toEqual(DOC);
    });

    it("deletes with DELETE", async () => {
        fetchSpy.mockResolvedValue({ ...jsonResponse(null, 204), ok: true, status: 204 });
        await aplus.deleteDocument("b1", "es");
        expect(calledUrl()).toMatch(/\/aplus\/b1\/document\?language=es$/);
        expect(calledInit().method).toBe("DELETE");
    });

    it("lists every language's document of a book", async () => {
        fetchSpy.mockResolvedValue(jsonResponse([]));
        expect(await aplus.listDocuments("b1")).toEqual([]);
        expect(calledUrl()).toMatch(/\/aplus\/b1\/documents$/);
    });
});

describe("isAplusMissingFields", () => {
    it("recognises the missing-fields answer", () => {
        expect(
            isAplusMissingFields({ book_id: "b1", missing_fields: [{ field: "author", reason: "r" }] }),
        ).toBe(true);
    });

    it("does not mistake a package for it", () => {
        expect(isAplusMissingFields(PACKAGE)).toBe(false);
    });
});
