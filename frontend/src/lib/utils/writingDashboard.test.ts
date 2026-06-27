/** Unit tests for the Writing-Statistics dashboard computations
 *  (WRITING-STATS-DASHBOARD-01). All deterministic: "today" is passed in,
 *  never read from the clock. */
import { describe, it, expect } from "vitest";
import {
  computeTodayComparison,
  computeLast7Days,
  computeHeatmap,
  computeProjectProgress,
  type DailyPoint,
} from "./writingDashboard";

const TODAY = "2026-06-27";

describe("computeTodayComparison", () => {
  it("reports today's words and the goal progress", () => {
    const daily: DailyPoint[] = [{ day: TODAY, words: 600 }];
    const r = computeTodayComparison(daily, TODAY, 500);
    expect(r.today).toBe(600);
    expect(r.pct).toBe(100);
    expect(r.met).toBe(true);
  });

  it("computes the delta against yesterday", () => {
    const daily: DailyPoint[] = [
      { day: TODAY, words: 300 },
      { day: "2026-06-26", words: 500 },
    ];
    const r = computeTodayComparison(daily, TODAY, 500);
    expect(r.yesterday).toBe(500);
    expect(r.delta).toBe(-200);
    expect(r.met).toBe(false);
    expect(r.pct).toBe(60);
  });

  it("returns zeros on empty data", () => {
    const r = computeTodayComparison([], TODAY, 500);
    expect(r).toMatchObject({ today: 0, yesterday: 0, delta: 0, pct: 0, met: false });
  });
});

describe("computeLast7Days", () => {
  it("returns exactly 7 points, oldest first, filling gaps with zero", () => {
    const daily: DailyPoint[] = [
      { day: TODAY, words: 700 },
      { day: "2026-06-21", words: 100 },
    ];
    const { points, total, average } = computeLast7Days(daily, TODAY);
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual({ day: "2026-06-21", words: 100 });
    expect(points[6]).toEqual({ day: TODAY, words: 700 });
    expect(total).toBe(800);
    expect(average).toBe(Math.round(800 / 7));
  });
});

describe("computeHeatmap", () => {
  it("emits weeks*7 cells with the last cell on or after today", () => {
    const cells = computeHeatmap([], TODAY, 4);
    expect(cells).toHaveLength(28);
    // Monday-aligned, column-major: cell 0 is a Monday.
    expect(new Date(`${cells[0].day}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it("assigns levels 1..4 by intensity relative to the window max", () => {
    const daily: DailyPoint[] = [
      { day: TODAY, words: 1000 }, // max -> level 4
      { day: "2026-06-25", words: 200 }, // 0.2 -> level 1
      { day: "2026-06-23", words: 600 }, // 0.6 -> level 3
    ];
    const cells = computeHeatmap(daily, TODAY, 26);
    const byDay = new Map(cells.map((c) => [c.day, c]));
    expect(byDay.get(TODAY)?.level).toBe(4);
    expect(byDay.get("2026-06-25")?.level).toBe(1);
    expect(byDay.get("2026-06-23")?.level).toBe(3);
    // A day with no words is level 0.
    expect(byDay.get("2026-06-24")?.level).toBe(0);
  });

  it("marks days after today as future padding", () => {
    const cells = computeHeatmap([], TODAY, 26);
    const future = cells.filter((c) => c.future);
    expect(future.every((c) => c.day > TODAY && c.level === 0)).toBe(true);
  });
});

describe("computeProjectProgress", () => {
  it("computes the percentage and the ETA at the current pace", () => {
    const r = computeProjectProgress({ current: 20000, target: 50000, dailyPace: 1000 });
    expect(r.pct).toBe(40);
    expect(r.remaining).toBe(30000);
    expect(r.etaDays).toBe(30);
    expect(r.done).toBe(false);
  });

  it("caps the percentage and zeroes the ETA when the target is reached", () => {
    const r = computeProjectProgress({ current: 60000, target: 50000, dailyPace: 1000 });
    expect(r.pct).toBe(100);
    expect(r.remaining).toBe(0);
    expect(r.etaDays).toBe(0);
    expect(r.done).toBe(true);
  });

  it("returns a null ETA when there is no recent writing pace", () => {
    const r = computeProjectProgress({ current: 10000, target: 50000, dailyPace: 0 });
    expect(r.etaDays).toBeNull();
    expect(r.pct).toBe(20);
  });
});
