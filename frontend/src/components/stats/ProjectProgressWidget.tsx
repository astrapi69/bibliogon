/**
 * Per-book project-progress list for the statistics dashboard: current
 * words against each book's target, a progress bar, and an estimated
 * completion at the recent writing pace.
 */
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { BookProgress } from "./statsData";

function etaText(
  p: BookProgress,
  t: (key: string, fallback: string) => string,
): string {
  if (p.done) return t("ui.writing_stats.completed", "Target reached");
  if (p.etaDays === null) return t("ui.writing_stats.eta_unknown", "No recent pace");
  return t("ui.writing_stats.eta", "Done in ~{n} days").replace(
    "{n}",
    String(p.etaDays),
  );
}

export default function ProjectProgressWidget({
  projects,
}: {
  projects: BookProgress[];
}) {
  const { t } = useI18n();

  return (
    <div className="card p-4" data-testid="stats-project-widget">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
        {t("ui.writing_stats.project_progress", "Project progress")}
      </h3>
      {projects.length === 0 ? (
        <p
          className="text-sm text-[var(--text-muted)]"
          data-testid="stats-project-empty"
        >
          {t(
            "ui.writing_stats.no_goals",
            "No book word targets set yet. Set a word target on a book to track its progress.",
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {projects.map((p) => (
            <li key={p.bookId} data-testid={`stats-project-${p.bookId}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-[var(--text)]">
                  {p.title}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {p.pct}%
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-2)]"
                role="progressbar"
                aria-valuenow={p.pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-[var(--radius-md)]"
                  style={{
                    width: `${p.pct}%`,
                    backgroundColor: p.done ? "var(--success)" : "var(--accent)",
                  }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>
                  {t("ui.writing_stats.words_of_target", "{current} / {target} words")
                    .replace("{current}", p.current.toLocaleString())
                    .replace("{target}", p.target.toLocaleString())}
                </span>
                <span
                  className={`flex items-center gap-1 ${p.done ? "text-[var(--success)]" : ""}`}
                  data-testid={`stats-project-eta-${p.bookId}`}
                >
                  {p.done ? <CheckCircle2 size={12} aria-hidden /> : null}
                  {etaText(p, t)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
