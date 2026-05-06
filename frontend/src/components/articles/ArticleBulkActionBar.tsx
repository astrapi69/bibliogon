/**
 * Sticky bulk-action bar shown above the Articles list when at
 * least one article is selected. Surfaces:
 *
 * - the selection count (with the soft-warning / hard-error rules
 *   tied to the 50 / 200 thresholds enforced server-side too),
 * - a format dropdown (markdown / html / pdf / docx),
 * - a mode toggle (ZIP archive vs combined document),
 * - the Export button (disabled at 0, blocked at >200),
 * - a Clear-selection button.
 *
 * The component is intentionally pure-presentational: it takes the
 * selection size + change handlers and emits a single ``onExport``
 * callback. Wiring to ``api.articles.bulkExport`` lives in the
 * parent so the parent can also coordinate post-export side effects
 * (toast, clear selection, etc.).
 */

import {useState} from "react"

import styles from "./ArticleBulkActionBar.module.css"

export type BulkExportFormat = "markdown" | "html" | "pdf" | "docx"
export type BulkExportMode = "zip" | "combined"

export const BULK_LIMIT_WARNING = 50
export const BULK_LIMIT_HARD = 200

interface Props {
    count: number
    onExport: (format: BulkExportFormat, mode: BulkExportMode) => void
    onClear: () => void
    t: (key: string, fallback?: string) => string
    /** Optional - lets tests interpolate the count more easily by
     *  exposing the i18n call site. Defaults to the production
     *  string-format implementation. */
    formatCount?: (count: number) => string
}

export default function ArticleBulkActionBar({
    count,
    onExport,
    onClear,
    t,
    formatCount,
}: Props) {
    const [format, setFormat] = useState<BulkExportFormat>("markdown")
    const [mode, setMode] = useState<BulkExportMode>("zip")

    const overLimit = count > BULK_LIMIT_HARD
    const overWarning = count > BULK_LIMIT_WARNING && !overLimit
    const disabled = count === 0 || overLimit

    const renderCount = formatCount
        ? formatCount(count)
        : t("ui.articles.bulk.selected_count", "{count} selected").replace(
              "{count}",
              String(count),
          )

    return (
        <div
            className={styles.bar}
            data-testid="article-bulk-action-bar"
            role="region"
            aria-label={t("ui.articles.bulk.format_label", "Format")}
        >
            <span className={styles.count} data-testid="article-bulk-count">
                {renderCount}
            </span>

            <span className={styles.label}>{t("ui.articles.bulk.format_label", "Format")}</span>
            <select
                data-testid="article-bulk-format"
                className={styles.select}
                value={format}
                onChange={(e) => setFormat(e.target.value as BulkExportFormat)}
                disabled={disabled}
            >
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
            </select>

            <span className={styles.label}>{t("ui.articles.bulk.mode_label", "Output")}</span>
            <div className={styles.modeGroup} role="group">
                <button
                    type="button"
                    className={`${styles.modeButton}${mode === "zip" ? ` ${styles.active}` : ""}`}
                    data-testid="article-bulk-mode-zip"
                    onClick={() => setMode("zip")}
                    aria-pressed={mode === "zip"}
                >
                    {t("ui.articles.bulk.mode_zip", "ZIP archive")}
                </button>
                <button
                    type="button"
                    className={`${styles.modeButton}${mode === "combined" ? ` ${styles.active}` : ""}`}
                    data-testid="article-bulk-mode-combined"
                    onClick={() => setMode("combined")}
                    aria-pressed={mode === "combined"}
                >
                    {t("ui.articles.bulk.mode_combined", "Combined document")}
                </button>
            </div>

            <div className={styles.spacer} />

            {overWarning ? (
                <span className={styles.warning} data-testid="article-bulk-warning">
                    {t(
                        "ui.articles.bulk.limit_warning_50",
                        "Selecting more than 50 articles may take a while.",
                    )}
                </span>
            ) : null}
            {overLimit ? (
                <span className={styles.error} data-testid="article-bulk-error">
                    {t("ui.articles.bulk.limit_error_200", "Maximum 200 articles per export.")}
                </span>
            ) : null}

            <button
                type="button"
                className="btn-primary"
                data-testid="article-bulk-export"
                disabled={disabled}
                onClick={() => onExport(format, mode)}
            >
                {t("ui.articles.bulk.export_button", "Export")}
            </button>
            <button
                type="button"
                className="btn-ghost"
                data-testid="article-bulk-clear"
                onClick={onClear}
            >
                {t("ui.articles.bulk.clear_button", "Clear selection")}
            </button>
        </div>
    )
}
