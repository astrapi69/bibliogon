/**
 * State, data-loading, and handler cluster for CommentsAdminSection.
 *
 * Extracted from CommentsAdminSection.tsx to keep the component file
 * under the cohesion threshold. The hook owns the active/trash view
 * mode, filters + pagination, the per-row + bulk delete/restore/
 * permanent handlers, the reclassify path, and the empty-trash flow;
 * the component consumes the returned bag and renders the table +
 * toolbars. Logic is byte-identical to the pre-extraction inline
 * version (including the documented ``tRef`` use in the fetch effect).
 */

import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";

import {ApiError, type ArticleComment} from "../../api/client";
import {getStorage} from "../../storage";
import {useDialog} from "../shared/AppDialog";
import {useI18n} from "../../hooks/useI18n";
import {notify} from "../../utils/platform/notify";
import {useCommentSelection} from "./useCommentSelection";

const PAGE_SIZE = 100;

export interface FilterState {
    importedFrom: string; // "" = all sources
    orphansOnly: boolean;
}

const DEFAULT_FILTERS: FilterState = {
    importedFrom: "",
    orphansOnly: false,
};

export type ViewMode = "active" | "trash";

export function useCommentsAdmin() {
    const {t, lang} = useI18n();
    const dialog = useDialog();
    const navigate = useNavigate();
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [rows, setRows] = useState<ArticleComment[]>([]);
    // Bug 10: view-mode toggle. ``"active"`` is the historical
    // CommentsAdmin behaviour (lists rows with ``deleted_at IS
    // NULL``); ``"trash"`` lists soft-deleted rows via
    // ``getStorage().comments.listTrashed`` and swaps per-row Delete for
    // Restore + Permanent-Delete. Mirrors the AD / BD
    // ``trash-toggle`` pattern (see Dashboard.tsx / ArticleList.tsx).
    const [viewMode, setViewMode] = useState<ViewMode>("active");
    const [trashCount, setTrashCount] = useState(0);
    const [pendingRestore, setPendingRestore] = useState<string | null>(null);
    const [pendingPermanent, setPendingPermanent] = useState<string | null>(null);
    const [emptyingTrash, setEmptyingTrash] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [pendingReclassify, setPendingReclassify] = useState<string | null>(null);
    // ``pageLimit`` only grows; "Load more" bumps it by PAGE_SIZE.
    // The backend caps at 500, so the UI caps at 500 too.
    const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
    const selection = useCommentSelection();
    // Snapshot of {ids, count} captured the moment the user opens the
    // type-to-confirm dialog. The selection can still change in
    // theory while the dialog is open (filter change clears
    // selection), so the snapshot is what gets deleted, not the live
    // selection.
    const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
        ids: string[];
        count: number;
    } | null>(null);
    // Preview modal: ``null`` means closed. Set to a row to open;
    // set back to null to close. The modal is the only surface for
    // reclassify (Bug 4c) and for reading the full body text past
    // the row's 120-char truncation (Bug 4b).
    const [previewComment, setPreviewComment] = useState<ArticleComment | null>(
        null,
    );

    // Hold the latest ``t`` in a ref so the fetch effect can reach
    // the i18n fallback without re-running every time ``t``'s
    // identity changes. Per the lessons-learned rule
    // "React useEffect deps + i18n test mocks: the t function
    // isn't stable", including ``t`` in the dep array makes the
    // effect re-fire on every render under the test mock and
    // overwrite optimistic state changes (e.g. delete).
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        const fetcher =
            viewMode === "trash"
                ? getStorage().comments.listTrashed()
                : getStorage().comments.list({
                      importedFrom: filters.importedFrom || undefined,
                      orphansOnly: filters.orphansOnly,
                      limit: pageLimit,
                  });
        fetcher
            .then((data) => {
                if (!cancelled) {
                    setRows(data);
                    if (viewMode === "trash") {
                        setTrashCount(data.length);
                    }
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof ApiError) {
                    setLoadError(err.detail);
                } else {
                    setLoadError(
                        tRef.current(
                            "ui.comments.admin.load_error",
                            "Could not load comments",
                        ),
                    );
                }
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [filters, pageLimit, viewMode]);

    // Bug 10: keep the trash-toggle badge count fresh even while
    // viewing the active list. Fires once on mount + after any
    // mutation that may change the trash population (single
    // soft-delete, restore, permanent-delete, empty-trash). Cheap:
    // the backend returns the full trash list; ``length`` is the
    // count. If trash size ever crosses ~thousands the right move
    // is a dedicated ``GET /comments/trash/count`` endpoint; until
    // then the existing list endpoint is sufficient.
    const refreshTrashCount = () => {
        getStorage()
            .comments.listTrashed()
            .then((rows) => setTrashCount(rows.length))
            .catch(() => {
                /* badge is non-critical; silent failure is OK */
            });
    };

    useEffect(() => {
        refreshTrashCount();
    }, []);

    const updateFilter = (patch: Partial<FilterState>) => {
        // Resetting the page limit on filter change is intentional:
        // a new filter shouldn't inherit the prior "load more"
        // expansions, which would otherwise produce confusing
        // mid-page jumps. Selection also clears because filtered-out
        // rows would otherwise stay in the count as orphans (per the
        // "destructive row-actions must reconcile collection state"
        // rule applied to filter-change too).
        setFilters((prev) => ({...prev, ...patch}));
        setPageLimit(PAGE_SIZE);
        selection.clear();
    };

    const showLoadMore =
        !loading &&
        rows.length === pageLimit &&
        pageLimit < 500; // backend cap

    const handleReclassifyAsArticle = async (row: ArticleComment) => {
        // Single-item move uses the simple confirm dialog. The move is
        // reversible (the reciprocal "Move to Comments" action exists
        // in the ArticleEditor), so a heavier type-to-confirm pattern
        // would just slow the user down. See lessons-learned rule on
        // simple-confirm vs type-to-confirm tradeoffs.
        const preview = row.body_text.length > 80
            ? row.body_text.slice(0, 80) + "..."
            : row.body_text;
        const ok = await dialog.confirm(
            t(
                "ui.comments.admin.reclassify_title",
                "Move comment to articles?",
            ),
            t(
                "ui.comments.admin.reclassify_message",
                'This will move the comment to the articles list with an auto-derived title. Body preview: "{preview}"',
            ).replace("{preview}", preview),
        );
        if (!ok) return;
        setPendingReclassify(row.id);
        try {
            const result = await getStorage().comments.reclassifyAsArticle(row.id);
            // Optimistically drop from the visible list — the comment
            // no longer exists. Also reconcile selection so the bar's
            // count never references an orphan id (per the
            // "destructive row-actions must reconcile collection state"
            // rule).
            setRows((prev) => prev.filter((c) => c.id !== row.id));
            selection.remove(row.id);
            // Close the preview modal if it was open against this
            // row — the modal's subject has just been moved.
            setPreviewComment((prev) => (prev?.id === row.id ? null : prev));
            // ``bulkAction`` shape (message + action callback + label)
            // matches what we want here even though the internal type
            // names reference "undo" — re-use rather than fork a
            // near-identical helper.
            notify.bulkAction(
                t(
                    "ui.comments.admin.reclassify_success",
                    "Comment moved to articles.",
                ),
                () => navigate(`/articles/${result.article_id}`),
                t("ui.comments.admin.reclassify_view", "View article"),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.comments.admin.reclassify_error",
                          "Could not move the comment.",
                      );
            notify.error(message, err);
        } finally {
            setPendingReclassify(null);
        }
    };

    const handleDelete = async (row: ArticleComment) => {
        // Single-item delete uses the simple confirm dialog
        // (Promise<boolean>) rather than the bulk-delete
        // type-to-confirm pattern. Per the S6 design decision:
        // single-comment deletion is low-stakes vs. bulk-delete's
        // potential mass-damage, so the lighter UX is enough.
        const preview = row.body_text.length > 80
            ? row.body_text.slice(0, 80) + "..."
            : row.body_text;
        const ok = await dialog.confirm(
            t("ui.comments.admin.delete_title", "Delete comment?"),
            t(
                "ui.comments.admin.delete_message",
                'This will move the comment to trash. Body preview: "{preview}"',
            ).replace("{preview}", preview),
        );
        if (!ok) return;
        setPendingDelete(row.id);
        try {
            await getStorage().comments.delete(row.id);
            // Optimistically drop from the visible list; cheaper
            // than a full refetch and matches the
            // "delete-and-move-on" mental model. Reconcile selection
            // so the bar's count stays consistent.
            setRows((prev) => prev.filter((c) => c.id !== row.id));
            selection.remove(row.id);
            // Close the preview modal if it was open against this row.
            setPreviewComment((prev) => (prev?.id === row.id ? null : prev));
            // Bug 10: trash population changed, refresh the badge.
            refreshTrashCount();
            notify.success(
                t("ui.comments.admin.delete_success", "Comment deleted."),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.comments.admin.delete_error",
                          "Could not delete the comment.",
                      );
            notify.error(message, err);
        } finally {
            setPendingDelete(null);
        }
    };

    // Bulk-delete: gather currently-selected ids (in visible-list
    // order so the toast count matches the user's intuition), call
    // the backend, drop the rows + selection optimistically.
    const handleBulkDelete = async (_permanent: false) => {
        const ordered = rows
            .map((r) => r.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2) return;
        try {
            const result = await getStorage().comments.bulkDelete(ordered, false);
            setRows((prev) =>
                prev.filter(
                    (r) =>
                        !ordered.includes(r.id) ||
                        result.failed.some((f) => f.id === r.id),
                ),
            );
            selection.clear();
            refreshTrashCount();
            notify.success(
                t(
                    "ui.bulk_delete.toast_trashed",
                    "{count} in den Papierkorb verschoben",
                ).replace("{count}", String(result.deleted_count)),
            );
        } catch (err) {
            notify.error(
                t(
                    "ui.bulk_delete.toast_failed",
                    "Bulk-Löschen fehlgeschlagen",
                ),
                err,
            );
        }
    };

    const handleBulkDeletePermanentRequest = () => {
        const ordered = rows
            .map((r) => r.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2) return;
        setBulkDeleteDialog({ids: ordered, count: ordered.length});
    };

    const handleBulkDeletePermanentConfirmed = async () => {
        if (!bulkDeleteDialog) return;
        const {ids} = bulkDeleteDialog;
        setBulkDeleteDialog(null);
        try {
            const result = await getStorage().comments.bulkDelete(ids, true);
            setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
            selection.clear();
            refreshTrashCount();
            notify.success(
                t(
                    "ui.bulk_delete.toast_deleted_permanent",
                    "{count} endgültig gelöscht",
                ).replace("{count}", String(result.deleted_count)),
            );
        } catch (err) {
            notify.error(
                t(
                    "ui.bulk_delete.toast_failed",
                    "Bulk-Löschen fehlgeschlagen",
                ),
                err,
            );
        }
    };

    // --- Bug 10: trash-view row actions ---

    const handleRestore = async (row: ArticleComment) => {
        setPendingRestore(row.id);
        try {
            await getStorage().comments.restore(row.id);
            // Optimistically drop from the trash list; the row is
            // now alive in the active list.
            setRows((prev) => prev.filter((c) => c.id !== row.id));
            selection.remove(row.id);
            refreshTrashCount();
            notify.success(
                t("ui.comments.admin.restore_success", "Kommentar wiederhergestellt"),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.comments.admin.restore_error",
                          "Wiederherstellen fehlgeschlagen",
                      );
            notify.error(message, err);
        } finally {
            setPendingRestore(null);
        }
    };

    const handlePermanentDelete = async (row: ArticleComment) => {
        const preview =
            row.body_text.length > 80
                ? row.body_text.slice(0, 80) + "..."
                : row.body_text;
        const ok = await dialog.confirm(
            t("ui.comments.admin.permanent_delete_title", "Endgültig löschen?"),
            t(
                "ui.comments.admin.permanent_delete_message",
                'Der Kommentar wird unwiderruflich entfernt. Body preview: "{preview}"',
            ).replace("{preview}", preview),
            "danger",
        );
        if (!ok) return;
        setPendingPermanent(row.id);
        try {
            await getStorage().comments.permanentDelete(row.id);
            setRows((prev) => prev.filter((c) => c.id !== row.id));
            selection.remove(row.id);
            refreshTrashCount();
            notify.success(
                t(
                    "ui.comments.admin.permanent_delete_success",
                    "Kommentar endgültig gelöscht",
                ),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.comments.admin.permanent_delete_error",
                          "Endgültiges Löschen fehlgeschlagen",
                      );
            notify.error(message, err);
        } finally {
            setPendingPermanent(null);
        }
    };

    const handleBulkRestore = async () => {
        const ordered = rows
            .map((r) => r.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        try {
            const result = await getStorage().comments.bulkRestore(ordered);
            setRows((prev) =>
                prev.filter(
                    (r) =>
                        !ordered.includes(r.id) ||
                        result.failed.some((f) => f.id === r.id),
                ),
            );
            selection.clear();
            refreshTrashCount();
            notify.success(
                t(
                    "ui.comments.admin.bulk_restore_success",
                    "{count} Kommentare wiederhergestellt",
                ).replace("{count}", String(result.restored_count)),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.comments.admin.bulk_restore_error",
                          "Bulk-Wiederherstellung fehlgeschlagen",
                      );
            notify.error(message, err);
        }
    };

    // Bulk-permanent inside trash view reuses the existing
    // ``bulkDelete`` endpoint with ``permanent=true`` — the backend
    // hard-deletes already-trashed rows cleanly. The type-to-confirm
    // dialog from the active-view path is wired against
    // ``bulkDeleteDialog`` so we re-use that same state. The handler
    // that runs on confirm (``handleBulkDeletePermanentConfirmed``)
    // already calls the right endpoint shape.
    const handleBulkPermanentInTrashRequest = () => {
        const ordered = rows
            .map((r) => r.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        setBulkDeleteDialog({ids: ordered, count: ordered.length});
    };

    const handleEmptyTrash = async () => {
        if (trashCount === 0) return;
        const ok = await dialog.confirm(
            t("ui.comments.admin.empty_trash_title", "Papierkorb leeren"),
            t(
                "ui.comments.admin.empty_trash_message",
                "Alle {count} Kommentare im Papierkorb werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
            ).replace("{count}", String(trashCount)),
            "danger",
        );
        if (!ok) return;
        setEmptyingTrash(true);
        try {
            await getStorage().comments.emptyTrash();
            setRows([]);
            setTrashCount(0);
            selection.clear();
            notify.success(
                t(
                    "ui.comments.admin.empty_trash_success",
                    "Papierkorb geleert",
                ),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.comments.admin.empty_trash_error",
                          "Papierkorb leeren fehlgeschlagen",
                      );
            notify.error(message, err);
        } finally {
            setEmptyingTrash(false);
        }
    };

    const switchViewMode = (next: ViewMode) => {
        if (next === viewMode) return;
        // Reset everything that scoped to the previous view: rows
        // (re-fetched by the effect), selection (don't leak ids
        // across views — they're in different lifecycle states),
        // and the page limit (active-view-only).
        setRows([]);
        selection.clear();
        setPageLimit(PAGE_SIZE);
        setViewMode(next);
    };

    const visibleIds = rows.map((r) => r.id);
    const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => selection.isSelected(id));

    return {
        t,
        lang,
        filters,
        rows,
        viewMode,
        trashCount,
        pendingRestore,
        pendingPermanent,
        emptyingTrash,
        loading,
        loadError,
        pendingDelete,
        pendingReclassify,
        setPageLimit,
        selection,
        bulkDeleteDialog,
        setBulkDeleteDialog,
        previewComment,
        setPreviewComment,
        updateFilter,
        showLoadMore,
        handleReclassifyAsArticle,
        handleDelete,
        handleBulkDelete,
        handleBulkDeletePermanentRequest,
        handleBulkDeletePermanentConfirmed,
        handleRestore,
        handlePermanentDelete,
        handleBulkRestore,
        handleBulkPermanentInTrashRequest,
        handleEmptyTrash,
        switchViewMode,
        visibleIds,
        allVisibleSelected,
        PAGE_SIZE,
    };
}
