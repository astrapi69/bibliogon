import { useState, type Dispatch, type SetStateAction } from "react";

import { Book } from "../../api/client";
import { getStorage } from "../../storage";
import { notify } from "../../utils/notify";
import { RESTORE_ACTION_ID, PERMANENT_DELETE_ACTION_ID } from "@astrapi69/entity-kit";

type ConfirmFn = (
    title: string,
    message: string,
    variant?: "default" | "danger" | "success" | "info",
    options?: { confirmLabel?: string },
) => Promise<boolean>;

type Translate = (key: string, fallback: string) => string;

interface SelectionApi {
    remove: (id: string) => void;
}

export interface UseDashboardBookData {
    books: Book[];
    setBooks: Dispatch<SetStateAction<Book[]>>;
    trash: Book[];
    setTrash: Dispatch<SetStateAction<Book[]>>;
    loading: boolean;
    setLoading: Dispatch<SetStateAction<boolean>>;
    loadBooks: () => Promise<void>;
    loadTrash: () => Promise<void>;
    handleDelete: (id: string) => Promise<void>;
    handleDeletePermanent: (id: string) => Promise<void>;
    handleRestore: (book: Book) => Promise<void>;
    handlePermanentDelete: (id: string) => Promise<void>;
    handleTrashAction: (actionId: string, book: Book) => void;
    handleEmptyTrash: () => Promise<void>;
}

/**
 * Books data lifecycle for the Dashboard: the active list + trash state,
 * their loaders through the storage seam, and the single-item soft /
 * permanent-delete + restore + empty-trash handlers. The mount effect
 * (which also loads donation config + the default book-type) stays on
 * the page and calls ``loadBooks`` / ``loadTrash`` from here. Bulk
 * operations stay on the page because they need the filtered display
 * order and the bulk-delete dialog state.
 *
 * @param dialog - AppDialog api (confirm) used by destructive handlers.
 * @param selection - bulk-selection api; handlers reconcile removed rows.
 * @param t - i18n translate function.
 */
export function useDashboardBookData(
    dialog: { confirm: ConfirmFn },
    selection: SelectionApi,
    t: Translate,
): UseDashboardBookData {
    const [books, setBooks] = useState<Book[]>([]);
    const [trash, setTrash] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBooks = async () => {
        try {
            // Reads route through the storage seam: ApiStorage online,
            // DexieStorage offline (offline-available books). (P3-C4)
            const data = await getStorage().books.list();
            setBooks(data);
        } catch (err) {
            console.error("Failed to load books:", err);
        } finally {
            setLoading(false);
        }
    };

    const loadTrash = async () => {
        try {
            // Routes through the storage seam: ApiStorage online,
            // DexieStorage offline (soft-deleted books). (Finding 7)
            const data = await getStorage().books.listTrash();
            setTrash(data);
        } catch (err) {
            console.error("Failed to load trash:", err);
        }
    };

    const handleDelete = async (id: string) => {
        await getStorage().books.delete(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
        // Reconcile bulk-selection state: the row that just
        // disappeared must not stay in the BulkActionBar count.
        selection.remove(id);
        loadTrash();
        notify.info(t("ui.dashboard.moved_to_trash", "In den Papierkorb verschoben"));
    };

    const handleDeletePermanent = async (id: string) => {
        if (
            !(await dialog.confirm(
                t("ui.dashboard.delete_permanent_title", "Endgültig löschen"),
                t(
                    "ui.dashboard.delete_permanent_warning",
                    "Das Buch wird unwiderruflich gelöscht. Diese Aktion kann NICHT rückgaengig gemacht werden. Nur für erfahrene Benutzer.",
                ),
                "danger",
            ))
        )
            return;
        await getStorage().books.delete(id);
        try {
            await getStorage().books.permanentDelete(id);
        } catch {
            /* already in trash */
        }
        setBooks((prev) => prev.filter((b) => b.id !== id));
        // Reconcile bulk-selection state.
        selection.remove(id);
        notify.success(t("ui.dashboard.deleted_permanently", "Buch endgültig gelöscht"));
    };

    const handleRestore = async (book: Book) => {
        // Optimistic update: drop the trash row first so the
        // user sees the restore land before the network round-
        // trip. The POST returns the restored entity which we
        // splice into the live list — skipping the full
        // /api/books refetch that produced the 419ms-class
        // perception-lag the 2026-05-14 user report surfaced.
        setTrash((prev) => prev.filter((b) => b.id !== book.id));
        try {
            const restored = await getStorage().books.restore(book.id);
            setBooks((prev) => {
                if (prev.some((b) => b.id === restored.id)) return prev;
                return [restored, ...prev];
            });
            notify.success(t("ui.dashboard.restored", "Buch wiederhergestellt"));
        } catch (err) {
            // Revert the optimistic trash removal so a failed
            // restore does not vanish the row entirely.
            setTrash((prev) => {
                if (prev.some((b) => b.id === book.id)) return prev;
                return [book, ...prev];
            });
            notify.error(t("ui.dashboard.restore_failed", "Wiederherstellen fehlgeschlagen"), err);
        }
    };

    const handlePermanentDelete = async (id: string) => {
        if (
            !(await dialog.confirm(
                t("ui.dashboard.delete_permanent_title", "Endgültig löschen"),
                t(
                    "ui.dashboard.delete_permanent_warning",
                    "Buch endgültig löschen? Dies kann nicht rückgaengig gemacht werden.",
                ),
                "danger",
            ))
        )
            return;
        await getStorage().books.permanentDelete(id);
        setTrash((prev) => prev.filter((b) => b.id !== id));
        // Defensive: same as ArticleList — if the book was soft-deleted
        // in another tab and the id was still in this tab's live-list
        // selection, drop it so the BulkActionBar count never
        // references a row that's gone everywhere.
        selection.remove(id);
    };

    // Shared handler for both trash views (EntityTrashView list + EntityTileView
    // grid), which emit the same restore / permanent-delete action ids.
    const handleTrashAction = (actionId: string, book: Book) => {
        if (actionId === RESTORE_ACTION_ID) void handleRestore(book);
        else if (actionId === PERMANENT_DELETE_ACTION_ID) void handlePermanentDelete(book.id);
    };

    const handleEmptyTrash = async () => {
        if (
            !(await dialog.confirm(
                t("ui.dashboard.empty_trash_title", "Papierkorb leeren"),
                t(
                    "ui.dashboard.empty_trash_warning",
                    "Alle Bücher im Papierkorb werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgaengig gemacht werden.",
                ),
                "danger",
            ))
        )
            return;
        await getStorage().books.emptyTrash();
        setTrash([]);
    };

    return {
        books,
        setBooks,
        trash,
        setTrash,
        loading,
        setLoading,
        loadBooks,
        loadTrash,
        handleDelete,
        handleDeletePermanent,
        handleRestore,
        handlePermanentDelete,
        handleTrashAction,
        handleEmptyTrash,
    };
}
