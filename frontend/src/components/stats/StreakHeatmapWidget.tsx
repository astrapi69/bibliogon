/**
 * Streak + contribution-style calendar heatmap for the statistics
 * dashboard. The grid is 7 rows (Mon..Sun) by N week-columns; intensity is
 * `var(--accent)` at four opacity steps, so it reads in every theme.
 */
import { Flame, Trophy } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { HeatCell, HeatLevel } from "../../lib/utils/writingDashboard";

/** Opacity per heat level (level 0 uses the muted track colour instead). */
const LEVEL_OPACITY: Record<HeatLevel, number> = {
  0: 1,
  1: 0.35,
  2: 0.6,
  3: 0.8,
  4: 1,
};

function StatChip({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <span className="flex items-center gap-1 text-sm text-[var(--text)]" data-testid={testId}>
      <Icon size={16} aria-hidden className="text-[var(--accent)]" />
      <strong>{value}</strong>
      <span className="text-[var(--text-muted)]">{label}</span>
    </span>
  );
}

export default function StreakHeatmapWidget({
  cells,
  currentStreak,
  longestStreak,
}: {
  cells: HeatCell[];
  currentStreak: number;
  longestStreak: number;
}) {
  const { t } = useI18n();

  return (
    <div className="card p-4" data-testid="stats-heatmap-widget">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">
          {t("ui.writing_stats.activity", "Activity")}
        </h3>
        <div className="flex items-center gap-4">
          <StatChip
            icon={Flame}
            label={t("ui.writing_stats.current_streak", "Aktuelle Serie")}
            value={currentStreak}
            testId="stats-current-streak"
          />
          <StatChip
            icon={Trophy}
            label={t("ui.writing_stats.longest_streak", "Längste Serie")}
            value={longestStreak}
            testId="stats-longest-streak"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: "repeat(7, 12px)" }}
          data-testid="stats-heatmap-grid"
        >
          {cells.map((cell) => (
            <div
              key={cell.day}
              title={`${cell.day}: ${cell.words}`}
              className="h-3 w-3 rounded-[2px]"
              style={
                cell.level === 0
                  ? { backgroundColor: "var(--surface-2)", opacity: cell.future ? 0.4 : 1 }
                  : { backgroundColor: "var(--accent)", opacity: LEVEL_OPACITY[cell.level] }
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-[var(--text-muted)]">
        <span>{t("ui.writing_stats.heatmap_less", "less")}</span>
        <span className="h-3 w-3 rounded-[2px] bg-[var(--surface-2)]" />
        {([1, 2, 3, 4] as HeatLevel[]).map((lvl) => (
          <span
            key={lvl}
            className="h-3 w-3 rounded-[2px]"
            style={{ backgroundColor: "var(--accent)", opacity: LEVEL_OPACITY[lvl] }}
          />
        ))}
        <span>{t("ui.writing_stats.heatmap_more", "more")}</span>
      </div>
    </div>
  );
}
