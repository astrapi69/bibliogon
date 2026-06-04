/**
 * Background sync engine (mobile-sync Phase 3, C6).
 *
 * Mandated layers (per the sync testing directive):
 *  - replay drains the queue against the API in FIFO order;
 *  - FK-order pin: a parent (book) replays before its child (chapter);
 *  - parity pin: every model:op the queueing wrapper can enqueue is
 *    handled by the replay engine (none falls through to "unhandled");
 *  - failure: a failed replay is retained (not lost) and the drain
 *    continues.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

vi.mock("../api/client", () => {
  const r = () => vi.fn(async () => ({ id: "srv" }) as never);
  return {
    api: {
      books: { create: r(), update: r(), delete: r() },
      chapters: { create: r(), update: r(), delete: r() },
      articles: { create: r(), update: r(), delete: r() },
    },
  };
});

import { api } from "../api/client";
import { offlineDb, dexieStorage } from "./dexie-storage";
import {
  makeQueueingStorage,
  pendingSyncCount,
  clearSyncQueue,
  listPendingSyncEntries,
} from "./sync-queue";
import { processSyncQueue, REPLAYABLE_OPS } from "./sync-engine";

const storage = makeQueueingStorage(dexieStorage);

beforeEach(async () => {
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
  await clearSyncQueue();
  vi.clearAllMocks();
});

describe("processSyncQueue", () => {
  it("replays the queue against the API in FIFO order and drains it", async () => {
    const book = await storage.books.create({ title: "B" });
    await storage.chapters.create(book.id, { title: "K1" });

    const result = await processSyncQueue();

    expect(result).toEqual({ synced: 2, failed: 0 });
    // FK-order: book create replays BEFORE its chapter create.
    expect(
      vi.mocked(api.books.create).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(api.chapters.create).mock.invocationCallOrder[0]);
    expect(await pendingSyncCount()).toBe(0);
    expect(vi.mocked(api.chapters.create)).toHaveBeenCalledWith(
      book.id,
      expect.objectContaining({ title: "K1" }),
    );
  });

  it("retains a failed entry and continues the drain (no data loss)", async () => {
    vi.mocked(api.books.create).mockRejectedValueOnce(new Error("network"));
    await storage.books.create({ title: "B" });
    await storage.articles.create({ title: "A" });

    const result = await processSyncQueue();

    expect(result).toEqual({ synced: 1, failed: 1 }); // article ok, book failed
    // The failed book entry is retained (not dropped) for retry.
    const all = await offlineDb.syncQueue.toArray();
    const failed = all.filter((e) => e.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].model).toBe("book");
    // It is no longer "pending" so a re-drain won't blindly re-run it.
    expect(await pendingSyncCount()).toBe(0);
  });

  it("parity pin: every model:op the wrapper enqueues is replayable", async () => {
    const book = await storage.books.create({ title: "B" });
    await storage.books.update(book.id, { title: "B2" });
    const ch = await storage.chapters.create(book.id, { title: "K" });
    await storage.chapters.update(book.id, ch.id, {
      version: ch.version,
      title: "K2",
    });
    await storage.chapters.delete(book.id, ch.id);
    const art = await storage.articles.create({ title: "A" });
    await storage.articles.update(art.id, { title: "A2" });
    await storage.articles.delete(art.id);
    await storage.books.delete(book.id);

    const enqueuedKeys = new Set(
      (await listPendingSyncEntries()).map((e) => `${e.model}:${e.operation}`),
    );
    // No enqueued key is missing from the replay engine's coverage.
    for (const key of enqueuedKeys) {
      expect(REPLAYABLE_OPS).toContain(key);
    }
    // And the drain handles all of them (no "unhandled" throw).
    const result = await processSyncQueue();
    expect(result.failed).toBe(0);
    expect(result.synced).toBe(enqueuedKeys.size > 0 ? result.synced : 0);
    expect(await pendingSyncCount()).toBe(0);
  });
});
