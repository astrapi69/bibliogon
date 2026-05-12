import {describe, it, expect, vi, beforeEach} from "vitest"
import {api} from "./client"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 1/10. Pins the API
// client surface for the Session 1 backend endpoints. Mirrors the
// shape of the existing client tests: vi.fn() mock fetch, assert on
// URL + method + body, assert on returned shape.

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

function jsonResponse(data: unknown, status = 200) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        statusText: "OK",
        headers: new Headers(),
    } as Response)
}

function blobResponse(text: string, filename: string, status = 200) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        blob: () => Promise.resolve(new Blob([text], {type: "text/yaml"})),
        headers: new Headers({
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Type": "text/yaml; charset=utf-8",
        }),
        statusText: "OK",
    } as unknown as Response)
}

function errorResponse(status: number, detail: string) {
    return Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({detail}),
        statusText: "Error",
        headers: new Headers(),
    } as Response)
}

beforeEach(() => {
    mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// Article single-record aiTemplate
// ---------------------------------------------------------------------------

describe("api.articles.aiTemplate", () => {
    it("export GETs the per-article path and reads filename from Content-Disposition", async () => {
        mockFetch.mockReturnValue(
            blobResponse("# yaml content\ntype: article\n", "alpha.biblio.yaml"),
        )
        const result = await api.articles.aiTemplate.export("abc")
        expect(mockFetch).toHaveBeenCalledWith("/api/articles/abc/ai-template")
        expect(result.filename).toBe("alpha.biblio.yaml")
        const text = await result.blob.text()
        expect(text).toContain("type: article")
    })

    it("export falls back to a synthetic filename when header missing", async () => {
        mockFetch.mockReturnValue(
            Promise.resolve({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(new Blob(["x"])),
                headers: new Headers(),
                statusText: "OK",
            } as unknown as Response),
        )
        const result = await api.articles.aiTemplate.export("xyz")
        expect(result.filename).toBe("article-xyz.biblio.yaml")
    })

    it("export throws ApiError with backend detail on non-2xx", async () => {
        mockFetch.mockReturnValue(errorResponse(404, "Article xyz not found"))
        await expect(api.articles.aiTemplate.export("xyz")).rejects.toThrow(
            "Article xyz not found",
        )
    })

    it("import POSTs YAML body with text/yaml content type", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                article_id: "abc",
                updated_fields: ["seo_title"],
                skipped_fields: [],
                skip_reasons: {},
                force: false,
            }),
        )
        const yaml = "type: article\nschema_version: 1\n"
        const result = await api.articles.aiTemplate.import("abc", yaml)
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/abc/ai-template?force=false",
            expect.objectContaining({
                method: "POST",
                headers: {"Content-Type": "text/yaml"},
                body: yaml,
            }),
        )
        expect(result.updated_fields).toEqual(["seo_title"])
    })

    it("import passes force=true in the query string when force is set", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                article_id: "abc",
                updated_fields: [],
                skipped_fields: [],
                skip_reasons: {},
                force: true,
            }),
        )
        await api.articles.aiTemplate.import("abc", "type: article\n", true)
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/abc/ai-template?force=true",
            expect.objectContaining({method: "POST"}),
        )
    })

    it("empty hits /api/ai-templates/article with the language query", async () => {
        mockFetch.mockReturnValue(
            blobResponse("type: article\nlanguage: de\n", "new-article-de.biblio.yaml"),
        )
        const result = await api.articles.aiTemplate.empty("de")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/ai-templates/article?language=de",
        )
        expect(result.filename).toBe("new-article-de.biblio.yaml")
    })

    it("empty defaults to English when no language is supplied", async () => {
        mockFetch.mockReturnValue(blobResponse("type: article\nlanguage: en\n", "x"))
        await api.articles.aiTemplate.empty()
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/ai-templates/article?language=en",
        )
    })
})

// ---------------------------------------------------------------------------
// Article aiFill
// ---------------------------------------------------------------------------

describe("api.articles.aiFill", () => {
    it("POSTs JSON with the field_classes list", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                article_id: "abc",
                updated_fields: ["seo_title", "seo_description"],
                skipped_fields: [],
                skip_reasons: {},
                field_class_results: {
                    seo: {
                        updated: ["seo_title", "seo_description"],
                        skipped: {},
                        tokens: 120,
                        cost_usd: 0.0024,
                        error: null,
                    },
                },
                field_class_errors: {},
                tokens_used: 120,
                estimated_cost_usd: 0.0024,
                force: false,
                inline_image_count: 3,
            }),
        )
        const result = await api.articles.aiFill("abc", {
            field_classes: ["seo"],
            force: false,
        })
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/abc/ai-fill",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({field_classes: ["seo"], force: false}),
            }),
        )
        expect(result.updated_fields).toContain("seo_title")
        expect(result.tokens_used).toBe(120)
    })

    it("surfaces per-class errors from the response", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                article_id: "abc",
                updated_fields: [],
                skipped_fields: [],
                skip_reasons: {},
                field_class_results: {},
                field_class_errors: {seo: "LLM outage"},
                tokens_used: 0,
                estimated_cost_usd: null,
                force: false,
            }),
        )
        const result = await api.articles.aiFill("abc", {field_classes: ["seo"]})
        expect(result.field_class_errors.seo).toBe("LLM outage")
    })

    it("propagates ApiError on a 403 (AI disabled)", async () => {
        mockFetch.mockReturnValue(errorResponse(403, "AI features are disabled"))
        await expect(
            api.articles.aiFill("abc", {field_classes: ["seo"]}),
        ).rejects.toThrow("AI features are disabled")
    })
})

// ---------------------------------------------------------------------------
// Article bulkAiTemplate
// ---------------------------------------------------------------------------

describe("api.articles.bulkAiTemplate", () => {
    it("export POSTs the ids list and returns ZIP blob + filename", async () => {
        mockFetch.mockReturnValue(blobResponse("\x50\x4b", "articles-ai-templates.zip"))
        const result = await api.articles.bulkAiTemplate.export(["a1", "a2"])
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/bulk-ai-template/export",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ids: ["a1", "a2"]}),
            }),
        )
        expect(result.filename).toBe("articles-ai-templates.zip")
    })

    it("import sends FormData with the ZIP file and force query param", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({imported: [], failed: [], force: true}),
        )
        const file = new File([new Uint8Array([0x50, 0x4b])], "in.zip", {
            type: "application/zip",
        })
        const result = await api.articles.bulkAiTemplate.import(file, true)
        const call = mockFetch.mock.calls[0]
        expect(call[0]).toBe("/api/articles/bulk-ai-template/import?force=true")
        expect(call[1].method).toBe("POST")
        expect(call[1].body).toBeInstanceOf(FormData)
        expect(result.force).toBe(true)
    })

    it("import throws ApiError on 422 cap exceeded", async () => {
        mockFetch.mockReturnValue(
            errorResponse(422, "ZIP contains 60 templates; cap is 50"),
        )
        const file = new File([new Uint8Array([0])], "in.zip")
        await expect(
            api.articles.bulkAiTemplate.import(file),
        ).rejects.toThrow(/cap is 50/)
    })
})

// ---------------------------------------------------------------------------
// Article bulkAiFill (estimate + start + stream + status)
// ---------------------------------------------------------------------------

describe("api.articles.bulkAiFill", () => {
    it("estimate POSTs the request and returns per-item + totals", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                model: "gpt-4o",
                field_classes: ["seo"],
                items: [
                    {
                        id: "a1",
                        title: "A1",
                        language: "en",
                        field_class_calls: 1,
                        per_class: {
                            seo: {
                                input_tokens: 800,
                                output_tokens: 200,
                                cost_usd: 0.005,
                            },
                        },
                        estimated_input_tokens: 800,
                        estimated_output_tokens: 200,
                        estimated_cost_usd: 0.005,
                    },
                ],
                totals: {
                    total_items: 1,
                    total_field_class_calls: 1,
                    estimated_input_tokens: 800,
                    estimated_output_tokens: 200,
                    estimated_cost_usd: 0.005,
                },
            }),
        )
        const result = await api.articles.bulkAiFill.estimate({
            ids: ["a1"],
            field_classes: ["seo"],
        })
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/bulk-ai-fill/estimate",
            expect.objectContaining({method: "POST"}),
        )
        expect(result.totals.estimated_cost_usd).toBe(0.005)
        expect(result.items[0].per_class.seo.input_tokens).toBe(800)
    })

    it("start POSTs the request and returns the job_id", async () => {
        mockFetch.mockReturnValue(jsonResponse({job_id: "job123"}))
        const result = await api.articles.bulkAiFill.start({
            ids: ["a1"],
            field_classes: ["seo"],
            force: false,
        })
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/bulk-ai-fill/start",
            expect.objectContaining({method: "POST"}),
        )
        expect(result.job_id).toBe("job123")
    })

    it("streamUrl is the deterministic /stream path under the job id", () => {
        expect(api.articles.bulkAiFill.streamUrl("job123")).toBe(
            "/api/articles/bulk-ai-fill/jobs/job123/stream",
        )
    })

    it("status GETs the per-job endpoint", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                id: "job123",
                status: "completed",
                progress: {},
                result: {},
                error: null,
            }),
        )
        const result = await api.articles.bulkAiFill.status("job123")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/articles/bulk-ai-fill/jobs/job123",
            expect.any(Object),
        )
        expect(result.status).toBe("completed")
    })
})

// ---------------------------------------------------------------------------
// Book namespace (smoke test that the symmetrical methods exist + work)
// ---------------------------------------------------------------------------

describe("api.books.aiTemplate (book mirror)", () => {
    it("export hits /api/books/{id}/ai-template", async () => {
        mockFetch.mockReturnValue(blobResponse("type: book\n", "the-book.biblio.yaml"))
        const result = await api.books.aiTemplate.export("b1")
        expect(mockFetch).toHaveBeenCalledWith("/api/books/b1/ai-template")
        expect(result.filename).toBe("the-book.biblio.yaml")
    })

    it("import passes force=false by default", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                book_id: "b1",
                updated_fields: [],
                skipped_fields: [],
                skip_reasons: {},
                dropped_chapter_summaries: [],
                force: false,
            }),
        )
        await api.books.aiTemplate.import("b1", "type: book\n")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/ai-template?force=false",
            expect.objectContaining({method: "POST"}),
        )
    })

    it("empty hits /api/ai-templates/book?language=...", async () => {
        mockFetch.mockReturnValue(
            blobResponse("type: book\nlanguage: fr\n", "new-book-fr.biblio.yaml"),
        )
        await api.books.aiTemplate.empty("fr")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/ai-templates/book?language=fr",
        )
    })
})

describe("api.books.aiFill", () => {
    it("POSTs with book field-classes", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                book_id: "b1",
                updated_fields: ["cover_image_prompt"],
                skipped_fields: [],
                skip_reasons: {},
                field_class_results: {
                    cover_prompt: {
                        updated: ["cover_image_prompt"],
                        skipped: {},
                        tokens: 100,
                        cost_usd: null,
                        error: null,
                    },
                },
                field_class_errors: {},
                dropped_chapter_summaries: [],
                tokens_used: 100,
                estimated_cost_usd: null,
                force: false,
            }),
        )
        const result = await api.books.aiFill("b1", {
            field_classes: ["cover_prompt"],
        })
        expect(result.updated_fields).toContain("cover_image_prompt")
        expect(result.dropped_chapter_summaries).toEqual([])
    })
})

describe("api.books.bulkAiFill", () => {
    it("streamUrl returns the deterministic book stream path", () => {
        expect(api.books.bulkAiFill.streamUrl("xyz")).toBe(
            "/api/books/bulk-ai-fill/jobs/xyz/stream",
        )
    })
})
