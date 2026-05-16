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
import {Trash2} from "lucide-react";

import {api, ApiError, type ArticleComment} from "../api/client";
import {useDialog} from "./AppDialog";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
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
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(
            lang === "de" ? "de-DE" : "en-US",
            {day: "numeric", month: "short", year: "numeric"},
        );
    } catch {
        return iso;
    }
}

export default function CommentsAdminSection() {
    const {t, lang} = useI18n();
    const dialog = useDialog();
    const navigate = useNavigate();
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [rows, setRows] = useState<ArticleComment[]>([]);
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
        api.comments
            .list({
                importedFrom: filters.importedFrom || undefined,
                orphansOnly: filters.orphansOnly,
                limit: pageLimit,
            })
            .then((data) => {
                if (!cancelled) {
                    setRows(data);
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
    }, [filters, pageLimit]);

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
                    data-testid="comments-admin-empty"
                    style={{
                        marginTop: 16,
                        color: "var(--text-muted, #6b7280)",
                        fontSize: "0.875rem",
                        fontStyle: "italic",
                    }}
                >
                    {t(
                        "ui.comments.admin.empty",
                        "No comments match the current filters.",
                    )}
                </p>
            )}

            {selection.count > 0 && (
                <CommentBulkActionBar
                    count={selection.count}
                    onBulkDelete={() => void handleBulkDelete(false)}
                    onBulkDeletePermanent={handleBulkDeletePermanentRequest}
                    onClear={selection.clear}
                    t={t}
                />
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
                                    data-testid="comments-admin-select-all"
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
                                data-testid={`comments-admin-row-${row.id}`}
                                style={{
                                    borderBottom:
                                        "1px solid var(--border, #f3f4f6)",
                                    cursor: "pointer",
                                }}
                                onClick={() => setPreviewComment(row)}
                            >
                                <td
                                    style={{padding: "6px", width: 32}}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input
                                        type="checkbox"
                                        data-testid={`comments-admin-select-${row.id}`}
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
                                    {/* Bug 4c: Reclassify lives ONLY in the
                                        preview modal. The row keeps the
                                        single-item delete button — bulk
                                        delete is the menu in the bar; the
                                        per-row Trash is the quick path for
                                        a single removal without selecting. */}
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
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {showLoadMore && (
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
