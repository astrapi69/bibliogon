/**
 * Offline write queue (mobile-sync Phase 3, C5).
 *
 * When the client is offline every write goes to DexieStorage AND is
 * recorded as a `SyncQueueEntry`, so the background sync (C6) can replay
 * it against the API on reconnect. This module owns the queue logic and
 * the queueing-storage WRAPPER that records writes — DexieStorage itself
 * stays a pure storage backend (its C1 tests are unaffected).
 *
 * Online, none of this runs: getStorage() returns ApiStorage and writes
 * hit the API directly, exactly as before.
 */

import { offlineDb, type SyncQueueEntry } from "./dexie-storage";
import type { IStorageService } from "./types";

const nowIso = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();

type QueueModel = SyncQueueEntry["model"];
type QueueOp = SyncQueueEntry["operation"];

/** Append a pending mutation to the queue. */
export async function enqueue(
  model: QueueModel,
  operation: QueueOp,
  entityId: string,
  bookId: string | null,
  payload: Record<string, unknown> | null,
): Promise<void> {
  await offlineDb.syncQueue.add({
    id: newId(),
    model,
    operation,
    entity_id: entityId,
    book_id: bookId,
    payload,
    created_at: nowIso(),
    status: "pending",
    error: null,
  });
}

/** Pending entries in creation (= replay) order: ascending `seq`. */
export async function listPendingSyncEntries(): Promise<SyncQueueEntry[]> {
  return offlineDb.syncQueue
    .orderBy("seq")
    .filter((e) => e.status === "pending")
    .toArray();
}

export async function pendingSyncCount(): Promise<number> {
  return offlineDb.syncQueue.where("status").equals("pending").count();
}

export async function markSynced(entryId: string): Promise<void> {
  await offlineDb.syncQueue.where("id").equals(entryId).delete();
}

export async function markFailed(
  entryId: string,
  error: string,
): Promise<void> {
  await offlineDb.syncQueue
    .where("id")
    .equals(entryId)
    .modify({ status: "failed", error });
}

export async function markConflict(entryId: string): Promise<void> {
  await offlineDb.syncQueue
    .where("id")
    .equals(entryId)
    .modify({ status: "conflict" });
}

/** Entries parked as conflicts, awaiting user resolution (C7). */
export async function listConflictEntries(): Promise<SyncQueueEntry[]> {
  return offlineDb.syncQueue.where("status").equals("conflict").toArray();
}

/** A single queue entry by its uuid id (for conflict resolution). */
export async function getSyncEntry(
  entryId: string,
): Promise<SyncQueueEntry | undefined> {
  return offlineDb.syncQueue.where("id").equals(entryId).first();
}

export async function clearSyncQueue(): Promise<void> {
  await offlineDb.syncQueue.clear();
}

const asPayload = (v: unknown): Record<string, unknown> =>
  v as Record<string, unknown>;

/** Wrap a storage backend so every WRITE also records a queue entry.
 *  Reads delegate straight through. Used for the offline (Dexie)
 *  backend; the API backend is never wrapped.
 *
 *  Settings and reference data (settings, i18n, bookTypes, contentTypes,
 *  writingSessions) delegate straight through without a queue entry: in
 *  offline mode their writes are local-only (no server to sync them to yet). */
export function makeQueueingStorage(base: IStorageService): IStorageService {
  return {
    mode: base.mode,
    books: {
      list: base.books.list,
      get: base.books.get,
      create: async (data) => {
        const row = await base.books.create(data);
        await enqueue("book", "create", row.id, null, asPayload(row));
        return row;
      },
      update: async (id, data) => {
        const row = await base.books.update(id, data);
        await enqueue("book", "update", id, null, asPayload(data));
        return row;
      },
      delete: async (id) => {
        await base.books.delete(id);
        await enqueue("book", "delete", id, null, null);
      },
    },
    chapters: {
      list: base.chapters.list,
      get: base.chapters.get,
      create: async (bookId, data) => {
        const row = await base.chapters.create(bookId, data);
        await enqueue("chapter", "create", row.id, bookId, asPayload(row));
        return row;
      },
      update: async (bookId, chapterId, data) => {
        const row = await base.chapters.update(bookId, chapterId, data);
        await enqueue("chapter", "update", chapterId, bookId, asPayload(data));
        return row;
      },
      delete: async (bookId, chapterId) => {
        await base.chapters.delete(bookId, chapterId);
        await enqueue("chapter", "delete", chapterId, bookId, null);
      },
      // reorder is a bulk position write; it re-positions rows in
      // Dexie immediately. Replaying reorder is deferred (C6+ —
      // positions also sync via the per-chapter update path), so it
      // passes straight through without a queue entry for now.
      reorder: base.chapters.reorder,
    },
    articles: {
      list: base.articles.list,
      get: base.articles.get,
      create: async (data) => {
        const row = await base.articles.create(data);
        await enqueue("article", "create", row.id, null, asPayload(row));
        return row;
      },
      update: async (id, data) => {
        const row = await base.articles.update(id, data);
        await enqueue("article", "update", id, null, asPayload(data));
        return row;
      },
      delete: async (id) => {
        await base.articles.delete(id);
        await enqueue("article", "delete", id, null, null);
      },
    },
    settings: base.settings,
    i18n: base.i18n,
    bookTypes: base.bookTypes,
    contentTypes: base.contentTypes,
    writingSessions: base.writingSessions,
    authors: base.authors,
    // Read-only publishing surfaces: straight passthrough, no queue entry.
    publications: base.publications,
    articlePlatforms: base.articlePlatforms,
    editorPluginStatus: base.editorPluginStatus,
    // Chapter labels: local-only offline writes (replay deferred, like
    // authors); straight passthrough so the seam stays complete.
    chapterLabels: base.chapterLabels,
    // Story Bible: local-only offline writes (replay deferred); passthrough.
    storyBible: base.storyBible,
  };
}
