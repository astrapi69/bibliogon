/**
 * Writing-history namespaces (Finding 6): the day-aggregated session list
 * plus the summary / per-book / per-chapter stats, all computed from the
 * `writingSessions` table so the Writing-History view works offline.
 */

import type { WritingSession } from "../../api/client";
import type { IStorageService } from "../types";
import {
    aggregateGlobalByDay,
    computeWritingByBook,
    computeWritingByChapter,
    computeWritingSummary,
} from "./helpers";

export const writingSessions: IStorageService["writingSessions"] = {
    /**
     * Global day-aggregated word totals for the most recent ``days``
     * calendar days, newest first (mirrors the backend ``recent_sessions``).
     * Drives the dashboard daily-goal + streak widget offline.
     */
    list: async (days = 30) => {
        const byDay = await aggregateGlobalByDay();
        return [...byDay.entries()]
            .map(([day, words_written]) => ({ day, words_written }))
            .sort((a, b) => b.day.localeCompare(a.day))
            .slice(0, Math.max(1, days)) as WritingSession[];
    },
};

// Writing-history stats (Finding 6): aggregated from the writingSessions
// Dexie table so the view works offline. exportCsvUrl stays backend-only
// (the offline view hides the CSV button).
export const writingStats: IStorageService["writingStats"] = {
    summary: async (days = 90) => computeWritingSummary(days),
    byBook: async (days = 90) => computeWritingByBook(days),
    byChapter: async (bookId, days = 90) => computeWritingByChapter(bookId, days),
};
