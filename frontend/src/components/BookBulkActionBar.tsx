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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {ChevronDown, Sparkles, Trash2} from "lucide-react"

import BulkActionBar from "./BulkActionBar"
import {RadixSelect} from "./RadixSelect"
import styles from "./BookBulkActionBar.module.css"

export type BookBulkExportFormat = "epub" | "pdf" | "docx"

export const BOOK_BULK_LIMIT_WARNING = 50
export const BOOK_BULK_LIMIT_HARD = 200

/** Server-side cap for bulk AI-template + AI-fill batches (per
 *  S8). Selections above this trigger 422 on the backend, so we
 *  disable the AI dropdown items past it. */
export const BOOK_AI_BULK_LIMIT = 50

interface Props {
    count: number
    onExport: (format: BookBulkExportFormat) => void
    onClear: () => void
    /** Soft-delete: moves selection to trash. Undo offered in toast. */
    onBulkDelete?: (permanent: false) => void
    /** Permanent-delete: opens TypeToConfirmDialog (parent renders). */
    onBulkDeletePermanent?: () => void
    /** UNIVERSAL-AI-TEMPLATE-02: open the per-selection bulk
     *  AI-template export flow. AI handlers are optional; the
     *  bar only renders the AI dropdown when at least the
     *  template-export + template-import pair is wired so a
     *  partial wiring does not produce a half-broken UI. */
    onBulkAiTemplateExport?: () => void
    /** UNIVERSAL-AI-TEMPLATE-02: open the bulk AI-template import
     *  dialog. */
    onBulkAiTemplateImport?: () => void
    /** UNIVERSAL-AI-TEMPLATE-02 commit 8: open the bulk AI-fill
     *  flow (FieldClassDialog -> BulkAiFillConfirmDialog ->
     *  start). Optional; the dropdown still renders without it
     *  but the third menu item is hidden. */
    onBulkAiFill?: () => void
    t: (key: string, fallback?: string) => string
}

export default function BookBulkActionBar({
    count,
    onExport,
    onClear,
    onBulkDelete,
    onBulkDeletePermanent,
    onBulkAiTemplateExport,
    onBulkAiTemplateImport,
    onBulkAiFill,
    t,
}: Props) {
    const [format, setFormat] = useState<BookBulkExportFormat>("epub")

    const overLimit = count > BOOK_BULK_LIMIT_HARD
    const overWarning = count > BOOK_BULK_LIMIT_WARNING && !overLimit
    const disabled = count === 0 || overLimit

    const renderCount = t(
        "ui.dashboard.bulk.selected_count",
        "{count} selected",
    ).replace("{count}", String(count))

    return (
        <BulkActionBar
            count={count}
            countLabel={renderCount}
            ariaLabel={t("ui.dashboard.bulk.format_label", "Format")}
            clearLabel={t("ui.dashboard.bulk.clear_button", "Clear selection")}
            onClear={onClear}
            barTestId="book-bulk-action-bar"
            countTestId="book-bulk-count"
            clearTestId="book-bulk-clear"
        >
            <span className={styles.label}>
                {t("ui.dashboard.bulk.format_label", "Format")}
            </span>
            <RadixSelect
                testId="book-bulk-format"
                className="is-narrow"
                value={format}
                onValueChange={(next) =>
                    setFormat(next as BookBulkExportFormat)
                }
                disabled={disabled}
                ariaLabel={t("ui.dashboard.bulk.format_label", "Format")}
                options={[
                    {value: "epub", label: "EPUB"},
                    {value: "pdf", label: "PDF"},
                    {value: "docx", label: "DOCX"},
                ]}
            />

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
            {onBulkAiTemplateExport && onBulkAiTemplateImport && (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            data-testid="book-bulk-ai-menu"
                            disabled={count === 0 || count > BOOK_AI_BULK_LIMIT}
                            title={
                                count > BOOK_AI_BULK_LIMIT
                                    ? t(
                                          "ui.ai_template.bulk.over_cap",
                                          "Maximum 50 books per AI batch",
                                      )
                                    : undefined
                            }
                        >
                            <Sparkles size={14}/>{" "}
                            {t("ui.ai_template.bulk.menu_button", "KI")}
                            {" "}
                            <ChevronDown size={12}/>
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            className="hamburger-menu-content"
                            sideOffset={4}
                            data-testid="book-bulk-ai-menu-content"
                        >
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                onSelect={onBulkAiTemplateExport}
                                data-testid="book-bulk-ai-template-export"
                            >
                                {t(
                                    "ui.ai_template.bulk.menu_export",
                                    "Vorlagen exportieren (ZIP)",
                                )}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                onSelect={onBulkAiTemplateImport}
                                data-testid="book-bulk-ai-template-import"
                            >
                                {t(
                                    "ui.ai_template.bulk.menu_import",
                                    "Gefüllte Vorlagen importieren (ZIP)",
                                )}
                            </DropdownMenu.Item>
                            {onBulkAiFill && (
                                <DropdownMenu.Item
                                    className="hamburger-menu-item"
                                    onSelect={onBulkAiFill}
                                    data-testid="book-bulk-ai-fill"
                                >
                                    {t(
                                        "ui.ai_template.bulk.menu_fill",
                                        "Mit KI füllen...",
                                    )}
                                </DropdownMenu.Item>
                            )}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            )}
            {onBulkDelete && onBulkDeletePermanent && (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            data-testid="book-bulk-delete-menu"
                            disabled={count < 2}
                            title={
                                count < 2
                                    ? t(
                                          "ui.bulk_delete.disabled_min_two",
                                          "Mindestens 2 Einträge auswählen",
                                      )
                                    : undefined
                            }
                        >
                            <Trash2 size={14} />{" "}
                            {t("ui.bulk_delete.delete_button", "Löschen")}{" "}
                            <ChevronDown size={12} />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            className="hamburger-menu-content"
                            sideOffset={4}
                            data-testid="book-bulk-delete-menu-content"
                        >
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                onSelect={() => onBulkDelete(false)}
                                data-testid="book-bulk-delete-trash"
                            >
                                {t(
                                    "ui.bulk_delete.option_trash",
                                    "In Papierkorb verschieben",
                                )}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                style={{color: "var(--danger)"}}
                                onSelect={onBulkDeletePermanent}
                                data-testid="book-bulk-delete-permanent"
                            >
                                {t("ui.bulk_delete.option_permanent", "Endgültig löschen")}
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            )}
        </BulkActionBar>
    )
}
