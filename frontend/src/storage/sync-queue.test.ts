/**
 * Offline write queue (mobile-sync Phase 3, C5).
 *
 * Pins the mandated queue contract: offline writes enqueue a pending
 * entry (reads do not), the queue preserves creation order (the replay
 * order, C6), and mark-synced / mark-failed mutate the right entry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";

import { offlineDb, dexieStorage } from "./dexie-storage";
import {
  makeQueueingStorage,
  listPendingSyncEntries,
  pendingSyncCount,
  markSynced,
  markFailed,
  clearSyncQueue,
} from "./sync-queue";

const storage = makeQueueingStorage(dexieStorage);

beforeEach(async () => {
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
  await clearSyncQueue();
});

describe("offline write queue", () => {
  it("enqueues a pending entry per write; reads do not enqueue", async () => {
    const book = await storage.books.create({ title: "B" });
    await storage.chapters.create(book.id, { title: "K1" });
    await storage.books.list(); // read -> no entry
    await storage.books.get(book.id); // read -> no entry

    const pending = await listPendingSyncEntries();
    expect(pending.map((e) => `${e.model}:${e.operation}`)).toEqual([
      "book:create",
      "chapter:create",
    ]);
    expect(await pendingSyncCount()).toBe(2);
    // chapter entry carries its parent book id for the API path.
    expect(pending[1].book_id).toBe(book.id);
  });

  it("preserves creation order across mixed ops (FIFO replay order)", async () => {
    const book = await storage.books.create({ title: "B" });
    const c1 = await storage.chapters.create(book.id, { title: "K1" });
    await storage.chapters.update(book.id, c1.id, {
      version: c1.version,
      title: "K1b",
    });
    await storage.chapters.delete(book.id, c1.id);

    const seq = (await listPendingSyncEntries()).map(
      (e) => `${e.model}:${e.operation}`,
    );
    expect(seq).toEqual([
      "book:create",
      "chapter:create",
      "chapter:update",
      "chapter:delete",
    ]);
  });

  it("markSynced removes one entry; markFailed flags it (drops from pending)", async () => {
    await storage.articles.create({ title: "A1" });
    await storage.articles.create({ title: "A2" });
    const pending = await listPendingSyncEntries();
    expect(pending).toHaveLength(2);

    await markSynced(pending[0].id);
    expect(await pendingSyncCount()).toBe(1);

    await markFailed(pending[1].id, "boom");
    expect(await pendingSyncCount()).toBe(0); // failed is no longer pending
    const failed = await offlineDb.syncQueue
      .where("id")
      .equals(pending[1].id)
      .first();
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("boom");
  });
});
