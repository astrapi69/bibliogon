/**
 * Tests for Bug 3 fix: useTrashViewMode hook.
 *
 * Pins the two behaviours that distinguish trash view-mode from
 * active view-mode:
 *
 *   1. On mount, the hook reads ``ui.dashboard.books_trash_view``
 *      (or ``articles_trash_view``) from app config and uses it
 *      as the initial mode. Falls back to "grid" when the key is
 *      unset or invalid.
 *   2. setMode is LOCAL-ONLY — it updates the hook's internal
 *      state but does NOT write back to YAML. Contrast with
 *      useViewMode, which writes through on every toggle.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getAppMock = vi.fn();
const updateAppMock = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        settings: {
            getApp: () => getAppMock(),
            updateApp: (...args: unknown[]) => updateAppMock(...args),
        },
    },
    ApiError: class ApiError extends Error {},
}));

import { useTrashViewMode } from "./useViewMode";

beforeEach(() => {
    getAppMock.mockReset();
    updateAppMock.mockReset();
});

describe("useTrashViewMode (Bug 3)", () => {
    it("reads books_trash_view from app config on mount", async () => {
        getAppMock.mockResolvedValueOnce({
            ui: { dashboard: { books_trash_view: "list" } },
        });
        const { result } = renderHook(() => useTrashViewMode("books"));
        await waitFor(() => expect(result.current.mode).toBe("list"));
        expect(result.current.loading).toBe(false);
    });

    it("reads articles_trash_view from app config on mount", async () => {
        getAppMock.mockResolvedValueOnce({
            ui: { dashboard: { articles_trash_view: "list" } },
        });
        const { result } = renderHook(() => useTrashViewMode("articles"));
        await waitFor(() => expect(result.current.mode).toBe("list"));
    });

    it("falls back to grid when the trash key is unset", async () => {
        getAppMock.mockResolvedValueOnce({ ui: { dashboard: {} } });
        const { result } = renderHook(() => useTrashViewMode("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.mode).toBe("grid");
    });

    it("falls back to grid when the API call fails", async () => {
        getAppMock.mockRejectedValueOnce(new Error("network down"));
        const { result } = renderHook(() => useTrashViewMode("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.mode).toBe("grid");
    });

    it("does NOT call updateApp on setMode (local-only)", async () => {
        getAppMock.mockResolvedValueOnce({
            ui: { dashboard: { books_trash_view: "grid" } },
        });
        const { result } = renderHook(() => useTrashViewMode("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setMode("list");
        });

        expect(result.current.mode).toBe("list");
        // The crucial assertion: setMode did NOT trigger a YAML write.
        expect(updateAppMock).not.toHaveBeenCalled();
    });

    it("scope switch re-reads the appropriate key", async () => {
        getAppMock
            .mockResolvedValueOnce({
                ui: { dashboard: { books_trash_view: "list", articles_trash_view: "grid" } },
            })
            .mockResolvedValueOnce({
                ui: { dashboard: { books_trash_view: "list", articles_trash_view: "grid" } },
            });

        const { result, rerender } = renderHook(
            ({ scope }: { scope: "books" | "articles" }) => useTrashViewMode(scope),
            { initialProps: { scope: "books" as "books" | "articles" } },
        );

        await waitFor(() => expect(result.current.mode).toBe("list"));

        rerender({ scope: "articles" });
        await waitFor(() => expect(result.current.mode).toBe("grid"));
    });
});
