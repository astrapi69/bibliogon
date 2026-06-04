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
import { offlineDb } from "./dexie-storage";
import {
  downloadBookOffline,
  removeBookOffline,
  listOfflineBookIds,
  isBookOffline,
} from "./offline-download";

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

    expect(phases).toEqual(["fetching", "storing", "done"]);
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
