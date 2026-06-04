/**
 * Background sync engine (mobile-sync Phase 3, C6).
 *
 * On reconnect (useStorageMode's onReconnect, wired in C9) the pending
 * offline write queue is drained in FIFO order and each mutation is
 * replayed against the live API. FIFO = creation order, which is also
 * FK-safe: a parent (book) was created before its child (chapter), so
 * its queue entry replays first.
 *
 * Failure policy (directive "retry, don't lose data"): a failed replay
 * marks that entry `failed` and the drain CONTINUES with the rest; the
 * failed entry is retained (not dropped) for a later retry / surfacing.
 * Nothing is ever deleted from the queue without a successful replay.
 *
 * Note (id reconciliation): an offline create posts with the server
 * generating a fresh id; the local Dexie row keeps its client id. Local
 * id <-> server id reconciliation is a tracked follow-up (Variant C,
 * desktop-authoritative); C6 establishes the replay path + FK order.
 */

import { api } from "../api/client";
import type {
  ArticleCreate,
  ArticleUpdate,
  BookCreate,
  ChapterCreate,
} from "../api/client";
import type { SyncQueueEntry } from "./dexie-storage";
import { listPendingSyncEntries, markFailed, markSynced } from "./sync-queue";

export interface SyncResult {
  synced: number;
  failed: number;
}

/** Replay one queued mutation against the API. Throws on API failure or
 *  an unhandled model/operation (the latter is a programming error the
 *  parity test guards against). */
async function replay(entry: SyncQueueEntry): Promise<void> {
  const payload = entry.payload ?? {};
  const key = `${entry.model}:${entry.operation}`;
  switch (key) {
    case "book:create":
      await api.books.create(payload as unknown as BookCreate);
      return;
    case "book:update":
      await api.books.update(
        entry.entity_id,
        payload as unknown as Partial<BookCreate>,
      );
      return;
    case "book:delete":
      await api.books.delete(entry.entity_id);
      return;
    case "chapter:create":
      await api.chapters.create(
        entry.book_id ?? "",
        payload as unknown as ChapterCreate,
      );
      return;
    case "chapter:update":
      await api.chapters.update(
        entry.book_id ?? "",
        entry.entity_id,
        payload as unknown as Parameters<typeof api.chapters.update>[2],
      );
      return;
    case "chapter:delete":
      await api.chapters.delete(entry.book_id ?? "", entry.entity_id);
      return;
    case "article:create":
      await api.articles.create(payload as unknown as ArticleCreate);
      return;
    case "article:update":
      await api.articles.update(
        entry.entity_id,
        payload as unknown as ArticleUpdate,
      );
      return;
    case "article:delete":
      await api.articles.delete(entry.entity_id);
      return;
    default:
      throw new Error(`Unhandled sync op: ${key}`);
  }
}

/** The model:operation keys the sync engine can replay. Kept in sync
 *  with the queueing-storage wrapper by the parity test. */
export const REPLAYABLE_OPS: readonly string[] = [
  "book:create",
  "book:update",
  "book:delete",
  "chapter:create",
  "chapter:update",
  "chapter:delete",
  "article:create",
  "article:update",
  "article:delete",
];

/** Drain the pending queue in FIFO (= FK-safe) order, replaying each
 *  mutation against the API. Continues past failures (retaining the
 *  failed entry); returns a synced/failed summary. */
export async function processSyncQueue(): Promise<SyncResult> {
  const pending = await listPendingSyncEntries();
  let synced = 0;
  let failed = 0;
  for (const entry of pending) {
    try {
      await replay(entry);
      await markSynced(entry.id);
      synced += 1;
    } catch (err) {
      await markFailed(entry.id, String(err));
      failed += 1;
    }
  }
  return { synced, failed };
}
