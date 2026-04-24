import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "../../../api/client";
import { executeImport } from "../../../api/import";
import type {
    DuplicateAction,
    GitAdoption,
    Overrides,
} from "../../../api/import";
import { useI18n } from "../../../hooks/useI18n";

export function ExecutingStep({
    tempRef,
    overrides,
    duplicateAction,
    existingBookId,
    gitAdoption,
    onSuccess,
    onError,
}: {
    tempRef: string;
    overrides: Overrides;
    duplicateAction: DuplicateAction;
    existingBookId: string | null;
    gitAdoption?: GitAdoption | null;
    onSuccess: (bookId: string) => void;
    onError: (message: string) => void;
}) {
    const { t } = useI18n();
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;
        executeImport(
            tempRef,
            overrides,
            duplicateAction,
            existingBookId,
            gitAdoption ?? null,
        )
            .then((response) => {
                if (response.status === "cancelled" || response.book_id === null) {
                    onError(
                        t(
                            "ui.import_wizard.error_cancelled_server_side",
                            "Import was cancelled on the server.",
                        ),
                    );
                    return;
                }
                onSuccess(response.book_id);
            })
            .catch((err: unknown) => {
                const message =
                    err instanceof ApiError
                        ? err.detail
                        : err instanceof Error
                          ? err.message
                          : String(err);
                onError(message);
            });
    }, [
        tempRef,
        overrides,
        duplicateAction,
        existingBookId,
        gitAdoption,
        onError,
        onSuccess,
        t,
    ]);

    return (
        <div
            data-testid="executing-step"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: "40px 0",
            }}
        >
            <Loader2
                size={40}
                style={{
                    color: "var(--accent)",
                    animation: "spin 1s linear infinite",
                }}
            />
            <p style={{ margin: 0, fontSize: "0.9375rem" }}>
                {t("ui.import_wizard.status_creating", "Creating book...")}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                {t(
                    "ui.import_wizard.status_creating_subtle",
                    "This may take a moment for large imports.",
                )}
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
