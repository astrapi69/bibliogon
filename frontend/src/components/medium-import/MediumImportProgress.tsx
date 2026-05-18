/**
 * Three-phase progress indicator for the Medium-import flow.
 *
 * Phase "uploading" renders a determinate bar driven by the
 * XMLHttpRequest upload.onprogress callback (loaded / total bytes).
 *
 * Phase "processing" renders an indeterminate sliding bar — used by
 * the sync v1 + sync v2 paths where the backend gives no per-step
 * progress signal once the upload completes.
 *
 * Phase "processing-async" (ASYNC-IMPORT-PROGRESS-01) renders a
 * determinate bar driven by SSE events: ``{current}/{total}`` posts
 * + the filename of the post being processed + a per-outcome
 * counter row (imported / skipped / errored / comments). The
 * MediumImportJobContext owns the state; this component reads it
 * via props.
 */
import { useI18n } from "../../hooks/useI18n";
import styles from "./MediumImportProgress.module.css";

interface MediumImportProgressProps {
    phase: "uploading" | "processing" | "processing-async";
    /** Bytes uploaded so far. Only meaningful in the "uploading" phase. */
    loaded?: number;
    /** Total bytes to upload. Only meaningful in the "uploading" phase. */
    total?: number;
    /** Async-only: current post index (1-based). */
    asyncCurrent?: number;
    /** Async-only: total posts the backend reported in the start event. */
    asyncTotal?: number;
    /** Async-only: filename the worker is currently on. */
    asyncCurrentFilename?: string;
    /** Async-only: live counters folded from per-post outcome events. */
    asyncImported?: number;
    asyncSkipped?: number;
    asyncErrored?: number;
    asyncImportedComments?: number;
    asyncSkippedComments?: number;
}

function formatMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediumImportProgress({
    phase,
    loaded = 0,
    total = 0,
    asyncCurrent = 0,
    asyncTotal = 0,
    asyncCurrentFilename = "",
    asyncImported = 0,
    asyncSkipped = 0,
    asyncErrored = 0,
    asyncImportedComments = 0,
    asyncSkippedComments = 0,
}: MediumImportProgressProps) {
    const { t } = useI18n();

    if (phase === "uploading") {
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        return (
            <div
                className={styles.wrap}
                data-testid="medium-import-progress-uploading"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t(
                    "ui.medium_import.progress.uploading_aria",
                    "Upload-Fortschritt",
                )}
            >
                <div className={styles.label}>
                    <span>
                        {t("ui.medium_import.progress.uploading", "Upload läuft …")}{" "}
                        {percent}%
                    </span>
                    <span className={styles.bytes}>
                        {formatMb(loaded)} / {formatMb(total)}
                    </span>
                </div>
                <div className={styles.bar}>
                    <div className={styles.fill} style={{ width: `${percent}%` }} />
                </div>
            </div>
        );
    }

    if (phase === "processing-async") {
        const percent =
            asyncTotal > 0
                ? Math.min(100, Math.round((asyncCurrent / asyncTotal) * 100))
                : 0;
        return (
            <div
                className={styles.wrap}
                data-testid="medium-import-progress-async"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={asyncTotal || 100}
                aria-valuenow={asyncCurrent}
                aria-label={t(
                    "ui.medium_import.progress.async_aria",
                    "Import-Fortschritt",
                )}
            >
                <div className={styles.label}>
                    <span data-testid="medium-import-progress-async-counter">
                        {t(
                            "ui.medium_import.progress.async_counter",
                            "{current} von {total} Beiträgen",
                        )
                            .replace("{current}", String(asyncCurrent))
                            .replace("{total}", String(asyncTotal))}{" "}
                        ({percent}%)
                    </span>
                </div>
                {asyncCurrentFilename && (
                    <div
                        className={styles.bytes}
                        data-testid="medium-import-progress-async-current-file"
                    >
                        {asyncCurrentFilename}
                    </div>
                )}
                <div className={styles.bar}>
                    <div
                        className={styles.fill}
                        style={{ width: `${percent}%` }}
                    />
                </div>
                <div
                    className={styles.label}
                    data-testid="medium-import-progress-async-tally"
                >
                    <span>
                        {t(
                            "ui.medium_import.progress.async_tally_imported",
                            "{count} importiert",
                        ).replace("{count}", String(asyncImported))}
                    </span>
                    <span>
                        {t(
                            "ui.medium_import.progress.async_tally_skipped",
                            "{count} übersprungen",
                        ).replace(
                            "{count}",
                            String(asyncSkipped + asyncSkippedComments),
                        )}
                    </span>
                    <span>
                        {t(
                            "ui.medium_import.progress.async_tally_errored",
                            "{count} Fehler",
                        ).replace("{count}", String(asyncErrored))}
                    </span>
                    {asyncImportedComments > 0 && (
                        <span>
                            {t(
                                "ui.medium_import.progress.async_tally_comments",
                                "{count} Kommentare",
                            ).replace("{count}", String(asyncImportedComments))}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            className={styles.wrap}
            data-testid="medium-import-progress-processing"
            role="status"
            aria-live="polite"
        >
            <div className={styles.processing}>
                {t(
                    "ui.medium_import.progress.processing",
                    "Verarbeitung auf dem Server. Bei großen Archiven kann das länger dauern.",
                )}
            </div>
            <div className={styles.bar}>
                <div className={styles.indeterminate} />
            </div>
        </div>
    );
}
