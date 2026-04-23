import { useI18n } from "../../../hooks/useI18n";

export function ErrorStep({
    message,
    canRetry,
    onRetry,
    onClose,
}: {
    message: string;
    canRetry: boolean;
    onRetry?: () => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    return (
        <div data-testid="error-step" role="alert">
            <h3 style={{ margin: 0, color: "var(--danger)" }}>
                {t("ui.import_wizard.error_title", "Import failed")}
            </h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
            <div style={{ display: "flex", gap: 8 }}>
                {canRetry && onRetry && (
                    <button
                        className="btn btn-primary"
                        data-testid="error-retry"
                        onClick={onRetry}
                    >
                        {t("ui.import_wizard.error_retry", "Retry")}
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    data-testid="error-close"
                    onClick={onClose}
                >
                    {t("ui.common.close", "Close")}
                </button>
            </div>
        </div>
    );
}
