/**
 * Result panel for a completed Medium import.
 *
 * Three collapsible sections (Radix Collapsible) — errored at the
 * top because it needs attention, then imported, then skipped.
 * Errored is expanded by default; imported and skipped are
 * collapsed because the imported list can run to hundreds of rows.
 *
 * Imported rows link to the corresponding Bibliogon article via
 * /articles/{id}. Skipped rows link to the existing article that
 * matched the canonical URL.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    MessageSquare,
    SkipForward,
} from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { MediumImportResponse } from "../../api/client";
import styles from "./MediumImportResult.module.css";

interface MediumImportResultProps {
    result: MediumImportResponse;
    onReset: () => void;
}

export default function MediumImportResult({ result, onReset }: MediumImportResultProps) {
    const { t } = useI18n();
    const [erroredOpen, setErroredOpen] = useState(result.errored_count > 0);
    const [importedOpen, setImportedOpen] = useState(false);
    const [skippedOpen, setSkippedOpen] = useState(false);
    const [importedCommentsOpen, setImportedCommentsOpen] = useState(false);
    const [skippedCommentsOpen, setSkippedCommentsOpen] = useState(false);

    // MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01: comment-routing
    // fields default to 0 / empty so the UI gates on them cleanly
    // even for responses pre-dating v0.31.0 (the back-compat
    // sync v1 endpoint also surfaces them now). Local consts keep
    // the JSX below readable.
    const importedCommentsCount = result.imported_comments_count ?? 0;
    const skippedCommentsCount = result.skipped_comments_count ?? 0;
    const importedComments = result.imported_comments ?? [];
    const skippedComments = result.skipped_comments ?? [];

    return (
        <div className={styles.wrap} data-testid="medium-import-result">
            <div className={styles.summary}>
                <h2 className={styles.summaryHeader}>
                    {t("ui.medium_import.result.header", "Import abgeschlossen")}
                </h2>
                <div className={styles.summaryCounts}>
                    <span
                        className={styles.summaryCount}
                        data-testid="medium-import-result-imported-count"
                    >
                        <CheckCircle2 size={14} className={styles.triggerImported} />
                        {t(
                            "ui.medium_import.result.imported_count",
                            "{count} Artikel importiert",
                        ).replace("{count}", String(result.imported_count))}
                    </span>
                    <span
                        className={styles.summaryCount}
                        data-testid="medium-import-result-skipped-count"
                    >
                        <SkipForward size={14} />
                        {t(
                            "ui.medium_import.result.skipped_count",
                            "{count} übersprungen",
                        ).replace("{count}", String(result.skipped_count))}
                    </span>
                    <span
                        className={styles.summaryCount}
                        data-testid="medium-import-result-errored-count"
                    >
                        <AlertTriangle size={14} className={styles.triggerErrored} />
                        {t(
                            "ui.medium_import.result.errored_count",
                            "{count} Fehler",
                        ).replace("{count}", String(result.errored_count))}
                    </span>
                    {importedCommentsCount > 0 && (
                        <span
                            className={styles.summaryCount}
                            data-testid="medium-import-result-imported-comments-count"
                        >
                            <MessageSquare size={14} />
                            {t(
                                "ui.medium_import.result.imported_comments_count",
                                "{count} Kommentare importiert",
                            ).replace("{count}", String(importedCommentsCount))}
                        </span>
                    )}
                    {skippedCommentsCount > 0 && (
                        <span
                            className={styles.summaryCount}
                            data-testid="medium-import-result-skipped-comments-count"
                        >
                            <SkipForward size={14} />
                            {t(
                                "ui.medium_import.result.skipped_comments_count",
                                "{count} Kommentare übersprungen",
                            ).replace("{count}", String(skippedCommentsCount))}
                        </span>
                    )}
                </div>
                <div className={styles.actions}>
                    <Link
                        to="/articles"
                        className="btn btn-primary btn-sm"
                        data-testid="medium-import-result-go-articles"
                    >
                        {t("ui.medium_import.result.go_to_articles", "Zu den Artikeln")}
                    </Link>
                    {importedCommentsCount > 0 && (
                        <Link
                            to="/settings?tab=comments"
                            className="btn btn-secondary btn-sm"
                            data-testid="medium-import-result-go-comments"
                        >
                            {t(
                                "ui.medium_import.result.go_to_comments",
                                "Zu den Kommentaren",
                            )}
                        </Link>
                    )}
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onReset}
                        data-testid="medium-import-result-reset"
                    >
                        {t(
                            "ui.medium_import.result.import_another",
                            "Weiteres ZIP importieren",
                        )}
                    </button>
                </div>
            </div>

            {result.errored_count > 0 && (
                <Collapsible.Root
                    open={erroredOpen}
                    onOpenChange={setErroredOpen}
                    className={`${styles.section} ${styles.sectionErrored}`}
                >
                    <Collapsible.Trigger asChild>
                        <button
                            type="button"
                            className={styles.trigger}
                            data-testid="medium-import-result-errored-trigger"
                        >
                            <span className={styles.triggerLeft}>
                                <AlertTriangle size={14} className={styles.triggerErrored} />
                                {t(
                                    "ui.medium_import.result.show_errored",
                                    "Fehler anzeigen ({count})",
                                ).replace("{count}", String(result.errored_count))}
                            </span>
                            {erroredOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content className={styles.content}>
                        {result.errored.length === 0 ? (
                            <p className={styles.empty}>
                                {t("ui.medium_import.result.empty", "Keine Einträge.")}
                            </p>
                        ) : (
                            result.errored.map((err, idx) => (
                                <div
                                    key={`${err.filename}-${idx}`}
                                    className={styles.row}
                                    data-testid="medium-import-result-errored-row"
                                >
                                    <div className={styles.rowTitle}>{err.filename}</div>
                                    <div className={styles.rowError}>{err.error}</div>
                                </div>
                            ))
                        )}
                    </Collapsible.Content>
                </Collapsible.Root>
            )}

            <Collapsible.Root
                open={importedOpen}
                onOpenChange={setImportedOpen}
                className={`${styles.section} ${styles.sectionImported}`}
            >
                <Collapsible.Trigger asChild>
                    <button
                        type="button"
                        className={styles.trigger}
                        data-testid="medium-import-result-imported-trigger"
                    >
                        <span className={styles.triggerLeft}>
                            <CheckCircle2 size={14} className={styles.triggerImported} />
                            {t(
                                "ui.medium_import.result.show_imported",
                                "Importierte Artikel anzeigen ({count})",
                            ).replace("{count}", String(result.imported_count))}
                        </span>
                        {importedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                </Collapsible.Trigger>
                <Collapsible.Content className={styles.content}>
                    {result.imported.length === 0 ? (
                        <p className={styles.empty}>
                            {t("ui.medium_import.result.empty", "Keine Einträge.")}
                        </p>
                    ) : (
                        result.imported.map((article) => (
                            <div
                                key={article.id}
                                className={styles.row}
                                data-testid="medium-import-result-imported-row"
                            >
                                <div className={styles.rowTitle}>
                                    <Link
                                        to={`/articles/${article.id}`}
                                        className={styles.rowLink}
                                    >
                                        {article.title}
                                    </Link>
                                </div>
                                <div className={styles.rowMeta} title={article.canonical_url}>
                                    {article.canonical_url}
                                </div>
                                {article.warnings.length > 0 && (
                                    <div className={styles.rowMeta}>
                                        {article.warnings.join(" · ")}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </Collapsible.Content>
            </Collapsible.Root>

            {result.skipped_count > 0 && (
                <Collapsible.Root
                    open={skippedOpen}
                    onOpenChange={setSkippedOpen}
                    className={`${styles.section} ${styles.sectionSkipped}`}
                >
                    <Collapsible.Trigger asChild>
                        <button
                            type="button"
                            className={styles.trigger}
                            data-testid="medium-import-result-skipped-trigger"
                        >
                            <span className={styles.triggerLeft}>
                                <SkipForward size={14} />
                                {t(
                                    "ui.medium_import.result.show_skipped",
                                    "Übersprungene anzeigen ({count})",
                                ).replace("{count}", String(result.skipped_count))}
                            </span>
                            {skippedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content className={styles.content}>
                        {result.skipped.map((skip, idx) => (
                            <div
                                key={`${skip.filename}-${idx}`}
                                className={styles.row}
                                data-testid="medium-import-result-skipped-row"
                            >
                                <div className={styles.rowTitle}>
                                    <Link
                                        to={`/articles/${skip.existing_article_id}`}
                                        className={styles.rowLink}
                                    >
                                        {skip.filename}
                                    </Link>
                                </div>
                                <div className={styles.rowMeta} title={skip.canonical_url}>
                                    {skip.canonical_url}
                                </div>
                            </div>
                        ))}
                    </Collapsible.Content>
                </Collapsible.Root>
            )}

            {importedCommentsCount > 0 && (
                <Collapsible.Root
                    open={importedCommentsOpen}
                    onOpenChange={setImportedCommentsOpen}
                    className={`${styles.section} ${styles.sectionSkipped}`}
                >
                    <Collapsible.Trigger asChild>
                        <button
                            type="button"
                            className={styles.trigger}
                            data-testid="medium-import-result-imported-comments-trigger"
                        >
                            <span className={styles.triggerLeft}>
                                <MessageSquare size={14} />
                                {t(
                                    "ui.medium_import.result.show_imported_comments",
                                    "Importierte Kommentare anzeigen ({count})",
                                ).replace("{count}", String(importedCommentsCount))}
                            </span>
                            {importedCommentsOpen ? (
                                <ChevronDown size={14} />
                            ) : (
                                <ChevronRight size={14} />
                            )}
                        </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content className={styles.content}>
                        {importedComments.map((comment, idx) => (
                            <div
                                key={`${comment.id}-${idx}`}
                                className={styles.row}
                                data-testid="medium-import-result-imported-comment-row"
                            >
                                <div className={styles.rowTitle}>
                                    {comment.filename}
                                </div>
                                <div className={styles.rowMeta}>
                                    {comment.body_preview || "—"}
                                </div>
                            </div>
                        ))}
                    </Collapsible.Content>
                </Collapsible.Root>
            )}

            {skippedCommentsCount > 0 && (
                <Collapsible.Root
                    open={skippedCommentsOpen}
                    onOpenChange={setSkippedCommentsOpen}
                    className={`${styles.section} ${styles.sectionSkipped}`}
                >
                    <Collapsible.Trigger asChild>
                        <button
                            type="button"
                            className={styles.trigger}
                            data-testid="medium-import-result-skipped-comments-trigger"
                        >
                            <span className={styles.triggerLeft}>
                                <SkipForward size={14} />
                                {t(
                                    "ui.medium_import.result.show_skipped_comments",
                                    "Übersprungene Kommentare anzeigen ({count})",
                                ).replace("{count}", String(skippedCommentsCount))}
                            </span>
                            {skippedCommentsOpen ? (
                                <ChevronDown size={14} />
                            ) : (
                                <ChevronRight size={14} />
                            )}
                        </button>
                    </Collapsible.Trigger>
                    <Collapsible.Content className={styles.content}>
                        {skippedComments.map((comment, idx) => (
                            <div
                                key={`${comment.filename}-${idx}`}
                                className={styles.row}
                                data-testid="medium-import-result-skipped-comment-row"
                            >
                                <div className={styles.rowTitle}>
                                    {comment.filename}
                                </div>
                                <div className={styles.rowMeta}>
                                    {comment.reason}
                                </div>
                            </div>
                        ))}
                    </Collapsible.Content>
                </Collapsible.Root>
            )}
        </div>
    );
}
