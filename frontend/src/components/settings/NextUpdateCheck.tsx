/**
 * "Next automatic check" line for Settings > About (#477 Phase 2).
 *
 * Reads the `updates` settings block and shows when the next background
 * auto-check is due (last_check_at + interval), or a disabled note when
 * auto-check is off / the interval is "never". Reuses
 * {@link formatRelativeTime} (Intl.RelativeTimeFormat) — a future timestamp
 * formats as "in X", a past one as "X ago".
 */

import { useI18n } from "../../hooks/useI18n";
import {
  UPDATE_INTERVALS_MS,
  type UpdateInterval,
} from "../../lib/utils/updateChecker";
import { formatRelativeTime } from "./UpdateCheckButton";

export function NextUpdateCheck({
  updates,
}: {
  updates: Record<string, unknown> | undefined;
}) {
  const { t, lang } = useI18n();
  const u = updates ?? {};
  const autoCheck = u.auto_check !== false;
  const interval = (u.check_interval as UpdateInterval) ?? "daily";

  if (!autoCheck || interval === "never") {
    return (
      <span
        className="text-xs text-[var(--text-muted)]"
        data-testid="about-next-check"
      >
        {t("ui.about.next_check_disabled", "Automatische Prüfung deaktiviert")}
      </span>
    );
  }

  const lastCheckAt = u.last_check_at as string | null | undefined;
  const last = lastCheckAt ? new Date(lastCheckAt).getTime() : NaN;
  const next = Number.isNaN(last) ? Date.now() : last + UPDATE_INTERVALS_MS[interval];

  return (
    <span
      className="text-xs text-[var(--text-muted)]"
      data-testid="about-next-check"
    >
      {t("ui.about.next_check", "Nächste automatische Prüfung: {time}").replace(
        "{time}",
        formatRelativeTime(next, Date.now(), lang),
      )}
    </span>
  );
}
