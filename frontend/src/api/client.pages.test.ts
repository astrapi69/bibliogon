/**
 * api.pages client tests (PB-PHASE4 Session 3 Commit 1).
 *
 * Mirrors the per-domain test-file convention of
 * ``client.medium-import.test.ts`` + ``client.ai-template.test.ts``.
 * Pins URL + method + body per endpoint so a future refactor that
 * breaks the contract surfaces immediately rather than only when
 * the consumer (the not-yet-built PageEditor) fails.
 *
 * Two intentional asymmetries with api.chapters are pinned here
 * via the test shape:
 *
 *   - update is a single straight PATCH (no abort-controller
 *     swap-the-in-flight pattern from chapters; pages are
 *     manually-saved, not auto-saved per keystroke).
 *   - reorder is POST (not PUT). The Session-2 router shipped
 *     with POST; pages domain owns its own conventions.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {api} from "./client"

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function jsonResponse(data: unknown, status = 200) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        statusText: "OK",
    } as Response)
}

function emptyResponse(status = 204) {
    return Promise.resolve({
        ok: true,
        status,
        json: () => Promise.resolve(undefined),
        statusText: "No Content",
    } as Response)
}

beforeEach(() => {
    mockFetch.mockReset()
})

describe("api.pages", () => {
    it("list issues GET /api/books/{bookId}/pages", async () => {
        mockFetch.mockReturnValue(
            jsonResponse([
                {
                    id: "p1",
                    book_id: "b1",
                    position: 0,
                    layout: "speech_bubble",
                    text_content: "Hello",
                    image_asset_id: null,
                    speech_bubble_config: null,
                    created_at: "2026-05-17T00:00:00Z",
                    updated_at: "2026-05-17T00:00:00Z",
                },
            ]),
        )
        const pages = await api.pages.list("b1")
        expect(pages).toHaveLength(1)
        expect(pages[0].layout).toBe("speech_bubble")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/pages",
            expect.anything(),
        )
    })

    it("create POSTs to /api/books/{bookId}/pages with the payload as body", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                id: "p-new",
                book_id: "b1",
                position: 3,
                layout: "image_top_text_bottom",
                text_content: null,
                image_asset_id: null,
                speech_bubble_config: null,
                created_at: "2026-05-17T00:00:00Z",
                updated_at: "2026-05-17T00:00:00Z",
            }),
        )
        const created = await api.pages.create("b1", {
            layout: "image_top_text_bottom",
        })
        expect(created.id).toBe("p-new")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/pages",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({layout: "image_top_text_bottom"}),
            }),
        )
    })

    it("update PATCHes /api/books/{bookId}/pages/{pageId} with the partial body", async () => {
        mockFetch.mockReturnValue(
            jsonResponse({
                id: "p1",
                book_id: "b1",
                position: 0,
                layout: "text_only",
                text_content: "Updated",
                image_asset_id: null,
                speech_bubble_config: null,
                created_at: "2026-05-17T00:00:00Z",
                updated_at: "2026-05-17T00:01:00Z",
            }),
        )
        const updated = await api.pages.update("b1", "p1", {
            layout: "text_only",
            text_content: "Updated",
        })
        expect(updated.layout).toBe("text_only")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/pages/p1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({
                    layout: "text_only",
                    text_content: "Updated",
                }),
            }),
        )
    })

    it("delete issues DELETE /api/books/{bookId}/pages/{pageId}", async () => {
        mockFetch.mockReturnValue(emptyResponse(204))
        await api.pages.delete("b1", "p1")
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/pages/p1",
            expect.objectContaining({method: "DELETE"}),
        )
    })

    it("reorder POSTs to /api/books/{bookId}/pages/reorder with {page_ids}", async () => {
        mockFetch.mockReturnValue(
            jsonResponse([
                {
                    id: "p2",
                    book_id: "b1",
                    position: 0,
                    layout: "speech_bubble",
                    text_content: null,
                    image_asset_id: null,
                    speech_bubble_config: null,
                    created_at: "2026-05-17T00:00:00Z",
                    updated_at: "2026-05-17T00:01:00Z",
                },
                {
                    id: "p1",
                    book_id: "b1",
                    position: 1,
                    layout: "speech_bubble",
                    text_content: null,
                    image_asset_id: null,
                    speech_bubble_config: null,
                    created_at: "2026-05-17T00:00:00Z",
                    updated_at: "2026-05-17T00:01:00Z",
                },
            ]),
        )
        const reordered = await api.pages.reorder("b1", ["p2", "p1"])
        expect(reordered.map((p) => p.id)).toEqual(["p2", "p1"])
        // POST (not PUT — Session-2 router shipped with POST; honour
        // the deployed backend per PB-PHASE4 Session 3 handover).
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/pages/reorder",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({page_ids: ["p2", "p1"]}),
            }),
        )
    })

    it("update supports the speech_bubble_config nested object on Layout-A pages", async () => {
        // Pins that the speech_bubble_config field round-trips as a
        // nested object (not a JSON-stringified blob like the
        // backend stores). The PageEditor's Layout-A properties
        // pane writes here.
        const cfg = {anchor_position: "bottom-right", offset: 12}
        mockFetch.mockReturnValue(
            jsonResponse({
                id: "p1",
                book_id: "b1",
                position: 0,
                layout: "speech_bubble",
                text_content: null,
                image_asset_id: null,
                speech_bubble_config: cfg,
                created_at: "2026-05-17T00:00:00Z",
                updated_at: "2026-05-17T00:01:00Z",
            }),
        )
        const updated = await api.pages.update("b1", "p1", {
            speech_bubble_config: cfg,
        })
        expect(updated.speech_bubble_config).toEqual(cfg)
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/books/b1/pages/p1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({speech_bubble_config: cfg}),
            }),
        )
    })
})
