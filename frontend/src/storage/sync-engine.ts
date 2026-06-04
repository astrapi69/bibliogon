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
import { getBaseline } from "./dexie-storage";
import {
  getSyncEntry,
  listPendingSyncEntries,
  markConflict,
  markFailed,
  markSynced,
} from "./sync-queue";

/** A queued mutation parked because the desktop moved the same record
 *  while the phone was offline (C7). Surfaced to the user, who picks
 *  keep-mobile / keep-desktop / both (ConflictResolutionDialog). */
export interface SyncConflict {
  entryId: string;
  model: SyncQueueEntry["model"];
  operation: SyncQueueEntry["operation"];
  entity_id: string;
  book_id: string | null;
  /** Mobile-side edit payload (for the "keep mobile" preview). */
  localPayload: Record<string, unknown> | null;
  /** Whether the server record was deleted (edit-vs-delete conflict). */
  serverDeleted: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: SyncConflict[];
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

/** Fetch the server's current record for conflict comparison; null if
 *  the server record is gone (404) or the model isn't conflict-checked. */
async function fetchServer(
  entry: SyncQueueEntry,
): Promise<{ updated_at: string } | null> {
  try {
    if (entry.model === "chapter") {
      return await api.chapters.get(entry.book_id ?? "", entry.entity_id);
    }
    if (entry.model === "article") {
      return await api.articles.get(entry.entity_id);
    }
    return null;
  } catch {
    return null; // 404 / unreachable -> treated as "server record gone"
  }
}

type Classification = "ok" | "conflict" | "gone";

/** Decide whether replaying `entry` would clobber a desktop-side edit.
 *  Books are last-write-wins (metadata) -> never conflict. Creates never
 *  conflict. For chapter/article update|delete, compare the server's
 *  current `updated_at` against the download baseline. */
async function classify(entry: SyncQueueEntry): Promise<Classification> {
  if (entry.model === "book" || entry.operation === "create") return "ok";
  const server = await fetchServer(entry);
  if (!server) {
    // Server record gone: a delete is already satisfied (idempotent); an
    // update against a deleted record is an edit-vs-delete conflict.
    return entry.operation === "delete" ? "gone" : "conflict";
  }
  const base = await getBaseline(entry.model, entry.entity_id);
  return base !== null && server.updated_at !== base ? "conflict" : "ok";
}

function toConflict(
  entry: SyncQueueEntry,
  serverDeleted: boolean,
): SyncConflict {
  return {
    entryId: entry.id,
    model: entry.model,
    operation: entry.operation,
    entity_id: entry.entity_id,
    book_id: entry.book_id,
    localPayload: entry.payload,
    serverDeleted,
  };
}

/** Drain the pending queue in FIFO (= FK-safe) order. Each mutation is
 *  conflict-checked, then replayed against the API. Conflicts are parked
 *  (status "conflict") and returned for the user to resolve; failures are
 *  retained (status "failed"); nothing is dropped without a successful
 *  replay. */
export async function processSyncQueue(): Promise<SyncResult> {
  const pending = await listPendingSyncEntries();
  let synced = 0;
  let failed = 0;
  const conflicts: SyncConflict[] = [];
  for (const entry of pending) {
    try {
      const cls = await classify(entry);
      if (cls === "conflict") {
        await markConflict(entry.id);
        conflicts.push(toConflict(entry, (await fetchServer(entry)) === null));
        continue;
      }
      if (cls === "gone") {
        // Delete already satisfied server-side; nothing to replay.
        await markSynced(entry.id);
        synced += 1;
        continue;
      }
      await replay(entry);
      await markSynced(entry.id);
      synced += 1;
    } catch (err) {
      await markFailed(entry.id, String(err));
      failed += 1;
    }
  }
  return { synced, failed, conflicts };
}

/** Resolve a conflict by KEEPING the mobile edit: re-replay the original
 *  mutation against the API (force) and drop the queue entry. */
export async function resolveKeepMobile(conflict: SyncConflict): Promise<void> {
  const entry = await getSyncEntry(conflict.entryId);
  if (!entry) return;
  await replay(entry);
  await markSynced(entry.id);
}

/** Resolve a conflict by KEEPING the desktop (server) version: discard
 *  the mobile edit (drop the queue entry). The next download refreshes
 *  the local copy + baseline. Desktop is the Variant-C default. */
export async function resolveKeepDesktop(
  conflict: SyncConflict,
): Promise<void> {
  await markSynced(conflict.entryId); // markSynced removes the entry by id
}
