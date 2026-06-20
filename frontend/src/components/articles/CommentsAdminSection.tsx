/**
 * MEDIUM-COMMENTS-UI-01 commit 5: Settings comments-admin tab.
 *
 * Cross-article admin view for imported comments. Lists comments
 * filtered by source (``imported_from``) + orphan-status, with
 * "Load more" pagination (default page size 100, server cap 500).
 *
 * Single soft-delete per row lands in commit 6; this commit ships
 * list + filter + pagination only.
 *
 * State, data-loading, and handlers live in
 * ``comments/useCommentsAdmin``; the component renders the toggle,
 * filters, table, and toolbars from the returned bag.
 */

import {RotateCcw, Trash, Trash2} from "lucide-react";

import {RadixSelect} from "../RadixSelect";
import {formatLocaleDate} from "../../utils/format/formatDate";
import {LoadingIndicator} from "../shared/LoadingIndicator";
import CommentBulkActionBar from "../comments/CommentBulkActionBar";
import CommentPreviewModal from "../comments/CommentPreviewModal";
import {useCommentsAdmin} from "../comments/useCommentsAdmin";
import TypeToConfirmDialog from "../dialogs/TypeToConfirmDialog";

/** Single-line truncation length used on the body cell. Keeps the
 *  admin table dense; the full text lives in the preview modal that
 *  opens on row click. 120 chars matches D1 in the pre-inspection
 *  (single-line cell, max-width: 400, ellipsis is real DOM). */
const ROW_BODY_TRUNCATE_AT = 120;

function truncateBody(text: string): string {
    if (text.length <= ROW_BODY_TRUNCATE_AT) return text;
    return text.slice(0, ROW_BODY_TRUNCATE_AT).trimEnd() + "…";
}

function formatDate(iso: string | null, lang: string): string {
    return formatLocaleDate(iso, lang);
}

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
                    <RadixSelect
                        testId="comments-admin-filter-source"
                        value={filters.importedFrom}
                        onValueChange={(next) =>
                            updateFilter({importedFrom: next})
                        }
                        className="is-narrow"
                        ariaLabel={t("ui.comments.admin.filter_source", "Source:")}
                        allOption={{
                            label: t("ui.comments.admin.filter_source_any", "Any"),
                        }}
                        options={[
                            {value: "medium", label: "Medium"},
                            {value: "wordpress", label: "WordPress"},
                            {value: "hashnode", label: "Hashnode"},
                        ]}
                    />
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
