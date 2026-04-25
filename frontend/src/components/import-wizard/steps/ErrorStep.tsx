import { useEffect, useRef, useState } from "react";
import { Bug, Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import { copyToClipboard } from "../../../utils/clipboard";
import {
    buildGithubIssueUrl,
    formatDetails,
    type WizardError,
} from "../errorContext";

/**
 * Wizard's terminal error step.
 *
 * Renders a human-readable message plus an opt-in disclosure with
 * the full clipboard-ready details payload. Surface acts as the
 * canonical bug-report channel for the import flow:
 *
 * - **Copy details** writes the formatted markdown bundle (cause,
 *   stack, status, endpoint, version, browser, route) to the
 *   clipboard so the user can paste anywhere.
 * - **Report Issue** opens a pre-filled GitHub Issues URL in a new
 *   tab.
 * - **Retry** is rendered only when the upstream signalled that the
 *   failure is recoverable (network blip, etc.).
 */
export function ErrorStep({
    error,
    onRetry,
    onClose,
}: {
    error: WizardError;
    onRetry?: () => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">(
        "idle",
    );
    const copyTimer = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (copyTimer.current !== null) {
                window.clearTimeout(copyTimer.current);
            }
        },
        [],
    );

    const handleCopy = async () => {
        const ok = await copyToClipboard(formatDetails(error));
        setCopyState(ok ? "ok" : "fail");
        if (copyTimer.current !== null) {
            window.clearTimeout(copyTimer.current);
        }
        copyTimer.current = window.setTimeout(() => {
            setCopyState("idle");
            copyTimer.current = null;
        }, 1500);
    };

    const handleReport = () => {
        const url = buildGithubIssueUrl(error);
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <div data-testid="error-step" role="alert">
            <h3 style={{ margin: 0, color: "var(--danger)" }}>
                {t("ui.import_wizard.error_title", "Import failed")}
            </h3>
            <p
                data-testid="error-step-context"
                style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                }}
            >
                {t(
                    "ui.import_wizard.error_step_failed_at",
                    "Failed at: {step}",
                ).replace("{step}", error.context)}
            </p>
            <p
                data-testid="error-step-message"
                style={{
                    whiteSpace: "pre-wrap",
                    margin: "10px 0",
                }}
            >
                {error.message}
            </p>
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                data-testid="error-step-toggle-details"
                aria-expanded={expanded}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    fontSize: "0.75rem",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg-card)",
                    cursor: "pointer",
                }}
            >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded
                    ? t(
                          "ui.import_wizard.error_step_hide_details",
                          "Details ausblenden",
                      )
                    : t(
                          "ui.import_wizard.error_step_show_details",
                          "Details anzeigen",
                      )}
            </button>
            {expanded && (
                <pre
                    data-testid="error-step-details"
                    style={{
                        marginTop: 8,
                        padding: 10,
                        maxHeight: 300,
                        overflowY: "auto",
                        background: "var(--bg-secondary, var(--bg-card))",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.6875rem",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                    }}
                >
                    {formatDetails(error)}
                </pre>
            )}
            <div
                data-testid="error-step-footer"
                style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 16,
                    paddingTop: 12,
                    paddingBottom: 12,
                    flexWrap: "wrap",
                    background: "var(--bg-primary)",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                    borderTop: "1px solid var(--border)",
                }}
            >
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="error-step-copy-details"
                    onClick={handleCopy}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                    {copyState === "ok" ? <Check size={14} /> : <Copy size={14} />}
                    {copyState === "ok"
                        ? t("ui.import_wizard.error_step_copy_success", "Kopiert!")
                        : copyState === "fail"
                          ? t(
                                "ui.import_wizard.error_step_copy_failed",
                                "Kopieren fehlgeschlagen",
                            )
                          : t(
                                "ui.import_wizard.error_step_copy_details",
                                "Details kopieren",
                            )}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="error-step-report"
                    onClick={handleReport}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                    <Bug size={14} />
                    {t(
                        "ui.import_wizard.error_step_report",
                        "Issue auf GitHub melden",
                    )}
                </button>
                {error.retryable && onRetry && (
                    <button
                        className="btn btn-primary"
                        data-testid="error-retry"
                        onClick={onRetry}
                    >
                        {t("ui.import_wizard.error_retry", "Erneut versuchen")}
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    data-testid="error-close"
                    onClick={onClose}
                >
                    {t("ui.common.close", "Schliessen")}
                </button>
            </div>
        </div>
    );
}
