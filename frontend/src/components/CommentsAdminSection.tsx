/**
 * MEDIUM-COMMENTS-UI-01 commit 5: Settings comments-admin tab.
 *
 * Cross-article admin view for imported comments. Lists comments
 * filtered by source (``imported_from``) + orphan-status, with
 * "Load more" pagination (default page size 100, server cap 500).
 *
 * Single soft-delete per row lands in commit 6; this commit ships
 * list + filter + pagination only.
 */

import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {RotateCcw, Trash, Trash2} from "lucide-react";

import {api, ApiError, type ArticleComment} from "../api/client";
import {useDialog} from "./AppDialog";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import {formatLocaleDate} from "../utils/formatDate";
import {LoadingIndicator} from "./LoadingIndicator";
import CommentBulkActionBar from "./comments/CommentBulkActionBar";
import CommentPreviewModal from "./comments/CommentPreviewModal";
import {useCommentSelection} from "./comments/useCommentSelection";
import TypeToConfirmDialog from "./dialogs/TypeToConfirmDialog";

/** Single-line truncation length used on the body cell. Keeps the
 *  admin table dense; the full text lives in the preview modal that
 *  opens on row click. 120 chars matches D1 in the pre-inspection
 *  (single-line cell, max-width: 400, ellipsis is real DOM). */
const ROW_BODY_TRUNCATE_AT = 120;

function truncateBody(text: string): string {
    if (text.length <= ROW_BODY_TRUNCATE_AT) return text;
    return text.slice(0, ROW_BODY_TRUNCATE_AT).trimEnd() + "…";
}

const PAGE_SIZE = 100;

interface FilterState {
    importedFrom: string; // "" = all sources
    orphansOnly: boolean;
}

const DEFAULT_FILTERS: FilterState = {
    importedFrom: "",
    orphansOnly: false,
};

function formatDate(iso: string | null, lang: string): string {
    return formatLocaleDate(iso, lang);
}

type ViewMode = "active" | "trash";

export default function CommentsAdminSection() {
    const {t, lang} = useI18n();
    const dialog = useDialog();
    const navigate = useNavigate();
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [rows, setRows] = useState<ArticleComment[]>([]);
    // Bug 10: view-mode toggle. ``"active"`` is the historical
    // CommentsAdmin behaviour (lists rows with ``deleted_at IS
    // NULL``); ``"trash"`` lists soft-deleted rows via
    // ``api.comments.listTrashed`` and swaps per-row Delete for
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
                ? api.comments.listTrashed()
                : api.comments.list({
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
        api.comments
            .listTrashed()
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
            const result = await api.comments.reclassifyAsArticle(row.id);
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
            await api.comments.delete(row.id);
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
            const result = await api.comments.bulkDelete(ordered, false);
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
            const result = await api.comments.bulkDelete(ids, true);
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
            await api.comments.restore(row.id);
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
            await api.comments.permanentDelete(row.id);
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
            const result = await api.comments.bulkRestore(ordered);
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
            await api.comments.emptyTrash();
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

    return (
        <section data-testid="comments-admin-section">
            <h2>{t("ui.comments.admin.heading", "Imported comments")}</h2>
            <p
                style={{
                    color: "var(--text-muted, #6b7280)",
                    fontSize: "0.875rem",
                    marginTop: 4,
                }}
            >
                {t(
                    "ui.comments.admin.description",
                    "Cross-article view of comments imported from external sources.",
                )}
            </p>

            {/* Bug 10: view-mode toggle. Mirrors AD / BD trash-toggle.
                Always shows the trash button (even when count = 0)
                so the affordance is discoverable; the badge only
                renders when there's something to see. */}
            <div
                data-testid="comments-admin-view-toggle"
                style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    alignItems: "center",
                }}
            >
                <button
                    type="button"
                    className={
                        viewMode === "active" ? "btn btn-primary" : "btn btn-secondary"
                    }
                    data-testid="comments-active-toggle"
                    onClick={() => switchViewMode("active")}
                    aria-pressed={viewMode === "active"}
                >
                    {t("ui.comments.admin.view_active", "Aktive")}
                </button>
                <button
                    type="button"
                    className={
                        viewMode === "trash" ? "btn btn-primary" : "btn btn-secondary"
                    }
                    data-testid="comments-trash-toggle"
                    onClick={() => switchViewMode("trash")}
                    aria-pressed={viewMode === "trash"}
                    style={{display: "flex", alignItems: "center", gap: 6}}
                >
                    <Trash size={14} />
                    {t("ui.comments.admin.view_trash", "Papierkorb")}
                    {trashCount > 0 && (
                        <span
                            data-testid="comments-trash-badge"
                            style={{
                                background: "var(--danger, #b91c1c)",
                                color: "#fff",
                                borderRadius: 10,
                                padding: "0 6px",
                                fontSize: "0.75rem",
                                marginLeft: 4,
                            }}
                        >
                            {trashCount}
                        </span>
                    )}
                </button>
                {viewMode === "trash" && rows.length > 0 && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid="comments-trash-empty"
                        onClick={() => void handleEmptyTrash()}
                        disabled={emptyingTrash}
                        style={{
                            marginLeft: "auto",
                            color: "var(--danger, #b91c1c)",
                        }}
                    >
                        <Trash size={14} />{" "}
                        {t(
                            "ui.comments.admin.empty_trash_button",
                            "Papierkorb leeren",
                        )}
                    </button>
                )}
            </div>

            {viewMode === "active" && (
            <div
                data-testid="comments-admin-filters"
                style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 16,
                    padding: 12,
                    background: "var(--surface-2, #f5f5f5)",
                    borderRadius: 6,
                }}
            >
                <label style={{display: "flex", alignItems: "center", gap: 6}}>
                    {t("ui.comments.admin.filter_source", "Source:")}
                    <select
                        data-testid="comments-admin-filter-source"
                        value={filters.importedFrom}
                        onChange={(e) =>
                            updateFilter({importedFrom: e.target.value})
                        }
                        style={{padding: "4px 8px"}}
                    >
                        <option value="">
                            {t("ui.comments.admin.filter_source_any", "Any")}
                        </option>
                        <option value="medium">Medium</option>
                        <option value="wordpress">WordPress</option>
                        <option value="hashnode">Hashnode</option>
                    </select>
                </label>

                <label style={{display: "flex", alignItems: "center", gap: 6}}>
                    <input
                        type="checkbox"
                        data-testid="comments-admin-filter-orphans"
                        checked={filters.orphansOnly}
                        onChange={(e) =>
                            updateFilter({orphansOnly: e.target.checked})
                        }
                    />
                    {t(
                        "ui.comments.admin.filter_orphans",
                        "Orphans only (no parent article)",
                    )}
                </label>
            </div>
            )}

            {loadError && (
                <div
                    data-testid="comments-admin-error"
                    style={{
                        marginTop: 16,
                        padding: "8px 12px",
                        background: "var(--danger-bg, #fef2f2)",
                        color: "var(--danger, #b91c1c)",
                        borderRadius: 6,
                        fontSize: "0.875rem",
                    }}
                >
                    {loadError}
                </div>
            )}

            {loading && rows.length === 0 && (
                <LoadingIndicator
                    testId="comments-admin-loading"
                    label={t("ui.comments.admin.loading", "Loading...")}
                    className="mt-1"
                />
            )}

            {!loading && rows.length === 0 && !loadError && (
                <p
                    data-testid={
                        viewMode === "trash"
                            ? "comments-trash-empty"
                            : "comments-admin-empty"
                    }
                    style={{
                        marginTop: 16,
                        color: "var(--text-muted, #6b7280)",
                        fontSize: "0.875rem",
                        fontStyle: "italic",
                    }}
                >
                    {viewMode === "trash"
                        ? t(
                              "ui.comments.admin.trash_empty",
                              "Der Papierkorb ist leer.",
                          )
                        : t(
                              "ui.comments.admin.empty",
                              "No comments match the current filters.",
                          )}
                </p>
            )}

            {/* Active-view bulk bar: Move-to-Trash + Permanent. */}
            {viewMode === "active" && selection.count > 0 && (
                <CommentBulkActionBar
                    count={selection.count}
                    onBulkDelete={() => void handleBulkDelete(false)}
                    onBulkDeletePermanent={handleBulkDeletePermanentRequest}
                    onClear={selection.clear}
                    t={t}
                />
            )}

            {/* Trash-view bulk bar: Restore + Permanent. Distinct
                from the active-view bar because the affordances are
                different — there's no "move to trash" for an already
                trashed row, and Restore is the new affordance. */}
            {viewMode === "trash" && selection.count > 0 && (
                <div
                    role="region"
                    aria-label={t(
                        "ui.comments.admin.bulk.region_label",
                        "Bulk-Aktionen",
                    )}
                    data-testid="comments-trash-bulk-action-bar"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 12,
                        padding: 10,
                        background: "var(--surface-2, #f5f5f5)",
                        borderRadius: 6,
                    }}
                >
                    <span
                        data-testid="comments-trash-bulk-count"
                        style={{flex: 1, fontWeight: 500}}
                    >
                        {t(
                            "ui.comments.admin.bulk.selected_count",
                            "{count} ausgewählt",
                        ).replace("{count}", String(selection.count))}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid="comments-trash-bulk-restore"
                        onClick={() => void handleBulkRestore()}
                        style={{display: "flex", alignItems: "center", gap: 6}}
                    >
                        <RotateCcw size={14} />
                        {t(
                            "ui.comments.admin.bulk_restore_button",
                            "Wiederherstellen",
                        )}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid="comments-trash-bulk-permanent"
                        onClick={handleBulkPermanentInTrashRequest}
                        style={{
                            color: "var(--danger, #b91c1c)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <Trash2 size={14} />
                        {t(
                            "ui.comments.admin.bulk_permanent_button",
                            "Endgültig löschen",
                        )}
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        data-testid="comments-trash-bulk-clear"
                        onClick={selection.clear}
                    >
                        {t(
                            "ui.comments.admin.bulk.clear_button",
                            "Auswahl aufheben",
                        )}
                    </button>
                </div>
            )}

            {rows.length > 0 && (
                <table
                    data-testid="comments-admin-table"
                    style={{
                        marginTop: 16,
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.875rem",
                    }}
                >
                    <thead>
                        <tr>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                    width: 32,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    data-testid={
                                        viewMode === "trash"
                                            ? "comments-trash-select-all"
                                            : "comments-admin-select-all"
                                    }
                                    aria-label={t(
                                        "ui.comments.admin.select_all_visible",
                                        "Alle sichtbaren auswählen",
                                    )}
                                    checked={allVisibleSelected}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            selection.selectAll(visibleIds);
                                        } else {
                                            selection.clear();
                                        }
                                    }}
                                />
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t(
                                    "ui.comments.admin.col_author",
                                    "Author",
                                )}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t("ui.comments.admin.col_body", "Body")}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t(
                                    "ui.comments.admin.col_source",
                                    "Source",
                                )}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t(
                                    "ui.comments.admin.col_status",
                                    "Status",
                                )}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t("ui.comments.admin.col_date", "Imported")}
                            </th>
                            <th
                                style={{
                                    textAlign: "right",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                    width: 110,
                                }}
                            >
                                <span className="sr-only">
                                    {t(
                                        "ui.comments.admin.col_actions",
                                        "Actions",
                                    )}
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                key={row.id}
                                data-testid={
                                    viewMode === "trash"
                                        ? `comments-trash-row-${row.id}`
                                        : `comments-admin-row-${row.id}`
                                }
                                style={{
                                    borderBottom:
                                        "1px solid var(--border, #f3f4f6)",
                                    cursor: viewMode === "active" ? "pointer" : "default",
                                }}
                                onClick={() => {
                                    // Preview modal is active-view-only.
                                    // Its actions (Reclassify, Delete)
                                    // assume a live row; a trash-aware
                                    // variant lands later. In trash
                                    // view the per-row title attribute
                                    // on the body cell shows the full
                                    // text on hover, which is enough.
                                    if (viewMode === "active") setPreviewComment(row);
                                }}
                            >
                                <td
                                    style={{padding: "6px", width: 32}}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input
                                        type="checkbox"
                                        data-testid={
                                            viewMode === "trash"
                                                ? `comments-trash-select-${row.id}`
                                                : `comments-admin-select-${row.id}`
                                        }
                                        aria-label={t(
                                            "ui.comments.admin.select_row",
                                            "Auswählen",
                                        )}
                                        checked={selection.isSelected(row.id)}
                                        onChange={() => selection.toggle(row.id)}
                                    />
                                </td>
                                <td style={{padding: "6px"}}>
                                    {row.author?.trim() ||
                                        t(
                                            "ui.comments.admin.no_author",
                                            "Unknown",
                                        )}
                                </td>
                                <td
                                    style={{
                                        padding: "6px",
                                        maxWidth: 400,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                    title={row.body_text}
                                    data-testid={`comments-admin-body-${row.id}`}
                                >
                                    {truncateBody(row.body_text)}
                                </td>
                                <td style={{padding: "6px"}}>{row.imported_from}</td>
                                <td style={{padding: "6px"}}>
                                    {row.responds_to_article_id === null ? (
                                        <span
                                            data-testid={`comments-admin-row-${row.id}-orphan`}
                                            style={{
                                                color: "var(--warning, #b45309)",
                                            }}
                                        >
                                            {t(
                                                "ui.comments.admin.orphan",
                                                "Orphan",
                                            )}
                                        </span>
                                    ) : (
                                        t("ui.comments.admin.linked", "Linked")
                                    )}
                                </td>
                                <td style={{padding: "6px"}}>
                                    {formatDate(row.imported_at, lang)}
                                </td>
                                <td
                                    style={{padding: "6px", textAlign: "right", whiteSpace: "nowrap"}}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {viewMode === "active" ? (
                                        /* Bug 4c: Reclassify lives ONLY in the
                                            preview modal. The row keeps the
                                            single-item delete button — bulk
                                            delete is the menu in the bar; the
                                            per-row Trash is the quick path for
                                            a single removal without selecting. */
                                        <button
                                            type="button"
                                            className="btn-icon"
                                            data-testid={`comments-admin-delete-${row.id}`}
                                            onClick={() => {
                                                void handleDelete(row);
                                            }}
                                            disabled={pendingDelete === row.id}
                                            aria-label={t(
                                                "ui.comments.admin.delete_action",
                                                "Delete comment",
                                            )}
                                            title={t(
                                                "ui.comments.admin.delete_action",
                                                "Delete comment",
                                            )}
                                            style={{color: "var(--danger, #b91c1c)"}}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    ) : (
                                        <span style={{display: "inline-flex", gap: 4}}>
                                            <button
                                                type="button"
                                                className="btn-icon"
                                                data-testid={`comments-trash-restore-${row.id}`}
                                                onClick={() => {
                                                    void handleRestore(row);
                                                }}
                                                disabled={pendingRestore === row.id}
                                                aria-label={t(
                                                    "ui.comments.admin.restore_action",
                                                    "Wiederherstellen",
                                                )}
                                                title={t(
                                                    "ui.comments.admin.restore_action",
                                                    "Wiederherstellen",
                                                )}
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-icon"
                                                data-testid={`comments-trash-permanent-${row.id}`}
                                                onClick={() => {
                                                    void handlePermanentDelete(row);
                                                }}
                                                disabled={pendingPermanent === row.id}
                                                aria-label={t(
                                                    "ui.comments.admin.permanent_delete_action",
                                                    "Endgültig löschen",
                                                )}
                                                title={t(
                                                    "ui.comments.admin.permanent_delete_action",
                                                    "Endgültig löschen",
                                                )}
                                                style={{color: "var(--danger, #b91c1c)"}}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {viewMode === "active" && showLoadMore && (
                <div style={{marginTop: 16, textAlign: "center"}}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid="comments-admin-load-more"
                        onClick={() =>
                            setPageLimit((prev) => Math.min(prev + PAGE_SIZE, 500))
                        }
                    >
                        {t("ui.comments.admin.load_more", "Load more")}
                    </button>
                </div>
            )}

            <TypeToConfirmDialog
                open={bulkDeleteDialog !== null}
                count={bulkDeleteDialog?.count ?? 0}
                itemNoun={t(
                    "ui.comments.admin.bulk.item_noun",
                    "Kommentare",
                )}
                onConfirm={() => void handleBulkDeletePermanentConfirmed()}
                onCancel={() => setBulkDeleteDialog(null)}
            />

            <CommentPreviewModal
                comment={previewComment}
                onClose={() => setPreviewComment(null)}
                onReclassify={(c) => void handleReclassifyAsArticle(c)}
                onDelete={(c) => void handleDelete(c)}
                pendingReclassify={
                    previewComment != null && pendingReclassify === previewComment.id
                }
                pendingDelete={
                    previewComment != null && pendingDelete === previewComment.id
                }
                t={t}
                lang={lang}
            />
        </section>
    );
}
