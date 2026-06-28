/**
 * Active / Trash view-mode toggle (Bug 10) for the comments-admin
 * section, with the trash badge + the "empty trash" button. Extracted
 * from CommentsAdminSection.tsx (#683); data-testids unchanged.
 */

import {Trash} from "lucide-react";
import type {CommentViewMode, T} from "./types";

export function CommentsViewToggle({
    t,
    viewMode,
    trashCount,
    hasRows,
    emptyingTrash,
    onSwitchView,
    onEmptyTrash,
}: {
    t: T;
    viewMode: CommentViewMode;
    trashCount: number;
    hasRows: boolean;
    emptyingTrash: boolean;
    onSwitchView: (mode: CommentViewMode) => void;
    onEmptyTrash: () => void;
}) {
    return (
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
                onClick={() => onSwitchView("active")}
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
                onClick={() => onSwitchView("trash")}
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
            {viewMode === "trash" && hasRows && (
                <button
                    type="button"
                    className="btn btn-secondary"
                    data-testid="comments-trash-empty"
                    onClick={onEmptyTrash}
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
    );
}
