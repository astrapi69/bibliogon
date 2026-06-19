import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { AiProviderStatus } from "../../utils/aiProviderKeys";

export interface AiProviderKeyRow {
    id: string;
    label: string;
    model: string;
    status: AiProviderStatus;
    keyPreview: string;
    isActive: boolean;
}

/**
 * Read-only overview of the configured AI providers. Renders one row per
 * key-requiring provider so the user can see at a glance WHICH providers
 * already hold a (masked) key, which is empty, and which only works in the
 * desktop app. Editing happens in the form below the table.
 */
export function AiProviderKeysTable({
    rows,
    onEdit,
    onDelete,
}: {
    rows: AiProviderKeyRow[];
    onEdit: (providerId: string) => void;
    onDelete: (providerId: string) => void;
}) {
    const { t } = useI18n();

    const statusLabel: Record<AiProviderStatus, string> = {
        active: t("ui.settings.ai_status_active", "Aktiv"),
        empty: t("ui.settings.ai_status_empty", "Leer"),
        desktop_only: t("ui.settings.ai_status_desktop", "Nur Desktop"),
    };
    const statusClass: Record<AiProviderStatus, string> = {
        active: "text-success",
        empty: "text-muted-foreground",
        desktop_only: "text-warning",
    };

    return (
        <div className="overflow-x-auto" data-testid="ai-provider-keys-table">
            <table className="w-full border-collapse text-[0.8125rem]">
                <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">
                            {t("ui.settings.ai_col_provider", "Anbieter")}
                        </th>
                        <th className="py-2 pr-3 font-medium">
                            {t("ui.settings.ai_col_model", "Modell")}
                        </th>
                        <th className="py-2 pr-3 font-medium">
                            {t("ui.settings.ai_col_key", "Schlüssel")}
                        </th>
                        <th className="py-2 pr-3 font-medium">
                            {t("ui.settings.ai_col_status", "Status")}
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                            {t("ui.settings.ai_col_actions", "Aktionen")}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const configured = row.status !== "empty";
                        return (
                            <tr
                                key={row.id}
                                data-testid={`ai-provider-row-${row.id}`}
                                data-active={row.isActive ? "true" : "false"}
                                className={
                                    row.isActive
                                        ? "border-b border-border bg-accent"
                                        : "border-b border-border"
                                }
                            >
                                <td className="py-2 pr-3">
                                    <span className="flex items-center gap-2">
                                        <KeyRound
                                            size={14}
                                            className="text-muted-foreground"
                                            aria-hidden
                                        />
                                        <span className="font-medium text-foreground">
                                            {row.label}
                                        </span>
                                        {row.isActive && (
                                            <span
                                                data-testid={`ai-provider-active-badge-${row.id}`}
                                                className="rounded-[var(--radius-sm)] bg-primary px-1.5 py-0.5 text-[0.6875rem] text-primary-foreground"
                                            >
                                                {t("ui.settings.ai_status_active", "Aktiv")}
                                            </span>
                                        )}
                                    </span>
                                </td>
                                <td className="py-2 pr-3 text-muted-foreground">
                                    {row.model || "-"}
                                </td>
                                <td
                                    className="py-2 pr-3 font-mono text-muted-foreground"
                                    data-testid={`ai-provider-key-preview-${row.id}`}
                                >
                                    {row.keyPreview || "-"}
                                </td>
                                <td className="py-2 pr-3">
                                    <span
                                        className={statusClass[row.status]}
                                        data-testid={`ai-provider-status-${row.id}`}
                                    >
                                        {statusLabel[row.status]}
                                    </span>
                                </td>
                                <td className="py-2 pr-3">
                                    <span className="flex items-center justify-end gap-1">
                                        {configured ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => onEdit(row.id)}
                                                    title={t("ui.common.edit", "Bearbeiten")}
                                                    aria-label={`${t("ui.common.edit", "Bearbeiten")}: ${row.label}`}
                                                    data-testid={`ai-provider-edit-${row.id}`}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => onDelete(row.id)}
                                                    title={t("ui.common.delete", "Löschen")}
                                                    aria-label={`${t("ui.common.delete", "Löschen")}: ${row.label}`}
                                                    data-testid={`ai-provider-delete-${row.id}`}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => onEdit(row.id)}
                                                title={t("ui.settings.ai_add_key", "Hinzufügen")}
                                                aria-label={`${t("ui.settings.ai_add_key", "Hinzufügen")}: ${row.label}`}
                                                data-testid={`ai-provider-add-${row.id}`}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        )}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
