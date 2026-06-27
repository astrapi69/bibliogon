/**
 * Pure computations for the Writing-Statistics dashboard
 * (WRITING-STATS-DASHBOARD-01).
 *
 * Framework-free and app-import-free: a sparse list of per-day word totals
 * goes in, the dashboard's derived series (today-vs-yesterday, last-7-days
 * with average, calendar heatmap, per-book project progress) come out. No
 * `Date.now()` inside — the caller passes "today" as a `YYYY-MM-DD` string,
 * so every function is deterministic and unit-testable.
 *
 * @example
 * ```ts
 * const daily = [{ day: "2026-06-27", words: 600 }];
 * computeTodayComparison(daily, "2026-06-27", 500);
 * // { today: 600, yesterday: 0, delta: 600, goal: 500, pct: 100, met: true }
 * ```
 */

/** A single day's net word total (`day` is a `YYYY-MM-DD` calendar date). */
export interface DailyPoint {
  day: string;
  words: number;
}

/** Shift a `YYYY-MM-DD` date by `n` days (UTC-stable, no TZ drift). */
function addDays(iso: string, n: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Weekday of a `YYYY-MM-DD` date with Monday = 0 ... Sunday = 6. */
function weekdayMon0(iso: string): number {
  const sundayZero = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return (sundayZero + 6) % 7;
}

/** Index a daily series by day for O(1) lookups, summing any duplicates. */
function indexByDay(daily: DailyPoint[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const point of daily) {
    byDay.set(point.day, (byDay.get(point.day) ?? 0) + Math.max(0, point.words));
  }
  return byDay;
}

/** Today's words measured against the daily goal, with a yesterday delta. */
export interface TodayComparison {
  today: number;
  yesterday: number;
  /** `today - yesterday` (can be negative). */
  delta: number;
  goal: number;
  /** `today / goal`, capped at 100 (0 when no goal). */
  pct: number;
  met: boolean;
}

/**
 * Today's words, yesterday's words, the delta between them, and the
 * progress toward `goal`.
 */
export function computeTodayComparison(
  daily: DailyPoint[],
  today: string,
  goal: number,
): TodayComparison {
  const byDay = indexByDay(daily);
  const todayWords = byDay.get(today) ?? 0;
  const yesterdayWords = byDay.get(addDays(today, -1)) ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((todayWords / goal) * 100)) : 0;
  return {
    today: todayWords,
    yesterday: yesterdayWords,
    delta: todayWords - yesterdayWords,
    goal,
    pct,
    met: goal > 0 && todayWords >= goal,
  };
}

/** The last seven calendar days (oldest first) plus their average. */
export interface WeeklySeries {
  points: DailyPoint[];
  /** Mean words across all seven days, rounded. */
  average: number;
  total: number;
}

/**
 * The seven calendar days ending on `today` (oldest first), filling gaps
 * with zeros, plus the seven-day total and rounded average.
 */
export function computeLast7Days(daily: DailyPoint[], today: string): WeeklySeries {
  const byDay = indexByDay(daily);
  const points: DailyPoint[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    points.push({ day, words: byDay.get(day) ?? 0 });
  }
  const total = points.reduce((sum, p) => sum + p.words, 0);
  return { points, average: Math.round(total / 7), total };
}

/** Heatmap intensity bucket: 0 = none, 1..4 = increasing word counts. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** A single calendar cell in the contribution-style heatmap. */
export interface HeatCell {
  day: string;
  words: number;
  level: HeatLevel;
  /** True for cells after `today` (padding of the current week). */
  future: boolean;
}

/** Bucket a word count into a 0..4 level relative to the window max. */
function heatLevel(words: number, max: number): HeatLevel {
  if (words <= 0 || max <= 0) return 0;
  const ratio = words / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * A GitHub-contributions-style heatmap: `weeks` columns of seven days each
 * (Monday top → Sunday bottom), ending on the week that contains `today`.
 * Cells are column-major (first 7 = leftmost week, top to bottom), so a
 * `grid-auto-flow: column` / 7-row grid renders them correctly. Days after
 * `today` are emitted as `future` padding so columns stay aligned.
 */
export function computeHeatmap(
  daily: DailyPoint[],
  today: string,
  weeks = 26,
): HeatCell[] {
  const byDay = indexByDay(daily);
  const thisWeekMonday = addDays(today, -weekdayMon0(today));
  const firstMonday = addDays(thisWeekMonday, -(Math.max(1, weeks) - 1) * 7);

  const days: { day: string; words: number; future: boolean }[] = [];
  let max = 0;
  for (let column = 0; column < Math.max(1, weeks); column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const day = addDays(firstMonday, column * 7 + row);
      const future = day > today;
      const words = future ? 0 : byDay.get(day) ?? 0;
      if (!future && words > max) max = words;
      days.push({ day, words, future });
    }
  }
  return days.map(({ day, words, future }) => ({
    day,
    words,
    future,
    level: future ? 0 : heatLevel(words, max),
  }));
}

/** Inputs for a single book's project-progress computation. */
export interface ProjectProgressInput {
  /** Current total words in the book (sum of chapter word counts). */
  current: number;
  /** The book's word target (`Book.word_target`). */
  target: number;
  /** Recent average words written per calendar day for this book. */
  dailyPace: number;
}

/** A book's progress toward its word target, with a completion estimate. */
export interface ProjectProgress {
  current: number;
  target: number;
  /** `current / target`, capped at 100 (0 when no target). */
  pct: number;
  /** Words still to write (never negative). */
  remaining: number;
  dailyPace: number;
  /** Estimated days to reach the target at `dailyPace`. `null` when the
   *  pace is zero (unknowable); `0` when already complete. */
  etaDays: number | null;
  done: boolean;
}

/**
 * Progress toward a book's word target plus an ETA at the recent pace.
 */
export function computeProjectProgress(input: ProjectProgressInput): ProjectProgress {
  const { current, target, dailyPace } = input;
  const remaining = Math.max(0, target - current);
  const done = target > 0 && current >= target;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  let etaDays: number | null;
  if (done || remaining === 0) {
    etaDays = 0;
  } else if (dailyPace > 0) {
    etaDays = Math.ceil(remaining / dailyPace);
  } else {
    etaDays = null;
  }
  return { current, target, pct, remaining, dailyPace, etaDays, done };
}
