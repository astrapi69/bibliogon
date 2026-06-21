/**
 * Tests for DASHBOARD-PAGINATION-LOAD-MORE-01 C3: usePagedList hook.
 *
 * Pins the load-bearing behaviours that the Dashboard / ArticleList
 * pagination relies on:
 *
 *   1. Reads ``ui.dashboard.{books,articles}_page_size`` from app
 *      config on mount; falls back to 25 when unset or invalid.
 *   2. ``loadMore`` bumps ``limit`` by ``pageSize``.
 *   3. ``setPageSize`` snaps ``limit`` to the new page size AND
 *      persists the choice via ``api.settings.updateApp`` with
 *      read-merge-write semantics (sibling keys preserved).
 *   4. ``reset`` snaps ``limit`` back to ``pageSize`` (consumed by
 *      page-level useEffect on filter-state change).
 *   5. Scope switch re-reads the appropriate key.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getAppMock = vi.fn();
const updateAppMock = vi.fn();

vi.mock("../../api/client", () => ({
    api: {
        settings: {
            getApp: () => getAppMock(),
            updateApp: (...args: unknown[]) => updateAppMock(...args),
        },
    },
    ApiError: class ApiError extends Error {},
}));

import { usePagedList, DEFAULT_PAGE_SIZE } from "./usePagedList";

beforeEach(() => {
    getAppMock.mockReset();
    updateAppMock.mockReset();
    updateAppMock.mockResolvedValue({});
});

describe("usePagedList", () => {
    it("reads books_page_size from app config on mount", async () => {
        getAppMock.mockResolvedValue({
            ui: { dashboard: { books_page_size: 50 } },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pageSize).toBe(50);
        expect(result.current.limit).toBe(50);
    });

    it("reads articles_page_size from app config on mount", async () => {
        getAppMock.mockResolvedValue({
            ui: { dashboard: { articles_page_size: 100 } },
        });
        const { result } = renderHook(() => usePagedList("articles"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pageSize).toBe(100);
        expect(result.current.limit).toBe(100);
    });

    it("falls back to 25 when the page-size key is unset", async () => {
        getAppMock.mockResolvedValue({ ui: { dashboard: {} } });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
        expect(result.current.limit).toBe(DEFAULT_PAGE_SIZE);
    });

    it("falls back to 25 when the API call fails", async () => {
        getAppMock.mockRejectedValue(new Error("network down"));
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
    });

    it("falls back to 25 when the stored value is invalid (e.g. 33)", async () => {
        getAppMock.mockResolvedValue({
            ui: { dashboard: { books_page_size: 33 } },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
    });

    it("loadMore increments limit by pageSize", async () => {
        getAppMock.mockResolvedValue({
            ui: { dashboard: { books_page_size: 25 } },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.limit).toBe(25);

        act(() => result.current.loadMore());
        expect(result.current.limit).toBe(50);

        act(() => result.current.loadMore());
        expect(result.current.limit).toBe(75);
    });

    it("reset snaps limit back to pageSize", async () => {
        getAppMock.mockResolvedValue({
            ui: { dashboard: { books_page_size: 25 } },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.loadMore());
        act(() => result.current.loadMore());
        expect(result.current.limit).toBe(75);

        act(() => result.current.reset());
        expect(result.current.limit).toBe(25);
    });

    it("setPageSize updates pageSize AND snaps limit to the new size", async () => {
        getAppMock.mockResolvedValue({
            ui: { dashboard: { books_page_size: 25 } },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.loadMore());
        expect(result.current.limit).toBe(50);

        act(() => result.current.setPageSize(100));
        expect(result.current.pageSize).toBe(100);
        // Snap to the new size (not 50 + 100), so the user sees a
        // fresh first page at the chosen size.
        expect(result.current.limit).toBe(100);
    });

    it("setPageSize persists via updateApp with sibling keys preserved", async () => {
        getAppMock.mockResolvedValue({
            ui: {
                sidebar_collapsed: true,
                dashboard: {
                    books_view: "grid",
                    books_page_size: 25,
                    articles_page_size: 50, // sibling — must survive the write
                },
            },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.setPageSize(100));

        await waitFor(() => expect(updateAppMock).toHaveBeenCalled());
        const lastCall = updateAppMock.mock.calls[updateAppMock.mock.calls.length - 1];
        expect(lastCall[0]).toEqual({
            ui: {
                sidebar_collapsed: true,
                dashboard: {
                    books_view: "grid",
                    books_page_size: 100,
                    articles_page_size: 50,
                },
            },
        });
    });

    it("scope switch re-reads the appropriate key", async () => {
        getAppMock.mockResolvedValue({
            ui: {
                dashboard: {
                    books_page_size: 100,
                    articles_page_size: 50,
                },
            },
        });

        const { result, rerender } = renderHook(
            ({ scope }: { scope: "books" | "articles" }) => usePagedList(scope),
            { initialProps: { scope: "books" as "books" | "articles" } },
        );

        await waitFor(() => expect(result.current.pageSize).toBe(100));

        rerender({ scope: "articles" });
        await waitFor(() => expect(result.current.pageSize).toBe(50));
    });
});
