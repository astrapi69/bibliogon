/**
 * Destructive-confirm dialog with a numeric type-to-confirm gate.
 *
 * The user must type the count of items being deleted (e.g. "47" if
 * they're permanently deleting 47 articles) before the confirm button
 * enables. Numeric strategy chosen over a localized confirm-word so:
 *
 *   - Translation maintenance is zero
 *   - Works on every keyboard layout (no Greek / Japanese typing
 *     friction)
 *   - Forces the user to LOOK at the count, which combined with the
 *     filter-description text gives a real sanity check
 *
 * For count == 1 the bulk-delete button stays hidden and the caller
 * uses the existing useDialog().confirm("danger") path; this dialog
 * is for true bulk operations only (count >= 2).
 *
 * Reuses the global ``dialog-*`` classes (overlay, content, header,
 * title, footer) for visual parity with AppDialog.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import styles from "./TypeToConfirmDialog.module.css";

interface TypeToConfirmDialogProps {
    open: boolean;
    /** Count of items being deleted. Drives both the prompt text and
     *  the required-typed value. */
    count: number;
    /** Optional human-readable filter description rendered above the
     *  type-input ("Status=Draft, Language=DE"). Omit when no
     *  filters are active. */
    filterDescription?: string | null;
    /** Singular / plural noun for the items, already localized:
     *  e.g. "Artikel" / "Bücher". Falls back to a generic noun when
     *  omitted. */
    itemNoun?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function TypeToConfirmDialog({
    open,
    count,
    filterDescription,
    itemNoun,
    onConfirm,
    onCancel,
}: TypeToConfirmDialogProps) {
    const { t } = useI18n();
    const [typed, setTyped] = useState("");
    const inputId = useId();
    const errorId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset typed value whenever the dialog opens (so a previous
    // cancel doesn't leak the last input into the next invocation).
    useEffect(() => {
        if (open) {
            setTyped("");
            // Autofocus after Radix mounts the content. requestAnimationFrame
            // is the standard hop to wait for the mount commit.
            const id = window.requestAnimationFrame(() => inputRef.current?.focus());
            return () => window.cancelAnimationFrame(id);
        }
    }, [open]);

    const expected = String(count);
    const matches = typed === expected;
    const showError = typed.length > 0 && !matches;
    const noun =
        itemNoun ??
        t("ui.bulk_delete.generic_items", "Einträge");

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && matches) {
            e.preventDefault();
            onConfirm();
        }
    };

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(o) => {
                if (!o) onCancel();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="dialog-content"
                    onEscapeKeyDown={onCancel}
                    data-testid="type-to-confirm-dialog"
                >
                    <div className="dialog-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <AlertTriangle size={20} color="var(--danger)" />
                            <Dialog.Title className="dialog-title">
                                {t(
                                    "ui.bulk_delete.confirm_permanent_title",
                                    "Endgültig löschen",
                                )}
                            </Dialog.Title>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                className="btn-icon"
                                onClick={onCancel}
                                aria-label={t("ui.common.close", "Schließen")}
                            >
                                <X size={16} />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div className={styles.body}>
                        <p className={styles.summary}>
                            {t(
                                "ui.bulk_delete.confirm_permanent_summary",
                                "Sie sind dabei {count} {noun} endgültig zu löschen. Diese Aktion kann NICHT rückgängig gemacht werden.",
                            )
                                .replace("{count}", String(count))
                                .replace("{noun}", noun)}
                        </p>

                        {filterDescription && (
                            <p className={styles.filterClause}>
                                {t("ui.bulk_delete.filter_clause_label", "Aktive Filter")}:{" "}
                                <span className={styles.filterValue}>{filterDescription}</span>
                            </p>
                        )}

                        <label htmlFor={inputId} className={styles.inputLabel}>
                            {t(
                                "ui.bulk_delete.type_count_prompt",
                                "Zur Bestätigung die Anzahl ({count}) eingeben:",
                            ).replace("{count}", String(count))}
                        </label>
                        <input
                            id={inputId}
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            pattern="\d*"
                            className={`input ${showError ? styles.inputError : ""}`}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            onKeyDown={handleKeyDown}
                            aria-required="true"
                            aria-invalid={showError}
                            aria-describedby={showError ? errorId : undefined}
                            data-testid="type-to-confirm-input"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {showError && (
                            <p
                                id={errorId}
                                role="status"
                                aria-live="polite"
                                className={styles.errorMessage}
                                data-testid="type-to-confirm-error"
                            >
                                {t(
                                    "ui.bulk_delete.type_count_mismatch",
                                    "Bitte genau {count} eingeben.",
                                ).replace("{count}", String(count))}
                            </p>
                        )}
                    </div>

                    <div className="dialog-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onCancel}
                            data-testid="type-to-confirm-cancel"
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            disabled={!matches}
                            onClick={onConfirm}
                            data-testid="type-to-confirm-confirm"
                        >
                            {t("ui.bulk_delete.confirm_permanent_button", "Endgültig löschen")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
