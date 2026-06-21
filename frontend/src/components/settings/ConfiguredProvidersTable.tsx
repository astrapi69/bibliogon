import { useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { ProviderKeyStatus } from "../../utils/ai/aiConfig";

export interface ProviderRow {
    id: string;
    label: string;
    model: string;
    status: ProviderKeyStatus;
    keyPreview: string;
    isActive: boolean;
    canActivate: boolean;
    /** Whether the per-row connection test can run (has a key + reachable). */
    canTest: boolean;
    /** Tooltip shown when the test is blocked despite a key (CORS / desktop-only). */
    testBlockedReason?: string;
}

/** Outcome of a per-row connection test, returned by the parent's onTest. */
export interface ProviderTestOutcome {
    ok: boolean;
    message: string;
}

type RowTestState = { status: "idle" | "testing" | "ok" | "fail"; message?: string };

/**
 * Overview of the configured AI providers. One row per key-requiring provider
 * with its model, a masked key preview, a status, a per-row connection test,
 * and edit / delete / add actions. The radio in the first column is the
 * `active_provider` pointer — selecting it switches which provider AI calls use
 * (keys are untouched).
 */
export function ConfiguredProvidersTable({
    rows,
    onActivate,
    onEdit,
    onDelete,
    onTest,
    readOnly = false,
}: {
    rows: ProviderRow[];
    onActivate: (providerId: string) => void;
    onEdit: (providerId: string) => void;
    onDelete: (providerId: string) => void;
    onTest: (providerId: string) => Promise<ProviderTestOutcome>;
    readOnly?: boolean;
}) {
    const { t } = useI18n();
    const [testState, setTestState] = useState<Record<string, RowTestState>>({});

    const runTest = async (id: string) => {
        setTestState((s) => ({ ...s, [id]: { status: "testing" } }));
        let outcome: ProviderTestOutcome;
        try {
            outcome = await onTest(id);
        } catch {
            outcome = { ok: false, message: t("ui.settings.ai_test_network", "Netzwerkfehler") };
        }
        setTestState((s) => ({
            ...s,
            [id]: { status: outcome.ok ? "ok" : "fail", message: outcome.message },
        }));
        // Revert to the normal status after 10s.
        setTimeout(() => {
            setTestState((s) => ({ ...s, [id]: { status: "idle" } }));
        }, 10000);
    };

    const statusLabel: Record<ProviderKeyStatus, string> = {
        active: t("ui.settings.ai_status_active", "Aktiv"),
        empty: t("ui.settings.ai_status_empty", "Leer"),
        desktop_only: t("ui.settings.ai_status_desktop", "Nur Desktop"),
        external: t("ui.settings.ai_status_external", "Extern verwaltet"),
    };
    const statusClass: Record<ProviderKeyStatus, string> = {
        active: "text-success",
        empty: "text-muted-foreground",
        desktop_only: "text-warning",
        external: "text-muted-foreground",
    };

    return (
        <div className="overflow-x-auto" data-testid="ai-provider-keys-table">
            <table className="w-full border-collapse text-[0.8125rem]">
                <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">
                            {t("ui.settings.ai_col_active", "Aktiv")}
                        </th>
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
                        const test = testState[row.id] ?? { status: "idle" };
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
                                    <input
                                        type="radio"
                                        name="ai-active-provider"
                                        className="size-4 cursor-pointer accent-[var(--accent)]"
                                        checked={row.isActive}
                                        disabled={readOnly || !row.canActivate}
                                        onChange={() => onActivate(row.id)}
                                        aria-label={`${t("ui.settings.ai_set_active", "Als aktiven Anbieter festlegen")}: ${row.label}`}
                                        data-testid={`ai-provider-activate-${row.id}`}
                                    />
                                </td>
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
                                    {test.status === "ok" || test.status === "fail" ? (
                                        <span
                                            className={
                                                test.status === "ok"
                                                    ? "text-success"
                                                    : "text-destructive"
                                            }
                                            data-testid={`ai-provider-test-result-${row.id}`}
                                        >
                                            {test.message}
                                        </span>
                                    ) : (
                                        <span
                                            className={statusClass[row.status]}
                                            data-testid={`ai-provider-status-${row.id}`}
                                        >
                                            {statusLabel[row.status]}
                                        </span>
                                    )}
                                </td>
                                <td className="py-2 pr-3">
                                    <span className="flex items-center justify-end gap-1">
                                        {configured ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    disabled={
                                                        readOnly ||
                                                        !row.canTest ||
                                                        test.status === "testing"
                                                    }
                                                    onClick={() => runTest(row.id)}
                                                    title={row.testBlockedReason}
                                                    data-testid={`ai-provider-test-${row.id}`}
                                                >
                                                    {test.status === "testing" ? (
                                                        <>
                                                            <Loader2
                                                                size={14}
                                                                className="animate-spin"
                                                            />
                                                            {t(
                                                                "ui.settings.ai_testing",
                                                                "Teste...",
                                                            )}
                                                        </>
                                                    ) : (
                                                        t("ui.settings.ai_test_short", "Testen")
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    disabled={readOnly}
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
                                                    disabled={readOnly}
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
                                                disabled={readOnly}
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
