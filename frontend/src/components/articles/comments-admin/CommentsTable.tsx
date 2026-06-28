/**
 * The comments-admin table (header + rows) for both the active and the
 * trash view. Extracted from CommentsAdminSection.tsx (#683); every
 * data-testid + the active/trash conditional rendering is unchanged.
 */

import {RotateCcw, Trash2} from "lucide-react";
import {truncateBody, formatDate} from "./helpers";
import type {
    CommentAdminRow,
    CommentSelection,
    CommentViewMode,
    T,
} from "./types";

export function CommentsTable({
    t,
    lang,
    rows,
    viewMode,
    selection,
    visibleIds,
    allVisibleSelected,
    pendingDelete,
    pendingRestore,
    pendingPermanent,
    onPreview,
    onDelete,
    onRestore,
    onPermanentDelete,
}: {
    t: T;
    lang: string;
    rows: CommentAdminRow[];
    viewMode: CommentViewMode;
    selection: CommentSelection;
    visibleIds: string[];
    allVisibleSelected: boolean;
    pendingDelete: string | null;
    pendingRestore: string | null;
    pendingPermanent: string | null;
    onPreview: (row: CommentAdminRow) => void;
    onDelete: (row: CommentAdminRow) => void;
    onRestore: (row: CommentAdminRow) => void;
    onPermanentDelete: (row: CommentAdminRow) => void;
}) {
    const headerCellStyle: React.CSSProperties = {
        textAlign: "left",
        borderBottom: "1px solid var(--border, #e5e7eb)",
        padding: "8px 6px",
    };
    return (
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
                    <th style={{...headerCellStyle, width: 32}}>
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
                    <th style={headerCellStyle}>
                        {t("ui.comments.admin.col_author", "Author")}
                    </th>
                    <th style={headerCellStyle}>
                        {t("ui.comments.admin.col_body", "Body")}
                    </th>
                    <th style={headerCellStyle}>
                        {t("ui.comments.admin.col_source", "Source")}
                    </th>
                    <th style={headerCellStyle}>
                        {t("ui.comments.admin.col_status", "Status")}
                    </th>
                    <th style={headerCellStyle}>
                        {t("ui.comments.admin.col_date", "Imported")}
                    </th>
                    <th
                        style={{
                            ...headerCellStyle,
                            textAlign: "right",
                            width: 110,
                        }}
                    >
                        <span className="sr-only">
                            {t("ui.comments.admin.col_actions", "Actions")}
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
                            borderBottom: "1px solid var(--border, #f3f4f6)",
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
                            if (viewMode === "active") onPreview(row);
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
                                t("ui.comments.admin.no_author", "Unknown")}
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
                                    style={{color: "var(--warning, #b45309)"}}
                                >
                                    {t("ui.comments.admin.orphan", "Orphan")}
                                </span>
                            ) : (
                                t("ui.comments.admin.linked", "Linked")
                            )}
                        </td>
                        <td style={{padding: "6px"}}>
                            {formatDate(row.imported_at, lang)}
                        </td>
                        <td
                            style={{
                                padding: "6px",
                                textAlign: "right",
                                whiteSpace: "nowrap",
                            }}
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
                                    onClick={() => onDelete(row)}
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
                                        onClick={() => onRestore(row)}
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
                                        onClick={() => onPermanentDelete(row)}
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
    );
}
