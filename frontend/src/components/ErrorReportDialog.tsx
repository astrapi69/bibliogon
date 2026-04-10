import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {Bug, ChevronDown, ChevronUp, X} from "lucide-react";

import {ApiError} from "../api/client";
import {eventRecorder, formatEventLog} from "../utils/eventRecorder";
import {useI18n} from "../hooks/useI18n";

const ISSUES_URL = "https://github.com/astrapi69/bibliogon/issues/new";
const MAX_URL_LENGTH = 7500;
const APP_VERSION = "0.11.0";

interface Props {
    open: boolean;
    onClose: () => void;
    errorMessage: string;
    apiError?: ApiError;
}

/**
 * Modal that lets the user review and submit a GitHub issue with
 * optional action history. The user sees exactly what will be sent
 * before clicking the submit button.
 */
export default function ErrorReportDialog({open, onClose, errorMessage, apiError}: Props) {
    const {t} = useI18n();
    const [includeEnv, setIncludeEnv] = useState(true);
    const [includeHistory, setIncludeHistory] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const events = eventRecorder.getAll();
    const historyLog = formatEventLog(events);

    const issueBody = buildIssueBody(errorMessage, apiError, includeEnv, includeHistory ? historyLog : null);
    const issueTitle = `Bug: ${errorMessage.substring(0, 80)}`;

    const handleSubmit = () => {
        const encodedTitle = encodeURIComponent(issueTitle);
        // Truncate body if URL would be too long
        let body = issueBody;
        const maxBodyChars = MAX_URL_LENGTH - ISSUES_URL.length - encodedTitle.length - 30;
        if (body.length > maxBodyChars) {
            body = body.substring(0, maxBodyChars) + "\n\n*(Bericht gekürzt wegen URL-Längenbegrenzung)*";
        }
        const url = `${ISSUES_URL}?title=${encodedTitle}&body=${encodeURIComponent(body)}&labels=bug`;
        window.open(url, "_blank");
        onClose();
    };

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title" style={{display: "flex", alignItems: "center", gap: 8}}>
                            <Bug size={18}/> {t("ui.error_report.title", "Issue-Report erstellen")}
                        </Dialog.Title>
                    </div>

                    <p style={{fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 16px"}}>
                        {t("ui.error_report.intro", "Bibliogon hat einen Fehler erkannt und kann einen Bug-Report für den Entwickler vorbereiten.")}
                    </p>

                    {/* Checkboxes */}
                    <div style={{display: "flex", flexDirection: "column", gap: 8, marginBottom: 16}}>
                        <label style={{display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", cursor: "pointer"}}>
                            <input type="checkbox" checked disabled/>
                            {t("ui.error_report.include_error", "Fehlermeldung und Stacktrace")}
                        </label>
                        <label style={{display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", cursor: "pointer"}}>
                            <input type="checkbox" checked={includeEnv} onChange={(e) => setIncludeEnv(e.target.checked)}/>
                            {t("ui.error_report.include_env", "Umgebungsinformationen (Version, Browser, OS)")}
                        </label>
                        <label style={{display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", cursor: "pointer"}}>
                            <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)}/>
                            {t("ui.error_report.include_history", "Aktions-Historie")} ({events.length} Events)
                            {events.length > 0 && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setShowHistory(!showHistory)}
                                    style={{marginLeft: 4, padding: "1px 6px", fontSize: "0.75rem"}}
                                >
                                    {showHistory ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                    {" "}{t("ui.error_report.view", "Ansehen")}
                                </button>
                            )}
                        </label>
                    </div>

                    {/* Action history preview */}
                    {showHistory && events.length > 0 && (
                        <div style={{
                            maxHeight: 200, overflowY: "auto",
                            padding: 10, marginBottom: 12,
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6875rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                        }}>
                            {historyLog}
                        </div>
                    )}

                    {/* Privacy note */}
                    <p style={{fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 16px"}}>
                        {t("ui.error_report.privacy", "Keine Buch-Inhalte, keine Passwörter, keine Lizenz-Keys werden jemals gesendet.")}
                    </p>

                    {/* Full preview toggle */}
                    {showPreview && (
                        <div style={{
                            maxHeight: 300, overflowY: "auto",
                            padding: 10, marginBottom: 12,
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6875rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                        }}>
                            {issueBody}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="dialog-footer">
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowPreview(!showPreview)}
                        >
                            {showPreview
                                ? t("ui.error_report.hide_preview", "Vorschau ausblenden")
                                : t("ui.error_report.show_preview", "Vorschau anzeigen")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleSubmit}>
                            <Bug size={14}/> {t("ui.error_report.submit", "Issue auf GitHub erstellen")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// ---------------------------------------------------------------------------
// Issue body builder
// ---------------------------------------------------------------------------

function buildIssueBody(
    message: string,
    apiError: ApiError | undefined,
    includeEnv: boolean,
    historyLog: string | null,
): string {
    const sections: string[] = [];

    // Error
    sections.push(`## Fehlerbeschreibung\n${message}`);

    // Technical details
    if (apiError) {
        const tech = [
            `- HTTP Status: ${apiError.status}`,
            `- Endpoint: ${apiError.method} ${apiError.endpoint}`,
            `- Zeitpunkt: ${apiError.timestamp}`,
        ];
        if (apiError.stacktrace) {
            tech.push(`\n\`\`\`\n${apiError.stacktrace.substring(0, 800)}\n\`\`\``);
        }
        sections.push(`## Technische Details\n${tech.join("\n")}`);
    }

    // Environment
    if (includeEnv) {
        const env = [
            `- Bibliogon Version: ${APP_VERSION}`,
            `- Browser: ${navigator.userAgent.split(" ").slice(-3).join(" ")}`,
            `- OS: ${navigator.platform}`,
            `- Route: ${window.location.pathname}`,
        ];
        sections.push(`## Umgebung\n${env.join("\n")}`);
    }

    // Action history
    if (historyLog) {
        sections.push(`## Aktions-Historie\n\`\`\`\n${historyLog}\n\`\`\``);
    }

    // Reproduction steps
    sections.push("## Reproduktion\n1.\n2.\n3.");

    sections.push("---\n*Dieser Report wurde automatisch von Bibliogon erstellt. Keine sensiblen Daten wurden inkludiert.*");

    return sections.join("\n\n");
}
