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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {BookOpen, ChevronDown, Sparkles, Trash2} from "lucide-react"

import BulkActionBar from "../BulkActionBar"
import {RadixSelect} from "../RadixSelect"
import {useOfflineFeatureGate} from "../../storage/useOfflineFeatureGate"
import styles from "./ArticleBulkActionBar.module.css"

export type BulkExportFormat = "markdown" | "html" | "pdf" | "docx"
export type BulkExportMode = "zip" | "combined"

export const BULK_LIMIT_WARNING = 50
export const BULK_LIMIT_HARD = 200

/** Server-side cap for bulk AI-template + AI-fill batches (per
 *  S8). Selections above this trigger 422 on the backend, so we
 *  disable the AI dropdown items past it. */
export const ARTICLE_AI_BULK_LIMIT = 50

interface Props {
    count: number
    onExport: (format: BulkExportFormat, mode: BulkExportMode) => void
    onClear: () => void
    /** Soft-delete path: moves selection to trash. Undo is offered
     *  in the resulting toast. The bar only invokes this when
     *  count >= 2 (count=1 falls through to the single-item delete
     *  path on the row menu — see Q1 of the pre-inspection). */
    onBulkDelete?: (permanent: false) => void
    /** Permanent-delete path: opens the TypeToConfirmDialog above
     *  the parent component; the parent handles the actual deletion
     *  after the dialog confirms. */
    onBulkDeletePermanent?: () => void
    /** UNIVERSAL-AI-TEMPLATE-02: open the bulk AI-template export
     *  flow. AI handlers are optional; the bar only renders the
     *  AI dropdown when at least the template-export +
     *  template-import pair is wired so a partial wiring does
     *  not produce a half-broken UI. */
    onBulkAiTemplateExport?: () => void
    /** UNIVERSAL-AI-TEMPLATE-02: open the bulk AI-template import
     *  dialog. */
    onBulkAiTemplateImport?: () => void
    /** UNIVERSAL-AI-TEMPLATE-02 commit 8: open the bulk AI-fill
     *  flow (FieldClassDialog -> BulkAiFillConfirmDialog ->
     *  start). Optional; the dropdown still renders without it
     *  but the third menu item is hidden. */
    onBulkAiFill?: () => void
    /** Article-to-book conversion (Phase 2). Opens the
     *  ConvertToBookWizard with the current selection as input.
     *  Optional so the bar still renders without it; the button
     *  is hidden when not wired. count>=1 is enough — a single
     *  article can become a one-chapter book. */
    onConvertToBook?: () => void
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
    onBulkDelete,
    onBulkDeletePermanent,
    onBulkAiTemplateExport,
    onBulkAiTemplateImport,
    onBulkAiFill,
    onConvertToBook,
    t,
    formatCount,
}: Props) {
    const [format, setFormat] = useState<BulkExportFormat>("markdown")
    const [mode, setMode] = useState<BulkExportMode>("zip")

    // Export + AI are backend-only -> disabled in offline (Dexie) mode.
    const {offline: offlineGate, message: offlineMsg} = useOfflineFeatureGate()

    const overLimit = count > BULK_LIMIT_HARD
    const overWarning = count > BULK_LIMIT_WARNING && !overLimit
    const disabled = count === 0 || overLimit || offlineGate

    const renderCount = formatCount
        ? formatCount(count)
        : t("ui.articles.bulk.selected_count", "{count} selected").replace(
              "{count}",
              String(count),
          )

    return (
        <BulkActionBar
            count={count}
            countLabel={renderCount}
            ariaLabel={t("ui.articles.bulk.format_label", "Format")}
            clearLabel={t("ui.articles.bulk.clear_button", "Clear selection")}
            onClear={onClear}
            barTestId="article-bulk-action-bar"
            countTestId="article-bulk-count"
            clearTestId="article-bulk-clear"
        >
            <span className={styles.label}>{t("ui.articles.bulk.format_label", "Format")}</span>
            <RadixSelect
                testId="article-bulk-format"
                className="is-narrow"
                value={format}
                onValueChange={(next) => setFormat(next as BulkExportFormat)}
                disabled={disabled}
                ariaLabel={t("ui.articles.bulk.format_label", "Format")}
                options={[
                    {value: "markdown", label: "Markdown"},
                    {value: "html", label: "HTML"},
                    {value: "pdf", label: "PDF"},
                    {value: "docx", label: "DOCX"},
                ]}
            />

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
                title={offlineGate ? offlineMsg : undefined}
                onClick={() => onExport(format, mode)}
            >
                {t("ui.articles.bulk.export_button", "Export")}
            </button>
            {onBulkAiTemplateExport && onBulkAiTemplateImport && (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            data-testid="article-bulk-ai-menu"
                            disabled={count === 0 || count > ARTICLE_AI_BULK_LIMIT || offlineGate}
                            title={
                                offlineGate
                                    ? offlineMsg
                                    : count > ARTICLE_AI_BULK_LIMIT
                                    ? t(
                                          "ui.ai_template.bulk.over_cap",
                                          "Maximum 50 articles per AI batch",
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
                            data-testid="article-bulk-ai-menu-content"
                        >
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                onSelect={onBulkAiTemplateExport}
                                data-testid="article-bulk-ai-template-export"
                            >
                                {t(
                                    "ui.ai_template.bulk.menu_export",
                                    "Vorlagen exportieren (ZIP)",
                                )}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                onSelect={onBulkAiTemplateImport}
                                data-testid="article-bulk-ai-template-import"
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
                                    data-testid="article-bulk-ai-fill"
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
            {onConvertToBook && (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="article-bulk-convert-to-book"
                    onClick={onConvertToBook}
                    disabled={count === 0}
                    title={t(
                        "ui.convert_to_book.bar_button_tooltip",
                        "Ausgewählte Artikel als Buch zusammenfassen",
                    )}
                >
                    <BookOpen size={14} />{" "}
                    {t("ui.convert_to_book.bar_button", "Als Buch")}
                </button>
            )}
            {onBulkDelete && onBulkDeletePermanent && (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            data-testid="article-bulk-delete-menu"
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
                            data-testid="article-bulk-delete-menu-content"
                        >
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                onSelect={() => onBulkDelete(false)}
                                data-testid="article-bulk-delete-trash"
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
                                data-testid="article-bulk-delete-permanent"
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
