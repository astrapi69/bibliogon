/**
 * useArticleImageUrl resolver tests (#157).
 *
 * api mode returns featured_image_url synchronously; dexie mode reads the
 * stored blob by asset id, mints a blob: URL, revokes it on unmount, and
 * falls back to the remote URL when no asset id / no stored blob.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useArticleImageUrl } from "./useArticleImageUrl";

const getStorageMock = vi.fn();
vi.mock("../../storage", () => ({
    getStorage: () => getStorageMock(),
}));

beforeEach(() => {
    getStorageMock.mockReset();
});

const apiStorage = () => ({ mode: "api", articleAssets: { getBlob: vi.fn() } });
const dexieStorage = (blob: Blob | null) => ({
    mode: "dexie",
    articleAssets: { getBlob: vi.fn().mockResolvedValue(blob) },
});

describe("useArticleImageUrl", () => {
    it("api mode returns featured_image_url synchronously", () => {
        getStorageMock.mockReturnValue(apiStorage());
        const { result } = renderHook(() =>
            useArticleImageUrl("a1", "https://cdn.example/x.png", null),
        );
        expect(result.current).toBe("https://cdn.example/x.png");
    });

    it("api mode returns null when there is no url", () => {
        getStorageMock.mockReturnValue(apiStorage());
        const { result } = renderHook(() => useArticleImageUrl("a1", null, null));
        expect(result.current).toBeNull();
    });

    it("dexie mode resolves a blob URL from the asset id", async () => {
        getStorageMock.mockReturnValue(dexieStorage(new Blob(["x"], { type: "image/png" })));
        const { result } = renderHook(() =>
            useArticleImageUrl("a1", "https://cdn.example/x.png", "asset-1"),
        );
        await waitFor(() => expect(result.current).toMatch(/^blob:/));
    });

    it("dexie mode falls back to the remote url when no asset id", async () => {
        getStorageMock.mockReturnValue(dexieStorage(null));
        const { result } = renderHook(() =>
            useArticleImageUrl("a1", "https://cdn.example/x.png", null),
        );
        await waitFor(() => expect(result.current).toBe("https://cdn.example/x.png"));
    });

    it("dexie mode falls back to the remote url when the blob is absent", async () => {
        getStorageMock.mockReturnValue(dexieStorage(null));
        const { result } = renderHook(() =>
            useArticleImageUrl("a1", "https://cdn.example/x.png", "missing"),
        );
        await waitFor(() => expect(result.current).toBe("https://cdn.example/x.png"));
    });

    it("dexie mode returns null when neither asset nor url resolve", async () => {
        getStorageMock.mockReturnValue(dexieStorage(null));
        const { result } = renderHook(() => useArticleImageUrl("a1", null, "missing"));
        await waitFor(() => expect(dexieStorage(null).articleAssets.getBlob).toBeDefined());
        expect(result.current).toBeNull();
    });

    it("dexie mode revokes the blob URL on unmount", async () => {
        getStorageMock.mockReturnValue(dexieStorage(new Blob(["x"], { type: "image/png" })));
        const revoke = vi.spyOn(URL, "revokeObjectURL");
        const { result, unmount } = renderHook(() => useArticleImageUrl("a1", null, "asset-1"));
        await waitFor(() => expect(result.current).toMatch(/^blob:/));
        const url = result.current as string;
        unmount();
        expect(revoke).toHaveBeenCalledWith(url);
        revoke.mockRestore();
    });
});
