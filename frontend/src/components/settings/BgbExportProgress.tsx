/**
 * Inline progress indicator for a running `.bgb` backup export (#346).
 *
 * Image-heavy workspaces take several seconds to export; without feedback the
 * user cannot tell a long export from a hung app. This row renders the live
 * {@link BgbProgress} phase (collecting → loading images N/M → archiving →
 * finalizing), with a counter + thin bar during the image-load phase.
 *
 * Pure presentation: `progress === null` renders nothing, so a caller mounts
 * it unconditionally next to its export button and drives it via the
 * `onProgress` callback of `exportBgbBackup` / `exportSelectiveBgb`. Shared by
 * all four backup-export entry points (Backups + Daten tabs, selective export,
 * Danger Zone) per the Recurring-Component Unification Rule.
 *
 * `role="status"` + `aria-live="polite"` announce each phase to screen readers
 * without stealing focus.
 */

import { Loader2 } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { BgbProgress } from "../../export/bgbExport";

const STEP_LABELS: Record<BgbProgress["step"], [string, string]> = {
    collecting: ["ui.backups.progress_collecting", "Daten sammeln…"],
    assets: ["ui.backups.progress_assets", "Bilder laden…"],
    archiving: ["ui.backups.progress_archiving", "Archiv erstellen…"],
    finalizing: ["ui.backups.progress_finalizing", "Download wird vorbereitet…"],
};

interface BgbExportProgressProps {
    progress: BgbProgress | null;
    testId?: string;
}

/** Inline phase + counter readout for a running `.bgb` export. */
export function BgbExportProgress({ progress, testId }: BgbExportProgressProps) {
    const { t } = useI18n();
    if (!progress) return null;

    const [labelKey, labelFallback] = STEP_LABELS[progress.step];
    const total = progress.total ?? 0;
    const current = progress.current ?? 0;
    const showCounter = progress.step === "assets" && total > 0;
    const label = showCounter
        ? `${t(labelKey, labelFallback)} (${current}/${total})`
        : t(labelKey, labelFallback);
    const percent = showCounter ? Math.min(100, Math.round((current / total) * 100)) : null;

    return (
        <div
            className="mt-2 flex flex-col gap-1 text-sm text-[var(--text-muted)]"
            data-testid={testId ?? "bgb-export-progress"}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                <span data-testid="bgb-export-progress-label">{label}</span>
            </div>
            {percent !== null && (
                <div
                    className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    data-testid="bgb-export-progress-bar"
                >
                    <div
                        className="h-full bg-[var(--accent)] transition-[width]"
                        style={{ width: `${percent}%` }}
                        data-testid="bgb-export-progress-bar-fill"
                    />
                </div>
            )}
        </div>
    );
}
