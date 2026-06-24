import { useState, type Dispatch, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

import { api, ApiError, Article, BookDetail } from "../../api/client";
import { getStorage } from "../../storage";
import { notify } from "../../utils/platform/notify";
import { downloadBlob } from "../../shared/utils/downloadBlob";
import {
    type BulkExportFormat,
    type BulkExportMode,
    BULK_LIMIT_HARD,
} from "../../components/articles/ArticleBulkActionBar";
import type { useArticleFilters } from "./useArticleFilters";
import type { useArticleSelection } from "../../components/articles/useArticleSelection";
import type { useI18n } from "../useI18n";

type ArticleFilters = ReturnType<typeof useArticleFilters>;
type ArticleSelection = ReturnType<typeof useArticleSelection>;
type TFunc = ReturnType<typeof useI18n>["t"];

interface BulkActionsParams {
    filters: ArticleFilters;
    selection: ArticleSelection;
    setArticles: Dispatch<SetStateAction<Article[]>>;
    loadTrash: () => void | Promise<void>;
    navigate: NavigateFunction;
    t: TFunc;
}

/**
 * Multi-select operations for the article list: bulk export, bulk
 * AI-template export, bulk AI-fill, bulk (soft + permanent) delete, and
 * article-to-book conversion. Owns the dialog state each flow drives.
 *
 * Extracted from ArticleList.tsx (god-file split, #207) as a pure
 * structural move — same behaviour, same toasts. The page renders the
 * BulkActionBar + the bulk dialogs against this hook's returned state.
 *
 * @example
 * const bulk = useArticleBulkActions({ filters, selection, setArticles, loadTrash, navigate, t });
 * bulk.handleBulkExport(format, mode);
 */
export function useArticleBulkActions({
    filters,
    selection,
    setArticles,
    loadTrash,
    navigate,
    t,
}: BulkActionsParams) {
    const [convertToBookArticles, setConvertToBookArticles] = useState<Article[] | null>(null);
    const [bulkArticleAiImportOpen, setBulkArticleAiImportOpen] = useState(false);
    const [bulkArticleAiFillFieldsOpen, setBulkArticleAiFillFieldsOpen] = useState(false);
    const [bulkArticleAiFillConfirm, setBulkArticleAiFillConfirm] = useState<{
        ids: string[];
        fieldClasses: string[];
        force: boolean;
        inlineImageCount?: number | null;
    } | null>(null);
    // Bulk-delete state. The permanent-path dialog opens with a
    // captured count + ID list so the user typing happens against a
    // snapshot, not the live selection (which they can't change while
    // the modal is open, but pinning is still cleaner).
    const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
        ids: string[];
        count: number;
    } | null>(null);

    const handleOpenConvertToBook = () => {
        const ids = new Set(selection.selectedIds);
        const snapshot = filters.filteredArticles.filter((a) => ids.has(a.id));
        if (snapshot.length === 0) return;
        setConvertToBookArticles(snapshot);
    };

    const handleBookCreated = (book: BookDetail) => {
        // Page-level cleanup after a successful conversion. Runs
        // unconditionally so the dashboard is in a clean state
        // regardless of whether the user follows the toast CTA.
        // Navigation lives on ``handleViewBook`` (toast action),
        // not here.
        void book;
        selection.clear();
        setConvertToBookArticles(null);
    };

    const handleViewBook = (book: BookDetail) => {
        navigate(`/book/${book.id}`);
    };

    /** Bulk export. Reads the current filtered list in display
     *  order, restricts to the selected IDs, then POSTs them to the
     *  backend bulk endpoint. The backend preserves the input order
     *  in the response (combined sections / ZIP iteration), so the
     *  user sees exactly what they selected, in the order they saw
     *  it on screen. Toasts on failure with the server message
     *  (which includes the offending article title for fail-loud
     *  pandoc errors). */
    const handleBulkExport = async (format: BulkExportFormat, mode: BulkExportMode) => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        if (ordered.length > BULK_LIMIT_HARD) return; // bar already disables, double-guard.
        try {
            const { blob, filename } = await api.articles.bulkExport(ordered, format, mode);
            downloadBlob(blob, filename);
            selection.clear();
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.articles.bulk.export_failed", "Bulk export failed");
            notify.error(message, err);
        }
    };

    // UNIVERSAL-AI-TEMPLATE-02: bulk AI-template ZIP export.
    // Cap of 50 enforced by the bar's disabled state; the
    // server-side 422 surfaces via toast if the gate is
    // somehow bypassed.
    const handleBulkArticleAiTemplateExport = async () => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        try {
            const { blob, filename } = await api.articles.bulkAiTemplate.export(ordered);
            downloadBlob(blob, filename);
            notify.success(
                t(
                    "ui.ai_template.bulk.export_success",
                    "{count} template(s) exported as {filename}",
                )
                    .replace("{count}", String(ordered.length))
                    .replace("{filename}", filename),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.ai_template.bulk.export_failed", "Bulk template export failed");
            notify.error(message, err);
        }
    };

    const handleBulkDelete = async (permanent: false) => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2) return;
        try {
            const result = await getStorage().articles.bulkDelete(ordered, permanent);
            // Optimistic refresh: drop the deleted IDs from the
            // visible list right away rather than re-fetching the
            // whole collection.
            setArticles((prev) =>
                prev.filter(
                    (a) => !ordered.includes(a.id) || result.failed.some((f) => f.id === a.id),
                ),
            );
            void loadTrash();
            selection.clear();
            const message = t(
                "ui.bulk_delete.toast_trashed",
                "{count} in den Papierkorb verschoben",
            ).replace("{count}", String(result.deleted_count));
            // Undo restores every successfully-trashed row via the
            // bulk-restore endpoint (BULK-RESTORE-PARITY-01). One
            // round-trip vs Promise.all(N) — serializes the work
            // into one DB transaction and surfaces per-id failures
            // via the response shape instead of swallowing them in
            // Promise.all's "first rejection wins" semantics.
            notify.bulkAction(
                message,
                async () => {
                    try {
                        const undone = ordered.filter(
                            (id) =>
                                !result.skipped_already_trashed.includes(id) &&
                                !result.failed.some((f) => f.id === id),
                        );
                        if (undone.length === 0) {
                            notify.info(t("ui.bulk_delete.toast_undone", "Wiederhergestellt"));
                            return;
                        }
                        const undoResult = await getStorage().articles.bulkRestore(undone);
                        const fresh = await getStorage().articles.list();
                        setArticles(fresh);
                        void loadTrash();
                        if (undoResult.failed.length > 0) {
                            notify.warning(
                                t(
                                    "ui.bulk_delete.toast_undone_partial",
                                    "{restored} wiederhergestellt, {failed} fehlgeschlagen",
                                )
                                    .replace("{restored}", String(undoResult.restored_count))
                                    .replace("{failed}", String(undoResult.failed.length)),
                            );
                        } else {
                            notify.info(t("ui.bulk_delete.toast_undone", "Wiederhergestellt"));
                        }
                    } catch (undoErr) {
                        notify.error(
                            t(
                                "ui.bulk_delete.toast_undo_failed",
                                "Wiederherstellen fehlgeschlagen",
                            ),
                            undoErr,
                        );
                    }
                },
                t("ui.bulk_delete.undo_label", "Rückgängig"),
            );
        } catch (err) {
            notify.error(t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"), err);
        }
    };

    const handleBulkDeletePermanentRequest = () => {
        const ordered = filters.filteredArticles
            .map((a) => a.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2) return;
        setBulkDeleteDialog({ ids: ordered, count: ordered.length });
    };

    const handleBulkDeletePermanentConfirmed = async () => {
        if (!bulkDeleteDialog) return;
        const { ids } = bulkDeleteDialog;
        setBulkDeleteDialog(null);
        try {
            const result = await getStorage().articles.bulkDelete(ids, true);
            setArticles((prev) => prev.filter((a) => !ids.includes(a.id)));
            selection.clear();
            notify.success(
                t("ui.bulk_delete.toast_deleted_permanent", "{count} endgültig gelöscht").replace(
                    "{count}",
                    String(result.deleted_count),
                ),
            );
        } catch (err) {
            notify.error(t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"), err);
        }
    };

    return {
        convertToBookArticles,
        setConvertToBookArticles,
        handleOpenConvertToBook,
        handleBookCreated,
        handleViewBook,
        handleBulkExport,
        handleBulkArticleAiTemplateExport,
        handleBulkDelete,
        handleBulkDeletePermanentRequest,
        handleBulkDeletePermanentConfirmed,
        bulkDeleteDialog,
        setBulkDeleteDialog,
        bulkArticleAiImportOpen,
        setBulkArticleAiImportOpen,
        bulkArticleAiFillFieldsOpen,
        setBulkArticleAiFillFieldsOpen,
        bulkArticleAiFillConfirm,
        setBulkArticleAiFillConfirm,
    };
}
