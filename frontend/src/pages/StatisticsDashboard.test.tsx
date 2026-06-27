/**
 * Pins the Statistics dashboard page (WRITING-STATS-DASHBOARD-01): renders
 * today's words, the project-progress rows, and a sensible empty state.
 * The pure derivations are covered separately in
 * lib/utils/writingDashboard.test.ts; recharts is mocked to plain divs
 * (ResponsiveContainer does not render under happy-dom) and the chart
 * itself is covered by E2E.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import StatisticsDashboard from "./StatisticsDashboard";
import type { StatsData } from "../components/stats/statsData";

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({ t: (_k: string, f: string) => f, lang: "en", setLang: vi.fn() }),
}));

vi.mock("../utils/platform/notify", () => ({ notify: { error: vi.fn() } }));

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    ReferenceLine: () => null,
  };
});

const loadStatsData = vi.fn();
vi.mock("../components/stats/statsData", () => ({
  loadStatsData: (...a: unknown[]) => loadStatsData(...a),
}));

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StatisticsDashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadStatsData.mockReset();
  localStorage.clear();
});

describe("StatisticsDashboard", () => {
  it("renders today's words and a project-progress row", async () => {
    const data: StatsData = {
      daily: [{ day: todayLocal(), words: 700 }],
      currentStreak: 3,
      longestStreak: 5,
      totalWords: 700,
      daysActive: 1,
      avgPerActiveDay: 700,
      projects: [
        {
          bookId: "b1",
          title: "My Novel",
          current: 20000,
          target: 50000,
          pct: 40,
          remaining: 30000,
          dailyPace: 1000,
          etaDays: 30,
          done: false,
        },
      ],
    };
    loadStatsData.mockResolvedValue(data);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("statistics-dashboard")).toBeTruthy();
    });
    expect(screen.getByTestId("stats-today-words").textContent).toContain("700");
    expect(screen.getByTestId("stats-current-streak").textContent).toContain("3");
    expect(screen.getByTestId("stats-project-b1")).toBeTruthy();
    expect(screen.getByTestId("stats-project-b1").textContent).toContain("40%");
  });

  it("shows an empty state when there is no history and no goals", async () => {
    loadStatsData.mockResolvedValue({
      daily: [],
      currentStreak: 0,
      longestStreak: 0,
      totalWords: 0,
      daysActive: 0,
      avgPerActiveDay: 0,
      projects: [],
    } satisfies StatsData);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("stats-empty")).toBeTruthy();
    });
  });
});
