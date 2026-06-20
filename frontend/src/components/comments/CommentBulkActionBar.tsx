/**
 * Sticky bulk-action bar shown above the Comments-Admin table when
 * at least 2 comments are selected. Delete-only subset of the
 * ArticleBulkActionBar shape (no format / AI / convert) — comments
 * are an admin surface where the only bulk operation that makes
 * sense today is delete. Future bulk operations (bulk-reclassify
 * etc.) would extend the dropdown the same way articles did.
 *
 * Pure-presentational: takes count + handlers, emits the chosen
 * action via the dropdown. Parent owns the optimistic state +
 * toast + TypeToConfirmDialog wiring for the permanent path.
 *
 * Bulk threshold matches the Articles / Books bar: count < 2
 * disables the dropdown with the same tooltip text. Single-item
 * delete falls through to the existing per-row Trash button.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {ChevronDown, Trash2} from "lucide-react";

import BulkActionBar from "../dashboard/BulkActionBar";
import styles from "./CommentBulkActionBar.module.css";

interface Props {
    count: number;
    /** Soft-delete path: stamps deleted_at on every selected row.
     *  No undo for comments (different from Articles/Books which
     *  surface a "Rückgängig" toast — comments-admin currently
     *  doesn't expose a Trash view, so undo would have no surface
     *  to land in). */
    onBulkDelete: (permanent: false) => void;
    /** Permanent-delete path: opens TypeToConfirmDialog above the
     *  parent; parent calls api.comments.bulkDelete(ids, true) on
     *  confirm. */
    onBulkDeletePermanent: () => void;
    onClear: () => void;
    t: (key: string, fallback?: string) => string;
}

export default function CommentBulkActionBar({
    count,
    onBulkDelete,
    onBulkDeletePermanent,
    onClear,
    t,
}: Props) {
    const renderCount = t(
        "ui.comments.admin.bulk.selected_count",
        "{count} ausgewählt",
    ).replace("{count}", String(count));

    return (
        <BulkActionBar
            count={count}
            countLabel={renderCount}
            ariaLabel={t(
                "ui.comments.admin.bulk.region_label",
                "Bulk-Aktionen",
            )}
            clearLabel={t(
                "ui.comments.admin.bulk.clear_button",
                "Auswahl aufheben",
            )}
            onClear={onClear}
            barTestId="comment-bulk-action-bar"
            countTestId="comment-bulk-count"
            clearTestId="comment-bulk-clear"
        >
            <div className={styles.spacer} />

            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        data-testid="comment-bulk-delete-menu"
                        disabled={count < 2}
                        title={
                            count < 2
                                ? t(
                                      "ui.bulk_delete.disabled_min_two",
                                      "Mindestens 2 Einträge auswählen",
                                  )
                                : undefined
                        }
                    >
                        <Trash2 size={14} />{" "}
                        {t("ui.bulk_delete.delete_button", "Löschen")}{" "}
                        <ChevronDown size={12} />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        className="hamburger-menu-content"
                        sideOffset={4}
                        data-testid="comment-bulk-delete-menu-content"
                    >
                        <DropdownMenu.Item
                            className="hamburger-menu-item"
                            onSelect={() => onBulkDelete(false)}
                            data-testid="comment-bulk-delete-trash"
                        >
                            {t(
                                "ui.bulk_delete.option_trash",
                                "In Papierkorb verschieben",
                            )}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            className="hamburger-menu-item"
                            style={{color: "var(--danger)"}}
                            onSelect={onBulkDeletePermanent}
                            data-testid="comment-bulk-delete-permanent"
                        >
                            {t(
                                "ui.bulk_delete.option_permanent",
                                "Endgültig löschen",
                            )}
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

        </BulkActionBar>
    );
}
