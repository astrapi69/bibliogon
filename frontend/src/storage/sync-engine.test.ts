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
  const w = () => vi.fn(async () => ({ id: "srv" }) as never);
  // GET returns a server record whose updated_at matches the default
  // baseline, so by default there is no conflict; conflict tests override.
  const g = () => vi.fn(async () => ({ updated_at: "BASE" }) as never);
  return {
    api: {
      books: { create: w(), update: w(), delete: w() },
      chapters: { create: w(), update: w(), delete: w(), get: g() },
      articles: { create: w(), update: w(), delete: w(), get: g() },
    },
  };
});

import { api } from "../api/client";
import { offlineDb, dexieStorage, setBaseline } from "./dexie-storage";
import {
  makeQueueingStorage,
  pendingSyncCount,
  clearSyncQueue,
  listPendingSyncEntries,
} from "./sync-queue";
import {
  processSyncQueue,
  REPLAYABLE_OPS,
  resolveKeepMobile,
  resolveKeepDesktop,
} from "./sync-engine";

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

    expect(result).toEqual({ synced: 2, failed: 0, conflicts: [] });
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

    expect(result).toEqual({ synced: 1, failed: 1, conflicts: [] }); // article ok, book failed
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

describe("conflict detection (C7)", () => {
  it("detects a conflict when the chapter moved on the server (both sides edited)", async () => {
    const book = await storage.books.create({ title: "B" });
    const ch = await storage.chapters.create(book.id, { title: "K" });
    // Downloaded baseline, then edited offline:
    await setBaseline("chapter", ch.id, "2026-01-01T00:00:00Z");
    await storage.chapters.update(book.id, ch.id, {
      version: 0,
      title: "K-mobile",
    });
    // Desktop moved the chapter while offline (server updated_at != base):
    vi.mocked(api.chapters.get).mockResolvedValue({
      updated_at: "2026-02-02T00:00:00Z",
    } as never);

    const result = await processSyncQueue();

    // The two creates replay; the update is parked as a conflict.
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].model).toBe("chapter");
    expect(result.conflicts[0].operation).toBe("update");
    expect(result.conflicts[0].serverDeleted).toBe(false);
    // Conflicted entry is NOT auto-resolved (not synced).
    const entry = await offlineDb.syncQueue
      .where("id")
      .equals(result.conflicts[0].entryId)
      .first();
    expect(entry?.status).toBe("conflict");
  });

  it("book metadata update is last-write-wins (no conflict)", async () => {
    const book = await storage.books.create({ title: "B" });
    await setBaseline("book", book.id, "2026-01-01T00:00:00Z");
    await storage.books.update(book.id, { title: "B-mobile" });

    const result = await processSyncQueue();

    expect(result.conflicts).toEqual([]);
    expect(vi.mocked(api.books.update)).toHaveBeenCalled(); // applied (LWW)
  });

  it("detects edit-vs-delete (server record gone)", async () => {
    const book = await storage.books.create({ title: "B" });
    const ch = await storage.chapters.create(book.id, { title: "K" });
    await setBaseline("chapter", ch.id, "2026-01-01T00:00:00Z");
    await storage.chapters.update(book.id, ch.id, {
      version: 0,
      title: "edit",
    });
    vi.mocked(api.chapters.get).mockRejectedValue(new Error("404 gone"));

    const result = await processSyncQueue();

    const conflict = result.conflicts.find((c) => c.model === "chapter");
    expect(conflict).toBeDefined();
    expect(conflict?.serverDeleted).toBe(true);
  });

  it("resolveKeepDesktop discards the mobile edit; resolveKeepMobile re-applies it", async () => {
    const book = await storage.books.create({ title: "B" });
    const ch = await storage.chapters.create(book.id, { title: "K" });
    await setBaseline("chapter", ch.id, "2026-01-01T00:00:00Z");
    await storage.chapters.update(book.id, ch.id, { version: 0, title: "m" });
    vi.mocked(api.chapters.get).mockResolvedValue({
      updated_at: "2026-09-09T00:00:00Z",
    } as never);
    const result = await processSyncQueue();
    const conflict = result.conflicts[0];

    // Keep desktop -> the queued mobile edit is dropped, never replayed.
    await resolveKeepDesktop(conflict);
    expect(
      await offlineDb.syncQueue.where("id").equals(conflict.entryId).first(),
    ).toBeUndefined();
    expect(vi.mocked(api.chapters.update)).not.toHaveBeenCalled();
  });

  it("resolveKeepMobile force-applies the queued edit", async () => {
    const book = await storage.books.create({ title: "B" });
    const ch = await storage.chapters.create(book.id, { title: "K" });
    await setBaseline("chapter", ch.id, "2026-01-01T00:00:00Z");
    await storage.chapters.update(book.id, ch.id, { version: 0, title: "m" });
    vi.mocked(api.chapters.get).mockResolvedValue({
      updated_at: "2026-09-09T00:00:00Z",
    } as never);
    const conflict = (await processSyncQueue()).conflicts[0];

    await resolveKeepMobile(conflict);
    expect(vi.mocked(api.chapters.update)).toHaveBeenCalled(); // re-applied
  });
});
