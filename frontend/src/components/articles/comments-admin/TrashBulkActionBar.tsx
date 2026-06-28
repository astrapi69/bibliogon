/**
 * Trash-view bulk action bar (Restore + Permanent + Clear) for the
 * comments-admin section. Distinct from the active-view
 * CommentBulkActionBar because the affordances differ. Extracted from
 * CommentsAdminSection.tsx (#683); data-testids unchanged.
 */

import {RotateCcw, Trash2} from "lucide-react";
import type {T} from "./types";

export function TrashBulkActionBar({
    t,
    count,
    onBulkRestore,
    onBulkPermanent,
    onClear,
}: {
    t: T;
    count: number;
    onBulkRestore: () => void;
    onBulkPermanent: () => void;
    onClear: () => void;
}) {
    return (
        <div
            role="region"
            aria-label={t("ui.comments.admin.bulk.region_label", "Bulk-Aktionen")}
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
                ).replace("{count}", String(count))}
            </span>
            <button
                type="button"
                className="btn btn-secondary"
                data-testid="comments-trash-bulk-restore"
                onClick={onBulkRestore}
                style={{display: "flex", alignItems: "center", gap: 6}}
            >
                <RotateCcw size={14} />
                {t("ui.comments.admin.bulk_restore_button", "Wiederherstellen")}
            </button>
            <button
                type="button"
                className="btn btn-secondary"
                data-testid="comments-trash-bulk-permanent"
                onClick={onBulkPermanent}
                style={{
                    color: "var(--danger, #b91c1c)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                <Trash2 size={14} />
                {t("ui.comments.admin.bulk_permanent_button", "Endgültig löschen")}
            </button>
            <button
                type="button"
                className="btn btn-ghost"
                data-testid="comments-trash-bulk-clear"
                onClick={onClear}
            >
                {t("ui.comments.admin.bulk.clear_button", "Auswahl aufheben")}
            </button>
        </div>
    );
}
