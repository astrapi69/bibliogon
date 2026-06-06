/**
 * Selective offline download (mobile-sync Phase 3, C3).
 *
 * Mocks GET /api/books/{id}/full and asserts the graph lands in
 * IndexedDB, the book is flagged offline-available, offline mode is
 * enabled, and remove clears it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

vi.mock("../api/client", () => ({
  api: { books: { full: vi.fn() } },
}));

import { api } from "../api/client";
import { isOfflineEnabled, setOfflineEnabled } from "./connectivity";
import { offlineDb, type OfflineBookRow } from "./dexie-storage";
import {
  downloadBookOffline,
  removeBookOffline,
  listOfflineBookIds,
  isBookOffline,
  lazyCacheAsset,
} from "./offline-download";

const readText = async (blob: Blob): Promise<string> =>
  new TextDecoder().decode(await blob.arrayBuffer());

const blobResponse = (body: string, type = "image/png"): Response =>
  ({ ok: true, blob: async () => new Blob([body], { type }) }) as Response;

const GRAPH = {
  book: { id: "b1", title: "Offline-Roman" },
  chapters: [{ id: "c1", book_id: "b1", title: "Kap 1", position: 0 }],
  pages: [{ id: "p1", book_id: "b1", position: 0 }],
  comic_panels: [],
  comic_bubbles: [],
  story_entities: [{ id: "e1", book_id: "b1", name: "Held" }],
  story_entity_page_links: [],
  chapter_labels: [],
  assets: [],
};

beforeEach(async () => {
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
  setOfflineEnabled(false);
  vi.mocked(api.books.full).mockResolvedValue(GRAPH as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("downloadBookOffline", () => {
  it("writes the graph, flags the book, enables offline mode + reports progress", async () => {
    const phases: string[] = [];
    await downloadBookOffline("b1", (p) => phases.push(p.phase));

    expect(phases).toEqual(["fetching", "storing", "assets", "done"]);
    expect(isOfflineEnabled()).toBe(true);
    expect(await isBookOffline("b1")).toBe(true);
    expect(await listOfflineBookIds()).toEqual(["b1"]);

    expect((await offlineDb.chapters.get("c1"))?.title).toBe("Kap 1");
    expect(await offlineDb.pages.get("p1")).toBeTruthy();
    expect(await offlineDb.storyEntities.get("e1")).toBeTruthy();
  });

  it("removeBookOffline clears the book + its graph", async () => {
    await downloadBookOffline("b1");
    await removeBookOffline("b1");

    expect(await isBookOffline("b1")).toBe(false);
    expect(await listOfflineBookIds()).toEqual([]);
    expect(await offlineDb.chapters.get("c1")).toBeUndefined();
    expect(await offlineDb.pages.get("p1")).toBeUndefined();
    expect(await offlineDb.storyEntities.get("e1")).toBeUndefined();
  });
});

describe("downloadBookOffline — asset byte fetch (P3c)", () => {
  it("fetches each graph asset and stores it under its server id", async () => {
    vi.mocked(api.books.full).mockResolvedValue({
      ...GRAPH,
      assets: [
        { id: "a1", book_id: "b1", filename: "f.png", asset_type: "figure" },
      ],
    } as never);
    global.fetch = vi.fn().mockResolvedValue(blobResponse("IMGBYTES"));

    await downloadBookOffline("b1");

    // Stored under the SERVER id so id-served picture-book URLs resolve.
    const row = await offlineDb.assets.get("a1");
    expect(row?.bookId).toBe("b1");
    expect(row?.filename).toBe("f.png");
    expect(await readText(new Blob([row!.data]))).toBe("IMGBYTES");
  });

  it("a single failed asset fetch does not abort the download", async () => {
    vi.mocked(api.books.full).mockResolvedValue({
      ...GRAPH,
      assets: [
        { id: "a1", book_id: "b1", filename: "ok.png", asset_type: "figure" },
        { id: "a2", book_id: "b1", filename: "bad.png", asset_type: "figure" },
      ],
    } as never);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(blobResponse("OK"))
      .mockRejectedValueOnce(new Error("network"));

    await expect(downloadBookOffline("b1")).resolves.toBeUndefined();
    expect(await offlineDb.assets.get("a1")).toBeTruthy();
    expect(await offlineDb.assets.get("a2")).toBeUndefined();
  });
});

describe("lazyCacheAsset (P3c)", () => {
  const seedOfflineBook = async () => {
    await offlineDb.books.put({
      id: "b1",
      offline_available: true,
    } as unknown as OfflineBookRow);
  };

  it("caches an asset of an offline book once (skips if already cached)", async () => {
    await seedOfflineBook();
    const fetchMock = vi.fn().mockResolvedValue(blobResponse("LAZY"));
    global.fetch = fetchMock;

    await lazyCacheAsset("b1", "late.png");
    const blob = await offlineDb.assets
      .where("[bookId+filename]")
      .equals(["b1", "late.png"])
      .first();
    expect(blob).toBeTruthy();

    await lazyCacheAsset("b1", "late.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a book that is not offline-available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(blobResponse("X"));
    global.fetch = fetchMock;
    await lazyCacheAsset("not-offline", "x.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
