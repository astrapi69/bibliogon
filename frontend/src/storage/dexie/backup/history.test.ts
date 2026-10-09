/**
 * The client-side backup log (#748).
 *
 * What these pin, in the order a mistake would cost:
 *
 * - a recorded event comes back, with the counts and the filename the
 *   user can act on;
 * - two events in the same millisecond both survive, because the
 *   timestamp is the primary key and a restore right after an export is a
 *   real sequence;
 * - the 100-entry cap drops the OLDEST, not the newest;
 * - the store lives in its own IndexedDB database, which is the whole
 *   reason the log outlives a Danger-Zone reset.
 */

import "fake-indexeddb/auto";

import { describe, it, expect, beforeEach } from "vitest";

import {
    MAX_HISTORY_ENTRIES,
    backupHistory,
    deleteBackupHistoryStore,
} from "./history";

describe("backupHistory", () => {
    beforeEach(async () => {
        await deleteBackupHistoryStore();
    });

    it("starts empty", async () => {
        expect(await backupHistory.list()).toEqual([]);
    });

    it("records an export with everything the user needs to find the file", async () => {
        await backupHistory.record({
            action: "backup",
            timestamp: "2026-10-09T12:00:00.000Z",
            book_count: 12,
            chapter_count: 148,
            file_size_bytes: 2_400_000,
            filename: "bibliogon-backup-2026-10-09.json",
        });
        const entries = await backupHistory.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual({
            timestamp: "2026-10-09T12:00:00.000Z",
            action: "backup",
            book_count: 12,
            chapter_count: 148,
            file_size_bytes: 2_400_000,
            filename: "bibliogon-backup-2026-10-09.json",
            details: "",
        });
    });

    it("defaults every optional field so the list never renders undefined", async () => {
        await backupHistory.record({ action: "restore" });
        const [entry] = await backupHistory.list();
        expect(entry.book_count).toBe(0);
        expect(entry.chapter_count).toBe(0);
        expect(entry.file_size_bytes).toBe(0);
        expect(entry.filename).toBe("");
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("returns the newest first", async () => {
        await backupHistory.record({ action: "backup", timestamp: "2026-10-01T00:00:00.000Z" });
        await backupHistory.record({ action: "restore", timestamp: "2026-10-08T00:00:00.000Z" });
        await backupHistory.record({ action: "backup", timestamp: "2026-10-04T00:00:00.000Z" });
        expect((await backupHistory.list()).map((e) => e.timestamp)).toEqual([
            "2026-10-08T00:00:00.000Z",
            "2026-10-04T00:00:00.000Z",
            "2026-10-01T00:00:00.000Z",
        ]);
    });

    it("keeps BOTH events recorded in the same millisecond", async () => {
        // The timestamp is the primary key, so a naive put would have the
        // second event overwrite the first - and "I exported and then
        // restored" would read as one entry.
        const instant = "2026-10-09T12:00:00.000Z";
        await backupHistory.record({ action: "backup", timestamp: instant, book_count: 3 });
        await backupHistory.record({ action: "restore", timestamp: instant, book_count: 3 });
        const entries = await backupHistory.list();
        expect(entries).toHaveLength(2);
        expect(entries.map((e) => e.action).sort()).toEqual(["backup", "restore"]);
    });

    it("honours the limit", async () => {
        for (let i = 1; i <= 5; i += 1) {
            await backupHistory.record({
                action: "backup",
                timestamp: `2026-10-0${i}T00:00:00.000Z`,
            });
        }
        expect(await backupHistory.list(2)).toHaveLength(2);
    });

    it("caps at MAX_HISTORY_ENTRIES and drops the oldest", async () => {
        for (let i = 0; i < MAX_HISTORY_ENTRIES + 3; i += 1) {
            await backupHistory.record({
                action: "backup",
                timestamp: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
            });
        }
        const entries = await backupHistory.list(MAX_HISTORY_ENTRIES + 10);
        expect(entries).toHaveLength(MAX_HISTORY_ENTRIES);
        // The three oldest days are the ones gone, not three newest.
        expect(entries[entries.length - 1].timestamp).toBe(
            new Date(Date.UTC(2026, 0, 1) + 3 * 86_400_000).toISOString(),
        );
    });

    it("deletes one entry by timestamp and leaves the rest", async () => {
        await backupHistory.record({ action: "backup", timestamp: "2026-10-01T00:00:00.000Z" });
        await backupHistory.record({ action: "backup", timestamp: "2026-10-02T00:00:00.000Z" });
        await backupHistory.delete("2026-10-01T00:00:00.000Z");
        expect((await backupHistory.list()).map((e) => e.timestamp)).toEqual([
            "2026-10-02T00:00:00.000Z",
        ]);
    });

    it("deleting an unknown timestamp is a no-op, not a throw", async () => {
        await backupHistory.record({ action: "backup", timestamp: "2026-10-01T00:00:00.000Z" });
        await backupHistory.delete("1999-01-01T00:00:00.000Z");
        expect(await backupHistory.list()).toHaveLength(1);
    });

    it("clears every entry", async () => {
        await backupHistory.record({ action: "backup" });
        await backupHistory.record({ action: "restore" });
        await backupHistory.clear();
        expect(await backupHistory.list()).toEqual([]);
    });

    it("lives in its own IndexedDB database, away from the app data", async () => {
        // The reason the log survives a Danger-Zone reset: the reset drops
        // `bibliogon-offline`, and this is not in it. A regression that
        // moved the table into the app database would be invisible in every
        // other test here and would silently take the log down with the
        // data it is a log of.
        await backupHistory.record({ action: "backup" });
        const names = await indexedDB.databases();
        expect(names.map((db) => db.name)).toContain("bibliogon-backup-history");
        expect(names.map((db) => db.name)).not.toContain("bibliogon-offline");
    });
});
