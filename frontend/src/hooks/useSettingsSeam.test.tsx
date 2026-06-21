/**
 * Regression tests for #107 — settings reads in the dashboard/editor
 * hooks must flow through the ``getStorage()`` seam, not the raw
 * ``api.settings`` client.
 *
 * Same approach as the #106 view-switcher pin (useViewMode.test.ts):
 * the raw client is mocked as offline-rejecting (exactly what
 * ``guardedFetch`` does in Dexie mode) while the seam works. On the
 * pre-#107 code each hook silently fell back to its default; post-fix
 * the seam value lands and the raw client is never touched.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const apiGetAppMock = vi.fn();
const storageGetAppMock = vi.fn();
const storageUpdateAppMock = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        settings: {
            getApp: () => apiGetAppMock(),
            updateApp: vi.fn(),
        },
    },
    ApiError: class ApiError extends Error {},
}));

vi.mock("../storage", () => ({
    getStorage: () => ({
        settings: {
            getApp: () => storageGetAppMock(),
            updateApp: (...args: unknown[]) => storageUpdateAppMock(...args),
        },
    }),
}));

import { usePagedList } from "./ui/usePagedList";
import { useAllowBooksWithoutAuthor } from "./useAllowBooksWithoutAuthor";
import { useTopics } from "./content/useTopics";

beforeEach(() => {
    apiGetAppMock.mockReset();
    apiGetAppMock.mockRejectedValue(
        new Error("Offline: /api/settings/app requires the Bibliogon backend."),
    );
    storageGetAppMock.mockReset();
    storageUpdateAppMock.mockReset();
});

describe("settings reads go through the storage seam (#107)", () => {
    it("usePagedList loads the persisted page size via the seam offline", async () => {
        storageGetAppMock.mockResolvedValue({
            ui: { dashboard: { books_page_size: 50 } },
        });
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.pageSize).toBe(50);
        expect(apiGetAppMock).not.toHaveBeenCalled();
    });

    it("usePagedList persists a page-size change via the seam offline", async () => {
        storageGetAppMock.mockResolvedValue({
            ui: { dashboard: { articles_page_size: 25, books_view: "list" } },
        });
        storageUpdateAppMock.mockResolvedValue({});
        const { result } = renderHook(() => usePagedList("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        result.current.setPageSize(100);

        await waitFor(() => expect(storageUpdateAppMock).toHaveBeenCalledOnce());
        expect(storageUpdateAppMock).toHaveBeenCalledWith({
            ui: {
                dashboard: {
                    articles_page_size: 25,
                    books_view: "list",
                    books_page_size: 100,
                },
            },
        });
        expect(apiGetAppMock).not.toHaveBeenCalled();
    });

    it("useAllowBooksWithoutAuthor reads the toggle via the seam offline", async () => {
        storageGetAppMock.mockResolvedValue({
            app: { allow_books_without_author: true },
        });
        const { result } = renderHook(() => useAllowBooksWithoutAuthor());
        await waitFor(() => expect(result.current).toBe(true));
        expect(apiGetAppMock).not.toHaveBeenCalled();
    });

    it("useTopics reads the topics list via the seam offline", async () => {
        storageGetAppMock.mockResolvedValue({
            topics: ["KI", " Schreiben ", 42, ""],
        });
        const { result } = renderHook(() => useTopics());
        await waitFor(() => expect(result.current).toEqual(["KI", "Schreiben"]));
        expect(apiGetAppMock).not.toHaveBeenCalled();
    });
});
