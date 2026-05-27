/**
 * Preview table for the Medium-import v2 dry-run workflow.
 *
 * Renders one row per post the walker parsed from the uploaded ZIP,
 * with a checkbox to deselect rows the user does NOT want imported.
 * Walker-failures (the rare "parse failed" branch) sit in a
 * collapsible panel above the table because they need attention but
 * are not actionable from this UI.
 *
 * Controlled component. Parent owns the ``selected`` set; the table
 * fires ``onToggleRow`` / ``onToggleAll`` for state changes and the
 * parent re-renders. The Import button gating lives on the parent
 * (disabled when ``selected.size === 0``).
 *
 * Testid namespace: ``medium-import-preview-*``. Pinned by the
 * Phase 4 Playwright smoke spec.
 *
 * Columns (per the Pre-Inspection confirmation 2026-05-17):
 *   checkbox · filename · title · date · language · classification ·
 *   canonical-URL · dedup-status badge · warnings-count badge
 */
import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    MessageSquare,
    SkipForward,
} from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type {
    MediumImportPreviewErroredItem,
    MediumImportPreviewItem,
} from "../../api/client";
import { formatLocaleDate } from "../../utils/formatDate";
import styles from "./MediumImportPreviewTable.module.css";

interface MediumImportPreviewTableProps {
    items: MediumImportPreviewItem[];
    errored: MediumImportPreviewErroredItem[];
    /** Set of ``filename`` values currently checked. */
    selected: Set<string>;
    onToggleAll: (checked: boolean) => void;
    onToggleRow: (filename: string) => void;
    /** When true (during importing phase), the table renders rows
     *  as visually-busy and disables interaction. */
    disabled?: boolean;
}

function formatDate(isoString: string | null, lang: string): string {
    if (!isoString) return "—";
    const formatted = formatLocaleDate(isoString, lang);
    return formatted === "" || formatted === isoString ? "—" : formatted;
}

export default function MediumImportPreviewTable({
    items,
    errored,
    selected,
    onToggleAll,
    onToggleRow,
    disabled = false,
}: MediumImportPreviewTableProps) {
    const { t, lang } = useI18n();
    const [erroredOpen, setErroredOpen] = useState(true);

    const allChecked = items.length > 0 && selected.size === items.length;
    const noneChecked = selected.size === 0;
    const indeterminate = !allChecked && !noneChecked;

    return (
        <div className={styles.wrap} data-testid="medium-import-preview-root">
            <div className={styles.header}>
                <label className={styles.selectAllLabel}>
                    <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => {
                            if (el) el.indeterminate = indeterminate;
                        }}
                        onChange={(e) => onToggleAll(e.target.checked)}
                        disabled={disabled || items.length === 0}
                        data-testid="medium-import-preview-select-all"
                        aria-label={t(
                            "ui.medium_import.preview.select_all_aria",
                            "Alle auswählen",
                        )}
                    />
                    <span>
                        {t(
                            "ui.medium_import.preview.select_all_label",
                            "Alle auswählen",
                        )}
                    </span>
                </label>
                <span
                    className={styles.counter}
                    data-testid="medium-import-preview-count"
                >
                    {t(
                        "ui.medium_import.preview.count_format",
                        "{selected} von {total} ausgewählt",
                    )
                        .replace("{selected}", String(selected.size))
                        .replace("{total}", String(items.length))}
                </span>
            </div>

            {errored.length > 0 && (
                <Collapsible.Root
                    open={erroredOpen}
                    onOpenChange={setErroredOpen}
                    className={styles.erroredSection}
                >
                    <Collapsible.Trigger asChild>
                        <button
                            type="button"
                            className={styles.erroredTrigger}
                            data-testid="medium-import-preview-errored-trigger"
                        >
                            <span className={styles.erroredTriggerLeft}>
                                <AlertTriangle size={14} />
                                {t(
                                    "ui.medium_import.preview.errored_header",
                                    "Nicht lesbar ({count})",
                                ).replace("{count}", String(errored.length))}
                            </span>
                            {erroredOpen ? (
                                <ChevronDown size={14} />
                            ) : (
                                <ChevronRight size={14} />
                            )}
                        </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content className={styles.erroredContent}>
                        {errored.map((err, idx) => (
                            <div
                                key={`${err.filename}-${idx}`}
                                className={styles.erroredRow}
                                data-testid="medium-import-preview-errored-row"
                            >
                                <div className={styles.erroredFilename}>
                                    {err.filename}
                                </div>
                                <div className={styles.erroredMessage}>
                                    {err.error}
                                </div>
                            </div>
                        ))}
                    </Collapsible.Content>
                </Collapsible.Root>
            )}

            {items.length === 0 ? (
                <p className={styles.empty} data-testid="medium-import-preview-empty">
                    {t(
                        "ui.medium_import.preview.empty",
                        "Das Archiv enthält keine lesbaren Beiträge.",
                    )}
                </p>
            ) : (
                <div
                    className={styles.tableScroll}
                    data-testid="medium-import-preview-table"
                >
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.colCheck} aria-label="" />
                                <th>
                                    {t(
                                        "ui.medium_import.preview.col_title",
                                        "Titel",
                                    )}
                                </th>
                                <th className={styles.colDate}>
                                    {t(
                                        "ui.medium_import.preview.col_date",
                                        "Datum",
                                    )}
                                </th>
                                <th className={styles.colLang}>
                                    {t(
                                        "ui.medium_import.preview.col_language",
                                        "Sprache",
                                    )}
                                </th>
                                <th className={styles.colClass}>
                                    {t(
                                        "ui.medium_import.preview.col_type",
                                        "Typ",
                                    )}
                                </th>
                                <th className={styles.colBadges}>
                                    {t(
                                        "ui.medium_import.preview.col_status",
                                        "Status",
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => {
                                const isChecked = selected.has(item.filename);
                                return (
                                    <tr
                                        key={item.filename}
                                        className={`${styles.row} ${isChecked ? "" : styles.rowDeselected}`}
                                        data-testid={`medium-import-preview-row-${item.filename}`}
                                    >
                                        <td className={styles.colCheck}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() =>
                                                    onToggleRow(item.filename)
                                                }
                                                disabled={disabled}
                                                data-testid={`medium-import-preview-row-checkbox-${item.filename}`}
                                                aria-label={t(
                                                    "ui.medium_import.preview.row_checkbox_aria",
                                                    "{filename} auswählen",
                                                ).replace(
                                                    "{filename}",
                                                    item.filename,
                                                )}
                                            />
                                        </td>
                                        <td>
                                            <div
                                                className={styles.titleCell}
                                                title={
                                                    item.canonical_url ||
                                                    item.filename
                                                }
                                            >
                                                {item.title}
                                            </div>
                                            <div className={styles.titleMeta}>
                                                {item.filename}
                                            </div>
                                        </td>
                                        <td className={styles.colDate}>
                                            {formatDate(
                                                item.published_at,
                                                lang || "en",
                                            )}
                                        </td>
                                        <td className={styles.colLang}>
                                            {item.detected_language || "—"}
                                        </td>
                                        <td className={styles.colClass}>
                                            {item.classification === "comment" ? (
                                                <span
                                                    className={`${styles.badge} ${styles.badgeComment}`}
                                                    title={item.body_preview}
                                                >
                                                    <MessageSquare size={12} />
                                                    {t(
                                                        "ui.medium_import.preview.badge_comment",
                                                        "Kommentar",
                                                    )}
                                                </span>
                                            ) : (
                                                <span
                                                    className={`${styles.badge} ${styles.badgeArticle}`}
                                                >
                                                    {t(
                                                        "ui.medium_import.preview.badge_article",
                                                        "Artikel",
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                        <td className={styles.colBadges}>
                                            {item.existing_article_id && (
                                                <span
                                                    className={`${styles.badge} ${styles.badgeDedup}`}
                                                    data-testid={`medium-import-preview-dedup-badge-${item.filename}`}
                                                    title={t(
                                                        "ui.medium_import.preview.badge_dedup_tooltip",
                                                        "Ein Artikel mit derselben URL existiert bereits.",
                                                    )}
                                                >
                                                    <SkipForward size={12} />
                                                    {t(
                                                        "ui.medium_import.preview.badge_dedup",
                                                        "Duplikat",
                                                    )}
                                                </span>
                                            )}
                                            {item.warnings.length > 0 && (
                                                <span
                                                    className={`${styles.badge} ${styles.badgeWarn}`}
                                                    data-testid={`medium-import-preview-warnings-badge-${item.filename}`}
                                                    title={item.warnings.join(
                                                        " · ",
                                                    )}
                                                >
                                                    <AlertTriangle size={12} />
                                                    {t(
                                                        "ui.medium_import.preview.badge_warnings",
                                                        "{count} Warnungen",
                                                    ).replace(
                                                        "{count}",
                                                        String(
                                                            item.warnings
                                                                .length,
                                                        ),
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
