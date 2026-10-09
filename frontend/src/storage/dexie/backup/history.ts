/**
 * Client-side backup history (#748).
 *
 * Offline there is no server to log a backup, so the log lives here: a
 * chronological record of every export and restore the browser performed,
 * with the counts, the size and the filename it was downloaded under.
 *
 * **Its own IndexedDB database**, `bibliogon-backup-history`, not a table
 * in `bibliogon-offline`. Two reasons, in order of weight:
 *
 * 1. The Danger-Zone reset wipes the app database. The moment a user most
 *    needs to know "did I take a backup, and what was it called?" is right
 *    after an accidental reset - so the log has to outlive the data it
 *    describes. The GitHub-token store uses a separate database for the
 *    mirror-image reason (#880/#885), and that precedent is what this
 *    follows.
 * 2. A full backup reads the app database. Keeping the log out of it means
 *    the log never ends up inside the backups it is a log of.
 *
 * What this is NOT: a snapshot store. It holds no `.bgb` bytes, so there
 * is no "download again" - the file lives wherever the browser put it.
 * Storing copies of a backup in the same origin's storage that the backup
 * protects would be a copy that dies with every "clear site data", and
 * presenting it as a backup would overstate what it survives.
 *
 * @example
 * await backupHistory.record({action: "backup", book_count: 12, ...});
 * const entries = await backupHistory.list(20);
 */

import Dexie, { type Table } from "dexie";

import { storageDbName } from "../../../lib/storageNamespace";
import type {
    BackupHistoryEntry,
    BackupHistoryEvent,
    BackupHistoryStorage,
} from "../../types";

const DB_NAME = storageDbName("bibliogon-backup-history");

/** Matches the backend's `_MAX_ENTRIES`: the newest 100, then the oldest go. */
export const MAX_HISTORY_ENTRIES = 100;

class BackupHistoryDB extends Dexie {
    entries!: Table<BackupHistoryEntry, string>;

    constructor() {
        super(DB_NAME);
        this.version(1).stores({ entries: "timestamp" });
    }
}

let historyDb: BackupHistoryDB | null = null;

function database(): BackupHistoryDB {
    historyDb ??= new BackupHistoryDB();
    return historyDb;
}

/** Newest first, matching the backend's ordering. */
async function newestFirst(): Promise<BackupHistoryEntry[]> {
    const rows = await database().entries.toArray();
    return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export const backupHistory: BackupHistoryStorage = {
    list: async (limit = 50) => (await newestFirst()).slice(0, limit),

    record: async (event: BackupHistoryEvent) => {
        // The timestamp is the primary key, so two events in the same
        // millisecond would overwrite each other. Walking forward by a
        // millisecond keeps both rather than losing the first silently -
        // a restore immediately after an export is a real sequence.
        let timestamp = event.timestamp ?? new Date().toISOString();
        while (await database().entries.get(timestamp)) {
            timestamp = new Date(new Date(timestamp).getTime() + 1).toISOString();
        }
        await database().entries.put({
            timestamp,
            action: event.action,
            book_count: event.book_count ?? 0,
            chapter_count: event.chapter_count ?? 0,
            file_size_bytes: event.file_size_bytes ?? 0,
            filename: event.filename ?? "",
            details: event.details ?? "",
        });
        const all = await newestFirst();
        const surplus = all.slice(MAX_HISTORY_ENTRIES);
        if (surplus.length > 0) {
            await database().entries.bulkDelete(surplus.map((entry) => entry.timestamp));
        }
    },

    delete: async (timestamp: string) => {
        await database().entries.delete(timestamp);
    },

    clear: async () => {
        await database().entries.clear();
    },
};

/**
 * Drop the whole history database.
 *
 * NOT called by the Danger-Zone reset - surviving it is the point (see the
 * module docstring). This exists for tests and for a deliberate
 * "forget that I ever backed up" action, which the Settings list already
 * offers as "clear all".
 */
export async function deleteBackupHistoryStore(): Promise<void> {
    historyDb?.close();
    historyDb = null;
    await Dexie.delete(DB_NAME);
}
