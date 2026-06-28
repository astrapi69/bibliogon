/**
 * MEDIUM-COMMENTS-UI-01 commit 5: Settings comments-admin tab.
 *
 * Cross-article admin view for imported comments. Lists comments
 * filtered by source (``imported_from``) + orphan-status, with
 * "Load more" pagination (default page size 100, server cap 500).
 *
 * State, data-loading, and handlers live in
 * ``comments/useCommentsAdmin``. Issue #683 extracts the view toggle,
 * filters, trash bulk bar, and table into the comments-admin/
 * subdirectory; this file is the orchestrator that wires the returned
 * bag to those sub-components.
 */

import {LoadingIndicator} from "../shared/LoadingIndicator";
import CommentBulkActionBar from "../comments/CommentBulkActionBar";
import CommentPreviewModal from "../comments/CommentPreviewModal";
import {useCommentsAdmin} from "../comments/useCommentsAdmin";
import TypeToConfirmDialog from "../dialogs/TypeToConfirmDialog";
import {CommentsViewToggle} from "./comments-admin/CommentsViewToggle";
import {CommentsFilters} from "./comments-admin/CommentsFilters";
import {TrashBulkActionBar} from "./comments-admin/TrashBulkActionBar";
import {CommentsTable} from "./comments-admin/CommentsTable";

export default function CommentsAdminSection() {
    const {
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
    } = useCommentsAdmin();

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

            {/* Bug 10: view-mode toggle. Mirrors AD / BD trash-toggle. */}
            <CommentsViewToggle
                t={t}
                viewMode={viewMode}
                trashCount={trashCount}
                hasRows={rows.length > 0}
                emptyingTrash={emptyingTrash}
                onSwitchView={switchViewMode}
                onEmptyTrash={() => void handleEmptyTrash()}
            />

            {viewMode === "active" && (
                <CommentsFilters
                    t={t}
                    filters={filters}
                    onUpdateFilter={updateFilter}
                />
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

            {/* Trash-view bulk bar: Restore + Permanent. */}
            {viewMode === "trash" && selection.count > 0 && (
                <TrashBulkActionBar
                    t={t}
                    count={selection.count}
                    onBulkRestore={() => void handleBulkRestore()}
                    onBulkPermanent={handleBulkPermanentInTrashRequest}
                    onClear={selection.clear}
                />
            )}

            {rows.length > 0 && (
                <CommentsTable
                    t={t}
                    lang={lang}
                    rows={rows}
                    viewMode={viewMode}
                    selection={selection}
                    visibleIds={visibleIds}
                    allVisibleSelected={allVisibleSelected}
                    pendingDelete={pendingDelete}
                    pendingRestore={pendingRestore}
                    pendingPermanent={pendingPermanent}
                    onPreview={setPreviewComment}
                    onDelete={(row) => void handleDelete(row)}
                    onRestore={(row) => void handleRestore(row)}
                    onPermanentDelete={(row) => void handlePermanentDelete(row)}
                />
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
                itemNoun={t("ui.comments.admin.bulk.item_noun", "Kommentare")}
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
