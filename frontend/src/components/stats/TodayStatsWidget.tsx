/**
 * Today-at-a-glance widget for the statistics dashboard: a progress ring of
 * today's words against the daily goal, plus a comparison with yesterday.
 */
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { TodayComparison } from "../../lib/utils/writingDashboard";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TodayStatsWidget({ data }: { data: TodayComparison }) {
  const { t } = useI18n();
  const offset = CIRCUMFERENCE * (1 - data.pct / 100);
  const words = t("ui.editor.words", "words");

  const delta = data.delta;
  let comparison: { icon: typeof ArrowUp; text: string; cls: string };
  if (delta > 0) {
    comparison = {
      icon: ArrowUp,
      cls: "text-[var(--success)]",
      text: t("ui.writing_stats.vs_yesterday_up", "{n} more than yesterday").replace(
        "{n}",
        delta.toLocaleString(),
      ),
    };
  } else if (delta < 0) {
    comparison = {
      icon: ArrowDown,
      cls: "text-[var(--text-muted)]",
      text: t("ui.writing_stats.vs_yesterday_down", "{n} fewer than yesterday").replace(
        "{n}",
        Math.abs(delta).toLocaleString(),
      ),
    };
  } else {
    comparison = {
      icon: Minus,
      cls: "text-[var(--text-muted)]",
      text: t("ui.writing_stats.vs_yesterday_same", "Same as yesterday"),
    };
  }
  const CompIcon = comparison.icon;

  return (
    <div
      className="card flex items-center gap-4 p-4"
      data-testid="stats-today-widget"
    >
      <svg
        width={128}
        height={128}
        viewBox="0 0 128 128"
        aria-hidden
        className="shrink-0"
      >
        <circle
          cx={64}
          cy={64}
          r={RADIUS}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={12}
        />
        <circle
          cx={64}
          cy={64}
          r={RADIUS}
          fill="none"
          stroke={data.met ? "var(--success)" : "var(--accent)"}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 64 64)"
        />
        <text
          x={64}
          y={60}
          textAnchor="middle"
          className="fill-[var(--text)] text-2xl font-semibold"
        >
          {data.today.toLocaleString()}
        </text>
        <text
          x={64}
          y={82}
          textAnchor="middle"
          className="fill-[var(--text-muted)] text-xs"
        >
          / {data.goal.toLocaleString()}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-[var(--text-muted)]">
          {t("ui.writing_stats.today", "Today")} · {words}
        </span>
        <span className="text-3xl font-bold text-[var(--text)]" data-testid="stats-today-words">
          {data.today.toLocaleString()}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {t("ui.writing_stats.daily_goal", "Daily goal")}: {data.goal.toLocaleString()}
        </span>
        <span
          className={`flex items-center gap-1 text-sm ${comparison.cls}`}
          data-testid="stats-today-comparison"
        >
          <CompIcon size={14} aria-hidden />
          {comparison.text}
        </span>
      </div>
    </div>
  );
}
