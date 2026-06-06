/**
 * useAssetUrl / useCoverUrl resolver tests (P3c).
 *
 * api mode resolves the served file URL synchronously; dexie mode reads the
 * blob from the storage seam, mints a blob: URL, and revokes it on unmount.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useAssetUrl, useCoverUrl } from "./useAssetUrl";

const getStorageMock = vi.fn();
vi.mock("../storage", () => ({
  getStorage: () => getStorageMock(),
  // Offline capability off in the resolver tests, so the lazy-cache effect is
  // a no-op (no dynamic offline-download import).
  isOfflineEnabled: () => false,
}));

beforeEach(() => {
  getStorageMock.mockReset();
});

const apiStorage = () => ({ mode: "api", assets: { getBlob: vi.fn() } });
const dexieStorage = (blob: Blob | null) => ({
  mode: "dexie",
  assets: { getBlob: vi.fn().mockResolvedValue(blob) },
});

describe("useAssetUrl", () => {
  it("api mode returns the served file URL synchronously", () => {
    getStorageMock.mockReturnValue(apiStorage());
    const { result } = renderHook(() => useAssetUrl("b1", "fig.png"));
    expect(result.current).toBe("/api/books/b1/assets/file/fig.png");
  });

  it("returns null when filename is missing", () => {
    getStorageMock.mockReturnValue(apiStorage());
    const { result } = renderHook(() => useAssetUrl("b1", null));
    expect(result.current).toBeNull();
  });

  it("dexie mode resolves a blob URL from the seam", async () => {
    getStorageMock.mockReturnValue(
      dexieStorage(new Blob(["x"], { type: "image/png" })),
    );
    const { result } = renderHook(() => useAssetUrl("b1", "fig.png"));
    await waitFor(() => expect(result.current).toMatch(/^blob:/));
  });

  it("dexie mode returns null when the blob is absent", async () => {
    getStorageMock.mockReturnValue(dexieStorage(null));
    const { result } = renderHook(() => useAssetUrl("b1", "missing.png"));
    await waitFor(() => expect(getStorageMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("dexie mode revokes the blob URL on unmount", async () => {
    getStorageMock.mockReturnValue(
      dexieStorage(new Blob(["x"], { type: "image/png" })),
    );
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { result, unmount } = renderHook(() => useAssetUrl("b1", "fig.png"));
    await waitFor(() => expect(result.current).toMatch(/^blob:/));
    const url = result.current as string;
    unmount();
    expect(revoke).toHaveBeenCalledWith(url);
    revoke.mockRestore();
  });
});

describe("useCoverUrl", () => {
  it("extracts the trailing filename from a stored cover path", () => {
    getStorageMock.mockReturnValue(apiStorage());
    const { result } = renderHook(() =>
      useCoverUrl("b1", "assets/covers/cover-b1.png"),
    );
    expect(result.current).toBe("/api/books/b1/assets/file/cover-b1.png");
  });

  it("returns null for an unset cover", () => {
    getStorageMock.mockReturnValue(apiStorage());
    const { result } = renderHook(() => useCoverUrl("b1", null));
    expect(result.current).toBeNull();
  });
});
