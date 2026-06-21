/**
 * Storage statistics + maintenance helpers for Settings > Daten.
 *
 * The Data-management tab needs a cheap, honest read of what the app
 * is holding in the browser's IndexedDB. Two signals are combined:
 *
 * - `navigator.storage.estimate()` for the real total byte usage +
 *   quota. This is the only accurate size figure available without
 *   loading every blob into memory (which the asset tables make
 *   prohibitively expensive).
 * - per-table `count()` for the entry-count breakdown. Dexie counts
 *   are index-backed and cheap, so the breakdown never loads rows.
 *
 * Deliberately NO per-category byte figures: deriving them would mean
 * reading every `ArrayBuffer` body, which defeats the point. The UI
 * shows entry counts per category plus the single total usage figure.
 *
 * The maintenance helpers (`clearEventLog`, `clearImageCache`) are
 * narrow, privacy-/space-oriented wipes that never touch user content
 * (books, articles, chapters). All reads/writes go through the Dexie
 * `offlineDb`, so this works the same online (API mode, where the
 * tables hold the local cache + diagnostic log) and offline (Dexie
 * mode, where they hold the full workspace).
 */

import { eventRecorder, type RecordedEvent } from "../utils/eventRecorder/eventRecorder";
import { EVENT_LOG_KEY, offlineDb, type EventLogSnapshot } from "./dexie/schema";

/** One headline category in the storage overview. `key` is both the
 *  i18n suffix (`ui.data.category_<key>`) and the testid suffix. */
export interface StorageCategory {
    key: string;
    count: number;
}

/** A raw Dexie table name + its row count, for the debug "show all
 *  data" view. */
export interface StorageTableStat {
    name: string;
    count: number;
}

/** The full storage picture rendered by the Daten tab. */
export interface StorageStats {
    categories: StorageCategory[];
    tables: StorageTableStat[];
    /** Bytes used by the origin (all storage, not just Dexie) per
     *  `navigator.storage.estimate()`, or null when unavailable. */
    usageBytes: number | null;
    /** Origin quota in bytes, or null when unavailable. */
    quotaBytes: number | null;
}

/** Read the count of recorded events from the persisted snapshot row.
 *  The diagnostic buffer is stored as a single row (capped at 100), so
 *  the "count" is the length of its `events` array. */
async function eventLogCount(): Promise<number> {
    const snapshot = (await offlineDb.eventLog.get(EVENT_LOG_KEY)) as EventLogSnapshot | undefined;
    return snapshot?.events?.length ?? 0;
}

/**
 * Gather the storage overview. Counts are taken per Dexie table
 * (index-backed, cheap); the total byte usage comes from
 * `navigator.storage.estimate()`. Never loads blob bodies.
 */
export async function getStorageStats(): Promise<StorageStats> {
    const [books, articles, assets, articleAssets, writingSessions, events] = await Promise.all([
        offlineDb.books.count(),
        offlineDb.articles.count(),
        offlineDb.assets.count(),
        offlineDb.articleAssets.count(),
        offlineDb.writingSessions.count(),
        eventLogCount(),
    ]);

    const categories: StorageCategory[] = [
        { key: "books", count: books },
        { key: "articles", count: articles },
        { key: "assets", count: assets + articleAssets },
        { key: "writing_sessions", count: writingSessions },
        { key: "event_log", count: events },
    ];

    const tables = await Promise.all(
        offlineDb.tables.map(async (table) => ({
            name: table.name,
            count: await table.count(),
        })),
    );

    let usageBytes: number | null = null;
    let quotaBytes: number | null = null;
    if (
        typeof navigator !== "undefined" &&
        navigator.storage &&
        typeof navigator.storage.estimate === "function"
    ) {
        try {
            const estimate = await navigator.storage.estimate();
            usageBytes = estimate.usage ?? null;
            quotaBytes = estimate.quota ?? null;
        } catch {
            // estimate() can reject in private-browsing / restricted
            // contexts; degrade to "unavailable" rather than throw.
        }
    }

    return { categories, tables, usageBytes, quotaBytes };
}

/**
 * Read the recorded diagnostic events for the "show before clearing"
 * preview. Prefers the live in-memory ring buffer (most up-to-date);
 * falls back to the persisted Dexie snapshot when the buffer is empty
 * (e.g. right after a page load). Returns the most recent `limit` events,
 * oldest-first.
 */
export async function readEventLog(limit = 100): Promise<RecordedEvent[]> {
    const live = eventRecorder.getAll();
    let events: RecordedEvent[] = live;
    if (live.length === 0) {
        const snapshot = (await offlineDb.eventLog.get(EVENT_LOG_KEY)) as
            | EventLogSnapshot
            | undefined;
        events = (snapshot?.events as RecordedEvent[] | undefined) ?? [];
    }
    return events.slice(-limit);
}

/** One cached image entry for the "show before clearing" preview: its
 *  filename + byte size + which table it came from. */
export interface ImageCacheEntry {
    name: string;
    sizeBytes: number;
    scope: "book" | "article";
}

/** A listing of the cached image bytes: per-entry names/sizes plus the
 *  total count + estimated byte total. */
export interface ImageCacheListing {
    entries: ImageCacheEntry[];
    count: number;
    totalBytes: number;
}

/**
 * List the cached image assets (book assets + article featured-images)
 * for the "show before clearing" preview. Reads filename + byte length
 * only — the bytes are summed for the size estimate and then dropped, so
 * nothing is rendered. Sorted largest-first.
 */
export async function listImageCache(): Promise<ImageCacheListing> {
    const entries: ImageCacheEntry[] = [];
    let totalBytes = 0;
    await offlineDb.assets.each((row) => {
        const size = row.data?.byteLength ?? 0;
        totalBytes += size;
        entries.push({ name: row.filename, sizeBytes: size, scope: "book" });
    });
    await offlineDb.articleAssets.each((row) => {
        const size = row.data?.byteLength ?? 0;
        totalBytes += size;
        entries.push({ name: row.filename, sizeBytes: size, scope: "article" });
    });
    entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return { entries, count: entries.length, totalBytes };
}

/**
 * Clear the diagnostic event log (privacy): both the in-memory ring
 * buffer and the persisted Dexie snapshot. No user content is touched.
 */
export async function clearEventLog(): Promise<void> {
    eventRecorder.clear();
    await offlineDb.eventLog.clear();
}

/**
 * Clear cached image bytes (book assets + article featured-images).
 * Frees space without deleting any text content; the originals can be
 * re-uploaded / re-downloaded. Returns the number of rows cleared.
 */
export async function clearImageCache(): Promise<number> {
    const [assetCount, articleAssetCount] = await Promise.all([
        offlineDb.assets.count(),
        offlineDb.articleAssets.count(),
    ]);
    await Promise.all([offlineDb.assets.clear(), offlineDb.articleAssets.clear()]);
    return assetCount + articleAssetCount;
}

/** Format a byte count as a human-readable string (KB / MB / GB).
 *  Returns a dash for null/unknown. */
export function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
