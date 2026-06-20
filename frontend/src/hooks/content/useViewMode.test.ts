/**
 * Regression tests for #106 — the grid/list view switcher on the
 * active dashboards (Book Dashboard + Article List).
 *
 * Root cause pinned here: useViewMode used to read the current
 * config via the RAW ``api.settings.getApp()`` client. In Dexie mode
 * (the GitHub-Pages PWA) ``guardedFetch`` rejects that call with an
 * offline ApiError BEFORE any network request, the persist chain's
 * rollback catch fired, and the optimistic toggle snapped straight
 * back to "grid" — clicking "Liste" visibly did nothing. The fix
 * routes every settings read through the ``getStorage()`` seam.
 *
 * The Dexie-mode test below mocks the raw client as offline-rejecting
 * (exactly what guardedFetch does) while the seam works: it FAILS on
 * the pre-fix code (rollback to grid + no persist) and passes after.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const apiGetAppMock = vi.fn();
const storageGetAppMock = vi.fn();
const storageUpdateAppMock = vi.fn();

vi.mock("../../api/client", () => ({
    api: {
        settings: {
            getApp: () => apiGetAppMock(),
            updateApp: vi.fn(),
        },
    },
    ApiError: class ApiError extends Error {},
}));

vi.mock("../../storage", () => ({
    getStorage: () => ({
        settings: {
            getApp: () => storageGetAppMock(),
            updateApp: (...args: unknown[]) => storageUpdateAppMock(...args),
        },
    }),
}));

import { ApiError } from "../../api/client";
import { useViewMode } from "./useViewMode";

beforeEach(() => {
    apiGetAppMock.mockReset();
    storageGetAppMock.mockReset();
    storageUpdateAppMock.mockReset();
});

describe("useViewMode (#106 regression)", () => {
    it("Dexie mode: toggling to list STICKS even though the raw api client rejects offline", async () => {
        const offlineError = new ApiError(
            503,
            "Offline: /api/settings/app requires the Bibliogon backend.",
            "/settings/app",
            "GET",
        );
        apiGetAppMock.mockRejectedValue(offlineError);
        storageGetAppMock.mockResolvedValue({ ui: { dashboard: {} } });
        storageUpdateAppMock.mockResolvedValue({});

        const { result } = renderHook(() => useViewMode("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setMode("list");
        });

        await waitFor(() => expect(storageUpdateAppMock).toHaveBeenCalledOnce());
        // Pre-fix: the raw-client rejection triggered the rollback and
        // this read "grid" — the user-visible "click does nothing" bug.
        expect(result.current.mode).toBe("list");
        // Post-fix the hook never touches the raw client at all.
        expect(apiGetAppMock).not.toHaveBeenCalled();
    });

    it("reads the persisted preference through the storage seam on mount", async () => {
        storageGetAppMock.mockResolvedValue({
            ui: { dashboard: { books_view: "list" } },
        });
        const { result } = renderHook(() => useViewMode("books"));
        await waitFor(() => expect(result.current.mode).toBe("list"));
        expect(result.current.loading).toBe(false);
        expect(apiGetAppMock).not.toHaveBeenCalled();
    });

    it("persists the toggle while keeping the OTHER scope's key intact", async () => {
        storageGetAppMock.mockResolvedValue({
            ui: { dashboard: { books_view: "grid", articles_view: "list" } },
        });
        storageUpdateAppMock.mockResolvedValue({});

        const { result } = renderHook(() => useViewMode("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setMode("list");
        });

        await waitFor(() => expect(storageUpdateAppMock).toHaveBeenCalledOnce());
        expect(storageUpdateAppMock).toHaveBeenCalledWith({
            ui: {
                dashboard: { books_view: "list", articles_view: "list" },
            },
        });
        expect(result.current.mode).toBe("list");
    });

    it("rolls back the optimistic toggle when the persist WRITE fails", async () => {
        storageGetAppMock.mockResolvedValue({ ui: { dashboard: {} } });
        storageUpdateAppMock.mockRejectedValue(
            new ApiError(500, "persist failed", "/settings/app", "PATCH"),
        );

        const { result } = renderHook(() => useViewMode("books"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setMode("list");
        });

        await waitFor(() => expect(result.current.mode).toBe("grid"));
    });

    it("falls back to grid when the seam read fails on mount", async () => {
        storageGetAppMock.mockRejectedValue(new Error("storage down"));
        const { result } = renderHook(() => useViewMode("articles"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.mode).toBe("grid");
    });
});
