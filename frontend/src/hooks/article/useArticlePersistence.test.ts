/**
 * #1021 regression pins: a failure that is not an ``ApiError`` must not
 * vanish.
 *
 * All three paths in this hook caught with ``if (err instanceof ApiError)``,
 * which covers API mode (where essentially every failure IS an ApiError) and
 * drops everything the storage seam throws offline - Dexie raises plain
 * ``Error``s (``notFound``, ``DataError``, ``QuotaExceededError``,
 * ``ConstraintError``). The content path was the damaging one: it set
 * ``saving`` before the write and only left that state inside the ``if``, so
 * a dropped failure left the spinner running with no toast, which the user
 * reads as "still saving".
 *
 * Surfaced by the offline E2E in #747, where the save indicator stayed up for
 * 15 s on all three attempts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const articleRow = {
    id: "a-1",
    title: "Ein Text",
    content_json: '{"type":"doc","content":[]}',
    tags: [],
};

const mockGet = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../storage", () => ({
    getStorage: () => ({
        articles: {
            get: (...args: unknown[]) => mockGet(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
        },
    }),
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: {error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn()},
}));

import { notify } from "../../utils/platform/notify";
import { useArticlePersistence } from "./useArticlePersistence";

const t = (_key: string, fallback: string) => fallback;

describe("useArticlePersistence — non-ApiError failures (#1021)", () => {
    beforeEach(() => {
        mockGet.mockReset();
        mockUpdate.mockReset();
        vi.mocked(notify.error).mockClear();
        mockGet.mockResolvedValue(articleRow);
    });

    it("leaves no content save stuck in 'saving' when the seam throws a plain Error", async () => {
        // What Dexie actually throws: notFound(), DataError, QuotaExceeded.
        mockUpdate.mockRejectedValue(new Error("Article a-1 not found"));
        const {result} = renderHook(() => useArticlePersistence("a-1", t));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.persistContent('{"type":"doc","content":[1]}');
        });

        // Pre-fix this is "saving" forever - the state the indicator renders
        // as a spinner, which is the lie.
        expect(result.current.saveStatus).toBe("error");
        expect(notify.error).toHaveBeenCalled();
    });

    it("still reports an ApiError the same way", async () => {
        const {ApiError} = await import("../../api/client");
        mockUpdate.mockRejectedValue(new ApiError(500, "boom", "/api/articles/a-1", "PATCH"));
        const {result} = renderHook(() => useArticlePersistence("a-1", t));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.persistContent('{"type":"doc","content":[1]}');
        });

        expect(result.current.saveStatus).toBe("error");
        expect(notify.error).toHaveBeenCalled();
    });

    it("reports a metadata write that fails with a plain Error", async () => {
        mockUpdate.mockRejectedValue(new Error("QuotaExceededError"));
        const {result} = renderHook(() => useArticlePersistence("a-1", t));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.persistMeta({title: "Neuer Titel"});
        });

        expect(notify.error).toHaveBeenCalled();
    });

    it("reports a load that fails with a plain Error", async () => {
        mockGet.mockRejectedValue(new Error("DataError"));
        const {result} = renderHook(() => useArticlePersistence("a-1", t));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.article).toBeNull();
        expect(notify.error).toHaveBeenCalled();
    });

    it("keeps a successful save on the cleared path", async () => {
        mockUpdate.mockResolvedValue({...articleRow});
        const {result} = renderHook(() => useArticlePersistence("a-1", t));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.persistContent('{"type":"doc","content":[1]}');
        });

        expect(result.current.saveStatus).toBe("saved");
        expect(notify.error).not.toHaveBeenCalled();
    });
});
