/**
 * Promotion-plugin API client (#810).
 *
 * The board's whole value is that the filters and the per-format write
 * reach the backend exactly as the plugin's router declares them
 * (`GET /promotion/portfolio?language=&author=&gaps_only=`,
 * `PUT /promotion/portfolio/{id}/formats/{format}`,
 * `PATCH /promotion/portfolio/{id}`). These cases pin the URL + method +
 * body shape, so a rename on either side fails here instead of silently
 * returning the unfiltered board.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { promotion, type PortfolioBoard } from "./promotion";

const fetchSpy = vi.fn();

const BOARD: PortfolioBoard = {
    formats: ["ebook", "paperback", "hardcover"],
    statuses: ["live", "draft", "missing"],
    books: [
        {
            book_id: "b1",
            title: "Erstes Buch",
            author: "A. Raptis",
            language: "de",
            status: "published",
            universal_link: null,
            source_identifier: null,
            formats: [
                { book_format: "ebook", status: "live", store_url: "https://x/dp/B01", asin: "B01" },
                { book_format: "paperback", status: "missing", store_url: null, asin: null },
                { book_format: "hardcover", status: "draft", store_url: null, asin: null },
            ],
            gaps: ["paperback", "hardcover"],
        },
    ],
};

function jsonOk(body: unknown) {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => body,
    };
}

beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(jsonOk(BOARD));
    vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function calledUrl(): string {
    return String(fetchSpy.mock.calls[0][0]);
}
function calledInit(): RequestInit {
    return fetchSpy.mock.calls[0][1] as RequestInit;
}

describe("promotion.portfolio", () => {
    it("requests the unfiltered board with no query string", async () => {
        const board = await promotion.portfolio();
        expect(calledUrl()).toMatch(/\/promotion\/portfolio$/);
        expect(board.books[0].gaps).toEqual(["paperback", "hardcover"]);
    });

    it("passes the language and author filters as query params", async () => {
        await promotion.portfolio({ language: "de", author: "A. Raptis" });
        const query = new URL(calledUrl(), "http://localhost").searchParams;
        expect(query.get("language")).toBe("de");
        expect(query.get("author")).toBe("A. Raptis");
        expect(query.get("gaps_only")).toBeNull();
    });

    it("sends gaps_only only when the filter is on", async () => {
        await promotion.portfolio({ gapsOnly: true });
        expect(new URL(calledUrl(), "http://localhost").searchParams.get("gaps_only")).toBe("true");
    });

    it("omits blank filter values instead of sending empty params", async () => {
        await promotion.portfolio({ language: "", author: "   ", gapsOnly: false });
        expect(calledUrl()).toMatch(/\/promotion\/portfolio$/);
    });
});

describe("promotion.setFormatState", () => {
    it("PUTs the format state to the per-format endpoint", async () => {
        fetchSpy.mockResolvedValue(jsonOk(BOARD.books[0]));
        const row = await promotion.setFormatState("b1", "paperback", {
            status: "live",
            store_url: "https://amazon.de/dp/B02",
        });
        expect(calledUrl()).toMatch(/\/promotion\/portfolio\/b1\/formats\/paperback$/);
        expect(calledInit().method).toBe("PUT");
        expect(JSON.parse(String(calledInit().body))).toEqual({
            status: "live",
            store_url: "https://amazon.de/dp/B02",
        });
        expect(row.book_id).toBe("b1");
    });
});

describe("promotion.setUniversalLink", () => {
    it("PATCHes the book-level universal link", async () => {
        fetchSpy.mockResolvedValue(jsonOk(BOARD.books[0]));
        await promotion.setUniversalLink("b1", "https://books2read.com/x");
        expect(calledUrl()).toMatch(/\/promotion\/portfolio\/b1$/);
        expect(calledInit().method).toBe("PATCH");
        expect(JSON.parse(String(calledInit().body))).toEqual({
            universal_link: "https://books2read.com/x",
        });
    });

    it("sends an empty string to clear the link, not null", async () => {
        fetchSpy.mockResolvedValue(jsonOk(BOARD.books[0]));
        await promotion.setUniversalLink("b1", "");
        expect(JSON.parse(String(calledInit().body))).toEqual({ universal_link: "" });
    });
});
