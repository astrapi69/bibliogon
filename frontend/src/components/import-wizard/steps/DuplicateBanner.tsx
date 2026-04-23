import { AlertTriangle } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import type { DuplicateInfo } from "../../../api/import";
import { useDialog } from "../../AppDialog";

export function DuplicateBanner({
    duplicate,
    currentAction,
    onActionChange,
}: {
    duplicate: DuplicateInfo;
    currentAction: "create" | "overwrite";
    onActionChange: (action: "create" | "overwrite" | "cancel") => void;
}) {
    const { t } = useI18n();
    const dialog = useDialog();

    if (!duplicate.found) return null;

    const existingTitle =
        duplicate.existing_book_title ??
        t("ui.import_wizard.untitled_book", "Untitled");
    const importedAt = duplicate.imported_at
        ? new Date(duplicate.imported_at).toLocaleString()
        : "-";

    const handleOverwriteClick = async () => {
        const ok = await dialog.confirm(
            t("ui.import_wizard.duplicate_overwrite_title", "Overwrite existing"),
            t(
                "ui.import_wizard.duplicate_overwrite_confirm",
                "This will replace all chapters and assets of '{title}'. The existing book's edit history will be lost. Continue?",
            ).replace("{title}", existingTitle),
            "danger",
        );
        if (ok) onActionChange("overwrite");
    };

    return (
        <div
            data-testid="duplicate-banner"
            role="alert"
            style={{
                border: "1px solid var(--accent)",
                background: "var(--accent-light)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 16,
            }}
        >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <AlertTriangle size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: "0.9375rem" }}>
                        {t(
                            "ui.import_wizard.duplicate_banner_title",
                            "Book already imported",
                        )}
                    </strong>
                    <p style={{ margin: "4px 0 8px 0", fontSize: "0.8125rem" }}>
                        {t(
                            "ui.import_wizard.duplicate_banner_existing",
                            "Existing: {title} (imported {date})",
                        )
                            .replace("{title}", existingTitle)
                            .replace("{date}", importedAt)}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            data-testid="duplicate-cancel"
                            onClick={() => onActionChange("cancel")}
                        >
                            {t("ui.import_wizard.duplicate_action_cancel", "Cancel")}
                        </button>
                        <button
                            className="btn btn-danger btn-sm"
                            data-testid="duplicate-overwrite"
                            aria-pressed={currentAction === "overwrite"}
                            onClick={handleOverwriteClick}
                            style={
                                currentAction === "overwrite"
                                    ? { outline: "2px solid var(--accent)", outlineOffset: 2 }
                                    : undefined
                            }
                        >
                            {t(
                                "ui.import_wizard.duplicate_action_overwrite",
                                "Overwrite existing",
                            )}
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            data-testid="duplicate-copy"
                            aria-pressed={currentAction === "create"}
                            onClick={() => onActionChange("create")}
                            style={
                                currentAction === "create"
                                    ? { outline: "2px solid var(--accent)", outlineOffset: 2 }
                                    : undefined
                            }
                        >
                            {t(
                                "ui.import_wizard.duplicate_action_copy",
                                "Create as new copy",
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
