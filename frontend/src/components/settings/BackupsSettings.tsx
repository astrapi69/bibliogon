/**
 * Settings > Backups tab — workspace-wide backup utilities.
 *
 * Per BOOKDASHBOARD-CLEANUP-01 (2026-05-18), the Version-History
 * + Compare-Backups affordances move from BookDashboard into a
 * dedicated Settings tab. The Dashboard mixed workspace utilities
 * with the book list; users navigating to "manage my books"
 * shouldn't have to scroll past backup-history rows to reach the
 * action they came for.
 *
 * Industry-pattern precedent: Bear / Scrivener ship a dedicated
 * Backups tab in Preferences. Bibliogon's own ``authors_database``
 * tab is the in-repo precedent for "specialised utility tab
 * extracted from a feature area".
 *
 * Behaviour change vs the Dashboard version: history is now
 * fetched on mount (eager) rather than gated on a toggle. A user
 * on the Backups tab is explicitly there to inspect backups —
 * hiding the history behind a click would be friction. The
 * Compare-Backups dialog wiring is unchanged.
 *
 * Testid namespace: backups-* (settings root, history list,
 * history empty state, compare button, dialog).
 */

import {useEffect, useState} from "react";
import {GitCompare} from "lucide-react";
import {api} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";
import BackupCompareDialog from "../BackupCompareDialog";

interface BackupHistoryEntry {
    timestamp: string;
    action: string;
    book_count: number;
    filename: string;
}

const sectionStyle: React.CSSProperties = {
    padding: 16,
    border: "1px solid var(--border, #ddd)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2, #fafafa)",
};

export function BackupsSettings() {
    const {t} = useI18n();
    const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);
    const [showCompareDialog, setShowCompareDialog] = useState(false);

    useEffect(() => {
        api.backup
            .history(20)
            .then(setBackupHistory)
            .catch(() => {});
    }, []);

    return (
        <div
            data-testid="backups-settings"
            style={{display: "flex", flexDirection: "column", gap: 16}}
        >
            <h2 style={{margin: 0}}>
                {t("ui.settings.tab_backups", "Backups")}
            </h2>

            <div style={sectionStyle}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12}}>
                    <h3 style={{margin: 0, fontSize: "1rem"}}>
                        {t("ui.backups.compare_backups", "Backups vergleichen")}
                    </h3>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowCompareDialog(true)}
                        data-testid="backups-compare-btn"
                        style={{gap: 6}}
                        title={t(
                            "ui.backups.compare_backups_tooltip",
                            "Zwei .bgb-Dateien aus dem Dateisystem vergleichen",
                        )}
                    >
                        <GitCompare size={14}/>
                        {t("ui.backups.compare_backups", "Backups vergleichen")}
                    </button>
                </div>
                <p style={{margin: 0, color: "var(--text-muted)", fontSize: "0.875rem"}}>
                    {t(
                        "ui.backups.compare_backups_tooltip",
                        "Zwei .bgb-Dateien aus dem Dateisystem vergleichen",
                    )}
                </p>
            </div>

            <div style={sectionStyle} data-testid="backups-history-section">
                <h3 style={{margin: "0 0 12px 0", fontSize: "1rem"}}>
                    {t("ui.backups.version_history", "Versionsgeschichte")}
                    {backupHistory.length > 0 && ` (${backupHistory.length})`}
                </h3>
                {backupHistory.length === 0 ? (
                    <p
                        data-testid="backups-history-empty"
                        style={{margin: 0, color: "var(--text-muted)", fontSize: "0.875rem"}}
                    >
                        {t("ui.backups.no_history", "Noch keine Backups erstellt.")}
                    </p>
                ) : (
                    <div
                        data-testid="backups-history-list"
                        style={{display: "flex", flexDirection: "column", gap: 4}}
                    >
                        {backupHistory.map((entry, i) => (
                            <div
                                key={i}
                                data-testid={`backups-history-entry-${i}`}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "8px 12px",
                                    borderRadius: "var(--radius-sm)",
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    fontSize: "0.8125rem",
                                }}
                            >
                                <span
                                    style={{
                                        padding: "2px 6px",
                                        borderRadius: 3,
                                        fontSize: "0.6875rem",
                                        fontWeight: 600,
                                        textTransform: "uppercase",
                                        background:
                                            entry.action === "backup"
                                                ? "var(--accent-light)"
                                                : "rgba(34,197,94,0.12)",
                                        color:
                                            entry.action === "backup"
                                                ? "var(--accent)"
                                                : "#16a34a",
                                    }}
                                >
                                    {entry.action}
                                </span>
                                <span style={{color: "var(--text-secondary)"}}>
                                    {new Date(entry.timestamp).toLocaleString()}
                                </span>
                                <span>
                                    {entry.book_count}{" "}
                                    {t("ui.dashboard.book_plural", "Bücher")}
                                </span>
                                {entry.filename && (
                                    <span
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.75rem",
                                        }}
                                    >
                                        {entry.filename}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <BackupCompareDialog
                open={showCompareDialog}
                onClose={() => setShowCompareDialog(false)}
            />
        </div>
    );
}
