/**
 * Coverage for the Settings > Daten storage helpers (#338).
 *
 * Exercises the real IndexedDB path via fake-indexeddb: seeds rows in
 * the offline DB, asserts the entry-count breakdown, the event-log
 * count, and that the maintenance wipes clear only their target tables
 * (assets / event log) and never user content (books / articles).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
    clearEventLog,
    clearImageCache,
    formatBytes,
    getStorageStats,
    listImageCache,
    readEventLog,
} from "./storageStats";
import { EVENT_LOG_KEY, offlineDb } from "./dexie/schema";
import { eventRecorder } from "../utils/eventRecorder";

beforeEach(async () => {
    await Promise.all(offlineDb.tables.map((t) => t.clear()));
    eventRecorder.clear();
});

/** Minimal AssetRow body — fake-indexeddb structured-clones it. */
const buf = (n: number): ArrayBuffer => new Uint8Array(n).buffer;

describe("getStorageStats", () => {
    it("counts entries per category without loading blob bodies", async () => {
        await offlineDb.books.bulkPut([
            { id: "b1", title: "A" } as never,
            { id: "b2", title: "B" } as never,
        ]);
        await offlineDb.articles.put({ id: "a1", title: "X" } as never);
        await offlineDb.assets.put({
            id: "as1",
            bookId: "b1",
            filename: "c.png",
            mimeType: "image/png",
            assetType: "cover",
            data: buf(8),
            createdAt: "2026-06-16T00:00:00Z",
        });
        await offlineDb.articleAssets.put({
            id: "aa1",
            articleId: "a1",
            filename: "f.png",
            mimeType: "image/png",
            data: buf(8),
            createdAt: "2026-06-16T00:00:00Z",
        });
        await offlineDb.writingSessions.bulkPut([
            { id: "w1" } as never,
            { id: "w2" } as never,
            { id: "w3" } as never,
        ]);
        await offlineDb.eventLog.put({
            id: EVENT_LOG_KEY,
            events: [{ type: "click" }, { type: "navigation" }],
            updatedAt: "2026-06-16T00:00:00Z",
        });

        const stats = await getStorageStats();
        const byKey = Object.fromEntries(stats.categories.map((c) => [c.key, c.count]));

        expect(byKey.books).toBe(2);
        expect(byKey.articles).toBe(1);
        expect(byKey.assets).toBe(2); // assets + articleAssets combined
        expect(byKey.writing_sessions).toBe(3);
        expect(byKey.event_log).toBe(2); // events inside the snapshot
    });

    it("reports a table breakdown including every offline table", async () => {
        const stats = await getStorageStats();
        const names = stats.tables.map((t) => t.name);
        expect(names).toContain("books");
        expect(names).toContain("assets");
        expect(names).toContain("eventLog");
        expect(stats.tables.every((t) => t.count === 0)).toBe(true);
    });

    it("reads usage/quota from navigator.storage.estimate when available", async () => {
        const estimate = vi.fn().mockResolvedValue({ usage: 1024, quota: 4096 });
        vi.stubGlobal("navigator", { storage: { estimate } });
        const stats = await getStorageStats();
        expect(stats.usageBytes).toBe(1024);
        expect(stats.quotaBytes).toBe(4096);
        vi.unstubAllGlobals();
    });

    it("degrades to null usage when estimate rejects", async () => {
        const estimate = vi.fn().mockRejectedValue(new Error("blocked"));
        vi.stubGlobal("navigator", { storage: { estimate } });
        const stats = await getStorageStats();
        expect(stats.usageBytes).toBeNull();
        expect(stats.quotaBytes).toBeNull();
        vi.unstubAllGlobals();
    });

    it("event_log count is 0 when no snapshot row exists", async () => {
        const stats = await getStorageStats();
        const events = stats.categories.find((c) => c.key === "event_log");
        expect(events?.count).toBe(0);
    });
});

describe("clearImageCache", () => {
    it("clears asset tables and returns the cleared count, leaving content intact", async () => {
        await offlineDb.books.put({ id: "b1", title: "Keep" } as never);
        await offlineDb.assets.put({
            id: "as1",
            bookId: "b1",
            filename: "c.png",
            mimeType: "image/png",
            assetType: "cover",
            data: buf(4),
            createdAt: "2026-06-16T00:00:00Z",
        });
        await offlineDb.articleAssets.put({
            id: "aa1",
            articleId: "a1",
            filename: "f.png",
            mimeType: "image/png",
            data: buf(4),
            createdAt: "2026-06-16T00:00:00Z",
        });

        const cleared = await clearImageCache();
        expect(cleared).toBe(2);
        expect(await offlineDb.assets.count()).toBe(0);
        expect(await offlineDb.articleAssets.count()).toBe(0);
        // Books are never touched by the image-cache wipe.
        expect(await offlineDb.books.count()).toBe(1);
    });

    it("returns 0 when there is nothing cached", async () => {
        expect(await clearImageCache()).toBe(0);
    });
});

describe("clearEventLog", () => {
    it("removes the persisted snapshot row", async () => {
        await offlineDb.eventLog.put({
            id: EVENT_LOG_KEY,
            events: [{ type: "click" }],
            updatedAt: "2026-06-16T00:00:00Z",
        });
        await clearEventLog();
        expect(await offlineDb.eventLog.count()).toBe(0);
    });
});

describe("readEventLog (preview before clear)", () => {
    it("returns the persisted snapshot events when the live buffer is empty", async () => {
        await offlineDb.eventLog.put({
            id: EVENT_LOG_KEY,
            events: [
                { type: "click", timestamp: 1, text: "A" },
                { type: "navigation", timestamp: 2, from: "/", to: "/x" },
            ],
            updatedAt: "2026-06-16T00:00:00Z",
        });
        const events = await readEventLog();
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe("click");
    });

    it("returns [] when there is no log at all", async () => {
        expect(await readEventLog()).toEqual([]);
    });

    it("caps the result at the requested limit (most recent)", async () => {
        const many = Array.from({ length: 120 }, (_, i) => ({
            type: "click" as const,
            timestamp: i,
            text: `b${i}`,
        }));
        await offlineDb.eventLog.put({
            id: EVENT_LOG_KEY,
            events: many,
            updatedAt: "2026-06-16T00:00:00Z",
        });
        const events = await readEventLog(100);
        expect(events).toHaveLength(100);
        // Most-recent slice: last event preserved.
        expect(events[events.length - 1].text).toBe("b119");
    });
});

describe("listImageCache (preview before clear)", () => {
    it("lists book + article image filenames with sizes, largest-first", async () => {
        await offlineDb.assets.put({
            id: "as1",
            bookId: "b1",
            filename: "cover.png",
            mimeType: "image/png",
            assetType: "cover",
            data: buf(10),
            createdAt: "2026-06-16T00:00:00Z",
        });
        await offlineDb.articleAssets.put({
            id: "aa1",
            articleId: "a1",
            filename: "hero.png",
            mimeType: "image/png",
            data: buf(30),
            createdAt: "2026-06-16T00:00:00Z",
        });

        const listing = await listImageCache();
        expect(listing.count).toBe(2);
        expect(listing.totalBytes).toBe(40);
        // Largest-first.
        expect(listing.entries[0].name).toBe("hero.png");
        expect(listing.entries[0].scope).toBe("article");
        expect(listing.entries[1].name).toBe("cover.png");
    });

    it("returns an empty listing when nothing is cached", async () => {
        const listing = await listImageCache();
        expect(listing).toEqual({ entries: [], count: 0, totalBytes: 0 });
    });
});

describe("formatBytes", () => {
    it("renders human-readable sizes", () => {
        expect(formatBytes(null)).toBe("—");
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1024)).toBe("1.0 KB");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
        expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
    });
});
