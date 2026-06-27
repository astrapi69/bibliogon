/**
 * Last-7-days bar chart for the statistics dashboard, with the daily
 * average drawn as a reference line. Colours come from theme tokens so the
 * chart stays readable across all palettes.
 */
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useI18n } from "../../hooks/useI18n";
import type { WeeklySeries } from "../../lib/utils/writingDashboard";

/** Localised short weekday label (e.g. "Mo", "Mon") for a YYYY-MM-DD day. */
function weekdayLabel(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
}

export default function WeeklyChartWidget({ series }: { series: WeeklySeries }) {
  const { t, lang } = useI18n();
  const locale = lang || "de";

  const data = useMemo(
    () =>
      series.points.map((p) => ({
        day: p.day,
        label: weekdayLabel(p.day, locale),
        words: p.words,
      })),
    [series.points, locale],
  );

  return (
    <div className="card p-4" data-testid="stats-weekly-widget">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)]">
          {t("ui.writing_stats.this_week", "This week (7 days)")}
        </h3>
        <span className="text-xs text-[var(--text-muted)]">
          {t("ui.writing_stats.weekly_average", "Avg/day")}:{" "}
          <strong data-testid="stats-weekly-average">
            {series.average.toLocaleString()}
          </strong>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--text)",
            }}
          />
          {series.average > 0 ? (
            <ReferenceLine
              y={series.average}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
            />
          ) : null}
          <Bar dataKey="words" fill="var(--accent)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
