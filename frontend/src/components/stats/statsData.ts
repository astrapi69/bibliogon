/**
 * Data loader for the Writing-Statistics dashboard
 * (WRITING-STATS-DASHBOARD-01).
 *
 * Pulls everything from the storage seam (`getStorage()`), so it works in
 * both the online (API) and offline (Dexie) builds and fires no `/api`
 * request in dexie mode. The pure derivations live in
 * `lib/utils/writingDashboard`; this module only fetches and assembles.
 */
import { getStorage } from "../../storage";
import { countWords } from "../../storage/dexie/helpers";
import {
  computeProjectProgress,
  type DailyPoint,
  type ProjectProgress,
} from "../../lib/utils/writingDashboard";

/** Per-book progress plus its identity, for the project-progress widget. */
export interface BookProgress extends ProjectProgress {
  bookId: string;
  title: string;
}

/** Everything the dashboard renders, derived from the storage seam. */
export interface StatsData {
  /** Global per-day word totals over the window (`{ day, words }`). */
  daily: DailyPoint[];
  currentStreak: number;
  longestStreak: number;
  totalWords: number;
  daysActive: number;
  avgPerActiveDay: number;
  /** Books that have a word target, sorted by completion (highest first). */
  projects: BookProgress[];
}

/** One year of history covers the heatmap, streaks, weekly and today views. */
const WINDOW_DAYS = 365;
/** Calendar days used to estimate a book's recent writing pace. */
const PACE_DAYS = 14;

/** Local `YYYY-MM-DD` (matches the dashboard widget's "today"). */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cutoffIso(today: string, daysBack: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (daysBack - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Load and assemble the dashboard data. The per-book current word count is
 * summed from each goal book's chapters; the pace is the average of the
 * last {@link PACE_DAYS} calendar days from that book's daily series.
 */
export async function loadStatsData(): Promise<StatsData> {
  const storage = getStorage();
  const [summary, byBook, books] = await Promise.all([
    storage.writingStats.summary(WINDOW_DAYS),
    storage.writingStats.byBook(WINDOW_DAYS),
    storage.books.list(),
  ]);

  const today = localToday();
  const paceCutoff = cutoffIso(today, PACE_DAYS);
  const paceByBook = new Map<string, number>();
  for (const stats of byBook) {
    const recent = stats.daily
      .filter((d) => d.day >= paceCutoff && d.day <= today)
      .reduce((sum, d) => sum + d.words_written, 0);
    paceByBook.set(stats.book_id, recent / PACE_DAYS);
  }

  const goalBooks = books.filter((b) => (b.word_target ?? 0) > 0);
  const projects: BookProgress[] = await Promise.all(
    goalBooks.map(async (book) => {
      const chapters = await storage.chapters.list(book.id);
      const current = chapters.reduce((sum, ch) => sum + countWords(ch.content), 0);
      const progress = computeProjectProgress({
        current,
        target: book.word_target ?? 0,
        dailyPace: paceByBook.get(book.id) ?? 0,
      });
      return { ...progress, bookId: book.id, title: book.title };
    }),
  );
  projects.sort((a, b) => b.pct - a.pct || a.title.localeCompare(b.title));

  return {
    daily: summary.daily.map((d) => ({ day: d.day, words: d.words_written })),
    currentStreak: summary.current_streak,
    longestStreak: summary.longest_streak,
    totalWords: summary.total_words,
    daysActive: summary.days_active,
    avgPerActiveDay: summary.avg_per_active_day,
    projects,
  };
}
