/**
 * Writing-Statistics dashboard (WRITING-STATS-DASHBOARD-01).
 *
 * A compact visual overview of writing progress: today vs the daily goal,
 * a last-7-days chart, per-book project progress with an ETA, and a streak
 * heatmap. All data comes from the storage seam (works offline in Dexie
 * mode); the pure derivations live in `lib/utils/writingDashboard`. The
 * detailed per-book/per-chapter breakdown stays on `/writing-history`.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";

import { PageLayout } from "../components/shared/PageLayout";
import { LoadingIndicator } from "../components/shared/LoadingIndicator";
import { useGoBack } from "../hooks/navigation/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/platform/notify";
import {
  computeTodayComparison,
  computeLast7Days,
  computeHeatmap,
} from "../lib/utils/writingDashboard";
import { loadStatsData, type StatsData } from "../components/stats/statsData";
import TodayStatsWidget from "../components/stats/TodayStatsWidget";
import WeeklyChartWidget from "../components/stats/WeeklyChartWidget";
import ProjectProgressWidget from "../components/stats/ProjectProgressWidget";
import StreakHeatmapWidget from "../components/stats/StreakHeatmapWidget";

/** Same per-device daily goal the dashboard Writing-Goal widget uses. */
const GOAL_KEY = "bibliogon-daily-word-goal";
const DEFAULT_GOAL = 500;

function readGoal(): number {
  if (typeof window === "undefined") return DEFAULT_GOAL;
  const raw = localStorage.getItem(GOAL_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL;
}

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function StatisticsDashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadStatsData()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) {
          notify.error(
            t(
              "ui.writing_stats.dashboard_load_failed",
              "Statistics could not be loaded.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // ``t`` excluded deliberately (only read in the failure toast; the i18n
    // provider is not memoised under test). See WritingHistoryView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = localToday();
  const goal = readGoal();
  const derived = useMemo(() => {
    if (!data) return null;
    return {
      todayCmp: computeTodayComparison(data.daily, today, goal),
      weekly: computeLast7Days(data.daily, today),
      heatmap: computeHeatmap(data.daily, today, 26),
    };
  }, [data, today, goal]);

  const isEmpty =
    !!data && data.daily.length === 0 && data.projects.length === 0;

  return (
    <PageLayout
      title={t("ui.writing_stats.dashboard_title", "Statistiken")}
      testId="statistics-dashboard-page"
      maxWidth="lg"
      onBack={goBack}
      backLabel={t("ui.common.back", "Zurück")}
    >
      {loading ? (
        <LoadingIndicator
          testId="stats-loading"
          variant="block"
          label={t("ui.common.loading", "Laden...")}
        />
      ) : isEmpty ? (
        <div
          className="card flex flex-col items-center gap-3 p-8 text-center"
          data-testid="stats-empty"
        >
          <BarChart3 size={32} aria-hidden className="text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)]">
            {t(
              "ui.writing_stats.empty",
              "Noch kein Schreibverlauf in diesem Zeitraum.",
            )}
          </p>
        </div>
      ) : data && derived ? (
        <div className="flex flex-col gap-4" data-testid="statistics-dashboard">
          <div className="grid gap-4 md:grid-cols-2">
            <TodayStatsWidget data={derived.todayCmp} />
            <WeeklyChartWidget series={derived.weekly} />
          </div>
          <StreakHeatmapWidget
            cells={derived.heatmap}
            currentStreak={data.currentStreak}
            longestStreak={data.longestStreak}
          />
          <ProjectProgressWidget projects={data.projects} />
          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate("/writing-history")}
              data-testid="stats-open-history"
            >
              <BarChart3 size={14} aria-hidden />{" "}
              {t("ui.writing_stats.open", "Verlauf")}
            </button>
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}
