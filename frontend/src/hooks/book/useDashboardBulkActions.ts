import { useState, type Dispatch, type SetStateAction } from "react";

import { api, ApiError, Book } from "../../api/client";
import { getStorage } from "../../storage";
import { downloadBlob } from "../../shared/utils/downloadBlob";
import {
    type BookBulkExportFormat,
    BOOK_BULK_LIMIT_HARD,
} from "../../components/book/BookBulkActionBar";
import type { FieldClassDialogResult } from "../../components/shared/FieldClassDialog";
import type { BookFilters } from "./useBookFilters";
import type { BookSelection } from "../../components/book/useBookSelection";
import { notify } from "../../utils/platform/notify";

type Translate = (key: string, fallback: string) => string;

interface BulkDeleteDialogState {
    ids: string[];
    count: number;
}

interface BulkAiFillConfirmState {
    ids: string[];
    fieldClasses: string[];
    force: boolean;
    inlineImageCount?: number | null;
}

export interface UseDashboardBulkActions {
    handleBulkBookExport: (format: BookBulkExportFormat) => Promise<void>;
    handleBulkBookAiTemplateExport: () => Promise<void>;
    handleBulkBookDelete: (permanent: false) => Promise<void>;
    handleBulkBookDeletePermanentRequest: () => void;
    handleBulkBookDeletePermanentConfirmed: () => Promise<void>;
    bulkBookAiImportOpen: boolean;
    setBulkBookAiImportOpen: Dispatch<SetStateAction<boolean>>;
    bulkBookAiFillFieldsOpen: boolean;
    setBulkBookAiFillFieldsOpen: Dispatch<SetStateAction<boolean>>;
    handleBulkAiFillFieldsSubmit: (req: FieldClassDialogResult) => void;
    bulkBookAiFillConfirm: BulkAiFillConfirmState | null;
    setBulkBookAiFillConfirm: Dispatch<SetStateAction<BulkAiFillConfirmState | null>>;
    bulkDeleteDialog: BulkDeleteDialogState | null;
    setBulkDeleteDialog: Dispatch<SetStateAction<BulkDeleteDialogState | null>>;
}

interface Params {
    filters: BookFilters;
    selection: BookSelection;
    setBooks: Dispatch<SetStateAction<Book[]>>;
    loadBooks: () => Promise<void>;
    loadTrash: () => Promise<void>;
    t: Translate;
}

/**
 * Owns the Dashboard's bulk-operation handlers + their dialog state: bulk
 * export, bulk AI-template export/import, bulk AI-fill (field-class dialog →
 * confirm dialog), and bulk soft/permanent delete (with undo). Extracted from
 * Dashboard so the page component stays focused on layout + the book grid.
 *
 * Selection IDs are always read in the current filtered display order so the
 * user gets exactly what they selected, in the order they saw it.
 *
 * @example
 * const bulk = useDashboardBulkActions({ filters, selection, setBooks, loadBooks, loadTrash, t });
 * bulk.handleBulkBookExport("epub");
 */
export function useDashboardBulkActions({
    filters,
    selection,
    setBooks,
    loadBooks,
    loadTrash,
    t,
}: Params): UseDashboardBulkActions {
    const orderedSelectedIds = (): string[] =>
        filters.filteredBooks.map((b) => b.id).filter((id) => selection.isSelected(id));

    /** Bulk export. Reads the current filtered list in display order,
     *  restricts to the selected IDs, then POSTs them to the backend
     *  bulk endpoint. The backend preserves the input order in the
     *  response (ZIP iteration), so the user gets exactly what they
     *  selected, in the order they saw it on screen. Toasts on
     *  failure with the server message (which includes the offending
     *  book's title for fail-loud Pandoc errors). */
    const handleBulkBookExport = async (format: BookBulkExportFormat) => {
        const ordered = orderedSelectedIds();
        if (ordered.length === 0) return;
        if (ordered.length > BOOK_BULK_LIMIT_HARD) return;
        try {
            const { blob, filename } = await api.books.bulkExport(ordered, format);
            downloadBlob(blob, filename);
            selection.clear();
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.dashboard.bulk.export_failed", "Bulk book export failed");
            notify.error(message, err);
        }
    };

    // UNIVERSAL-AI-TEMPLATE-02: bulk AI-template ZIP export.
    // Cap of 50 enforced by the action bar's disabled state;
    // server-side 422 surfaces here as a toast if the bar gate
    // is somehow bypassed (e.g. e2e replay).
    const handleBulkBookAiTemplateExport = async () => {
        const ordered = orderedSelectedIds();
        if (ordered.length === 0) return;
        try {
            const { blob, filename } = await api.books.bulkAiTemplate.export(ordered);
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

    const [bulkBookAiImportOpen, setBulkBookAiImportOpen] = useState(false);

    // UNIVERSAL-AI-TEMPLATE-02 commit 8: bulk-AI-fill flow state.
    // The "Bulk AI fill" dropdown item opens a FieldClassDialog;
    // submitting that opens the BulkAiFillConfirmDialog; confirm
    // calls /start and hands off to BulkAiFillJobContext (the
    // dock takes over from there).
    const [bulkBookAiFillFieldsOpen, setBulkBookAiFillFieldsOpen] = useState(false);
    const [bulkBookAiFillConfirm, setBulkBookAiFillConfirm] = useState<BulkAiFillConfirmState | null>(
        null,
    );

    const handleBulkAiFillFieldsSubmit = (req: FieldClassDialogResult) => {
        const ids = orderedSelectedIds();
        if (ids.length === 0) {
            setBulkBookAiFillFieldsOpen(false);
            return;
        }
        setBulkBookAiFillFieldsOpen(false);
        setBulkBookAiFillConfirm({
            ids,
            fieldClasses: req.field_classes,
            force: req.force,
            inlineImageCount: req.inline_image_count,
        });
    };

    // Bulk-delete state. Same shape as the Articles dashboard;
    // see ArticleList.tsx for the rationale + behavior matrix.
    const [bulkDeleteDialog, setBulkDeleteDialog] = useState<BulkDeleteDialogState | null>(null);

    const handleBulkBookDelete = async (permanent: false) => {
        const ordered = orderedSelectedIds();
        if (ordered.length < 2) return;
        try {
            const result = await getStorage().books.bulkDelete(ordered, permanent);
            setBooks((prev) =>
                prev.filter(
                    (b) => !ordered.includes(b.id) || result.failed.some((f) => f.id === b.id),
                ),
            );
            loadTrash();
            selection.clear();
            const message = t(
                "ui.bulk_delete.toast_trashed",
                "{count} in den Papierkorb verschoben",
            ).replace("{count}", String(result.deleted_count));
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
                        // One round-trip via bulk-restore
                        // (BULK-RESTORE-PARITY-01). Per-id status
                        // surfaces partial failures via the response
                        // shape instead of Promise.all's first-rejection
                        // wins.
                        const undoResult = await getStorage().books.bulkRestore(undone);
                        loadBooks();
                        loadTrash();
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

    const handleBulkBookDeletePermanentRequest = () => {
        const ordered = orderedSelectedIds();
        if (ordered.length < 2) return;
        setBulkDeleteDialog({ ids: ordered, count: ordered.length });
    };

    const handleBulkBookDeletePermanentConfirmed = async () => {
        if (!bulkDeleteDialog) return;
        const { ids } = bulkDeleteDialog;
        setBulkDeleteDialog(null);
        try {
            const result = await getStorage().books.bulkDelete(ids, true);
            setBooks((prev) => prev.filter((b) => !ids.includes(b.id)));
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
        handleBulkBookExport,
        handleBulkBookAiTemplateExport,
        handleBulkBookDelete,
        handleBulkBookDeletePermanentRequest,
        handleBulkBookDeletePermanentConfirmed,
        bulkBookAiImportOpen,
        setBulkBookAiImportOpen,
        bulkBookAiFillFieldsOpen,
        setBulkBookAiFillFieldsOpen,
        handleBulkAiFillFieldsSubmit,
        bulkBookAiFillConfirm,
        setBulkBookAiFillConfirm,
        bulkDeleteDialog,
        setBulkDeleteDialog,
    };
}
