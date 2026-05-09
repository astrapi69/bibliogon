/**
 * Two-phase progress indicator for the Medium-import flow.
 *
 * Phase "uploading" renders a determinate bar driven by the
 * XMLHttpRequest upload.onprogress callback (loaded / total bytes).
 *
 * Phase "processing" renders an indeterminate sliding bar plus a
 * label: the backend endpoint is synchronous and gives no progress
 * signal once the upload completes. Setting the right expectation
 * matters because a 200-article archive can keep the user waiting
 * 30+ seconds during the processing phase.
 */
import { useI18n } from "../../hooks/useI18n";
import styles from "./MediumImportProgress.module.css";

interface MediumImportProgressProps {
    phase: "uploading" | "processing";
    /** Bytes uploaded so far. Only meaningful in the "uploading" phase. */
    loaded?: number;
    /** Total bytes to upload. Only meaningful in the "uploading" phase. */
    total?: number;
}

function formatMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediumImportProgress({
    phase,
    loaded = 0,
    total = 0,
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
                    "Verarbeitung auf dem Server … das kann bis zu einer Minute dauern.",
                )}
            </div>
            <div className={styles.bar}>
                <div className={styles.indeterminate} />
            </div>
        </div>
    );
}
