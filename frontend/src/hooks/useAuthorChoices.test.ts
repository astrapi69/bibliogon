/**
 * Tests for useAuthorChoices hook.
 *
 * Covers: empty config, real name + pen names, dedup of duplicates,
 * filter of blank/whitespace entries, non-string pen names, and
 * silent fallback on API failure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../api/client", () => ({
    api: {
        settings: {
            getApp: vi.fn(),
        },
    },
}));

describe("useAuthorChoices", () => {
    let mockGetApp: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const { api } = await import("../api/client");
        mockGetApp = vi.mocked(api.settings.getApp);
        mockGetApp.mockReset();
    });

    it("returns empty array when author config is missing", async () => {
        mockGetApp.mockResolvedValue({});
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(mockGetApp).toHaveBeenCalled();
        });
        expect(result.current).toEqual([]);
    });

    it("returns real name first, then pen names", async () => {
        mockGetApp.mockResolvedValue({
            author: {
                name: "Jane Doe",
                pen_names: ["J.D. Crimson", "Joan Dark"],
            },
        });
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(result.current).toEqual([
                "Jane Doe",
                "J.D. Crimson",
                "Joan Dark",
            ]);
        });
    });

    it("deduplicates: pen name matching real name is dropped", async () => {
        mockGetApp.mockResolvedValue({
            author: {
                name: "Jane Doe",
                pen_names: ["Jane Doe", "Joan Dark"],
            },
        });
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(result.current).toEqual(["Jane Doe", "Joan Dark"]);
        });
    });

    it("filters blank + whitespace-only pen names", async () => {
        mockGetApp.mockResolvedValue({
            author: {
                name: "Jane",
                pen_names: ["", "   ", "Real Pen"],
            },
        });
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(result.current).toEqual(["Jane", "Real Pen"]);
        });
    });

    it("handles missing real name (pen names only)", async () => {
        mockGetApp.mockResolvedValue({
            author: { pen_names: ["Only Pen"] },
        });
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(result.current).toEqual(["Only Pen"]);
        });
    });

    it("drops non-string entries in pen_names", async () => {
        mockGetApp.mockResolvedValue({
            author: {
                name: "Jane",
                pen_names: ["Valid Pen", 42, null, { o: "obj" }],
            },
        });
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(result.current).toEqual(["Jane", "Valid Pen"]);
        });
    });

    it("silent fallback to empty list on API failure", async () => {
        mockGetApp.mockRejectedValue(new Error("boom"));
        const { useAuthorChoices } = await import("./useAuthorChoices");
        const { result } = renderHook(() => useAuthorChoices());
        await waitFor(() => {
            expect(mockGetApp).toHaveBeenCalled();
        });
        expect(result.current).toEqual([]);
    });
});
