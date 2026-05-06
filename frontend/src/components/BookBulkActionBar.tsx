/**
 * Bulk-action bar for book selections on the Dashboard. Pure-
 * presentational; takes the selection size + handlers and emits
 * a single ``onExport`` callback. Wiring to
 * ``api.books.bulkExport`` lives in the parent so the parent can
 * coordinate post-export side effects (toast, clear selection).
 *
 * Books only support ZIP-of-books output (see AR-BULK-BOOKS-PARITY-01
 * backend commit for the manuscripta reasoning), so there is no
 * mode toggle here. Format dropdown limits to EPUB / PDF / DOCX
 * — the same set the per-book ``/batch`` endpoint already handles.
 */

import {useState} from "react"

import styles from "./BookBulkActionBar.module.css"

export type BookBulkExportFormat = "epub" | "pdf" | "docx"

export const BOOK_BULK_LIMIT_WARNING = 50
export const BOOK_BULK_LIMIT_HARD = 200

interface Props {
    count: number
    onExport: (format: BookBulkExportFormat) => void
    onClear: () => void
    t: (key: string, fallback?: string) => string
}

export default function BookBulkActionBar({count, onExport, onClear, t}: Props) {
    const [format, setFormat] = useState<BookBulkExportFormat>("epub")

    const overLimit = count > BOOK_BULK_LIMIT_HARD
    const overWarning = count > BOOK_BULK_LIMIT_WARNING && !overLimit
    const disabled = count === 0 || overLimit

    const renderCount = t(
        "ui.dashboard.bulk.selected_count",
        "{count} selected",
    ).replace("{count}", String(count))

    return (
        <div
            className={styles.bar}
            data-testid="book-bulk-action-bar"
            role="region"
            aria-label={t("ui.dashboard.bulk.format_label", "Format")}
        >
            <span className={styles.count} data-testid="book-bulk-count">
                {renderCount}
            </span>

            <span className={styles.label}>
                {t("ui.dashboard.bulk.format_label", "Format")}
            </span>
            <select
                data-testid="book-bulk-format"
                className={styles.select}
                value={format}
                onChange={(e) => setFormat(e.target.value as BookBulkExportFormat)}
                disabled={disabled}
            >
                <option value="epub">EPUB</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
            </select>

            <div className={styles.spacer} />

            {overWarning ? (
                <span className={styles.warning} data-testid="book-bulk-warning">
                    {t(
                        "ui.dashboard.bulk.limit_warning_50",
                        "Selecting more than 50 books may take a while.",
                    )}
                </span>
            ) : null}
            {overLimit ? (
                <span className={styles.error} data-testid="book-bulk-error">
                    {t("ui.dashboard.bulk.limit_error_200", "Maximum 200 books per export.")}
                </span>
            ) : null}

            <button
                type="button"
                className="btn-primary"
                data-testid="book-bulk-export"
                disabled={disabled}
                onClick={() => onExport(format)}
            >
                {t("ui.dashboard.bulk.export_button", "Export")}
            </button>
            <button
                type="button"
                className="btn-ghost"
                data-testid="book-bulk-clear"
                onClick={onClear}
            >
                {t("ui.dashboard.bulk.clear_button", "Clear selection")}
            </button>
        </div>
    )
}
