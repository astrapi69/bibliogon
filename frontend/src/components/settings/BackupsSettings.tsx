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

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { GitCompare, Trash2, Download, Upload } from "lucide-react";
import { api } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { FeatureNotice } from "../../features/FeatureNotice";
import { useDialog } from "../AppDialog";
import { notify } from "../../utils/notify";
import { downloadBlob } from "../../export/download";
import { backupFilename, exportFullBackup } from "../../export/backupExport";
import { bgbBackupFilename, exportBgbBackup } from "../../export/bgbExport";
import { BackupImportError } from "../../export/backupImport";
import { BgbImportError } from "../../import/bgbImport";
import { restoreBackupFile } from "../../export/restoreBackup";
import BackupCompareDialog from "../BackupCompareDialog";
import { SectionHeader } from "./SectionHeader";
import { SelectiveExportSection } from "./SelectiveExportSection";

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
    const { t } = useI18n();
    const compare = useFeature(FEATURES.BACKUP_COMPARE);
    const history = useFeature(FEATURES.BACKUP_HISTORY);
    const offline = !history.isActive;
    const dialog = useDialog();
    const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);
    const [showCompareDialog, setShowCompareDialog] = useState(false);
    const [fullBackupBusy, setFullBackupBusy] = useState(false);
    const importInputRef = useRef<HTMLInputElement | null>(null);

    const handleFullExport = async () => {
        setFullBackupBusy(true);
        try {
            const now = new Date().toISOString();
            const blob = await exportBgbBackup(now);
            downloadBlob(blob, bgbBackupFilename(now));
        } catch (err) {
            notify.error(t("ui.backups.export_full_error", "Backup-Export fehlgeschlagen"), err);
        } finally {
            setFullBackupBusy(false);
        }
    };

    const handleLegacyJsonExport = async () => {
        setFullBackupBusy(true);
        try {
            const now = new Date().toISOString();
            const blob = await exportFullBackup(now);
            downloadBlob(blob, backupFilename(now));
        } catch (err) {
            notify.error(t("ui.backups.export_full_error", "Backup-Export fehlgeschlagen"), err);
        } finally {
            setFullBackupBusy(false);
        }
    };

    const handleFullImportFile = async (file: File) => {
        setFullBackupBusy(true);
        try {
            const counts = await restoreBackupFile(file);
            notify.success(
                t(
                    "ui.backups.import_result",
                    "{books} Bücher, {chapters} Kapitel, {articles} Artikel importiert. {skipped_books} übersprungen.",
                )
                    .replace("{books}", String(counts.books))
                    .replace("{chapters}", String(counts.chapters))
                    .replace("{articles}", String(counts.articles))
                    .replace("{skipped_books}", String(counts.skippedBooks)),
            );
        } catch (err) {
            if (err instanceof BackupImportError || err instanceof BgbImportError) {
                notify.error(t("ui.backups.import_invalid", "Ungültiges Backup-Format"), err);
            } else {
                notify.error(
                    t("ui.backups.import_full_error", "Backup-Import fehlgeschlagen"),
                    err,
                );
            }
        } finally {
            setFullBackupBusy(false);
        }
    };

    const handleImportInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) await handleFullImportFile(file);
    };

    useEffect(() => {
        // Backup history is backend-only (.bgb archives + the server-side
        // history store); offline skip the fetch so dexie mode fires no /api.
        if (offline) return;
        api.backup
            .history(20)
            .then(setBackupHistory)
            .catch(() => {});
    }, [offline]);

    const handleDeleteEntry = async (entry: BackupHistoryEntry) => {
        const previous = backupHistory;
        setBackupHistory((prev) => prev.filter((e) => e.timestamp !== entry.timestamp));
        try {
            await api.backup.deleteHistoryEntry(entry.timestamp);
        } catch (err: unknown) {
            setBackupHistory(previous);
            notify.error(t("ui.backups.delete_entry_failed", "Could not delete entry"), err);
        }
    };

    const handleClearAll = async () => {
        const ok = await dialog.confirm(
            t("ui.backups.clear_all_confirm_title", "Clear all version history?"),
            t(
                "ui.backups.clear_all_confirm_body",
                "The .bgb files on disk are kept — only the log is cleared.",
            ),
        );
        if (!ok) return;
        const previous = backupHistory;
        setBackupHistory([]);
        try {
            await api.backup.clearHistory();
        } catch (err: unknown) {
            setBackupHistory(previous);
            notify.error(t("ui.backups.clear_all_failed", "Could not clear version history"), err);
        }
    };

    return (
        <div
            data-testid="backups-settings"
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
            <SectionHeader
                title={t("ui.settings.tab_backups", "Backups")}
                description={t(
                    "ui.settings.backups_description",
                    "Backup-Historie einsehen und .bgb-Dateien miteinander vergleichen.",
                )}
            />

            <div style={sectionStyle} data-testid="backups-fulldata-section">
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1rem" }}>
                    {t("ui.backups.full_backup_title", "Vollständiges Backup (.bgb)")}
                </h3>
                <p
                    style={{
                        margin: "0 0 12px 0",
                        color: "var(--text-muted)",
                        fontSize: "0.875rem",
                    }}
                >
                    {t(
                        "ui.backups.full_backup_description",
                        "Exportiert oder importiert alle Daten (Bücher, Kapitel, Artikel, Autoren, Einstellungen, Story Bible) inklusive aller Bilder als eine .bgb-Datei. Funktioniert auch offline.",
                    )}
                </p>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleFullExport}
                        disabled={fullBackupBusy}
                        data-testid="backups-export-full"
                        style={{ gap: 6 }}
                    >
                        <Download size={14} />
                        {t("ui.backups.export_full", "Backup exportieren")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => importInputRef.current?.click()}
                        disabled={fullBackupBusy}
                        data-testid="backups-import-full"
                        style={{ gap: 6 }}
                    >
                        <Upload size={14} />
                        {t("ui.backups.import_full", "Backup importieren")}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleLegacyJsonExport}
                        disabled={fullBackupBusy}
                        data-testid="backups-export-json"
                        style={{ gap: 6 }}
                        title={t(
                            "ui.backups.export_json_hint",
                            "Reines JSON ohne Bilder - nur für Daten ohne Bilder oder zum Inspizieren.",
                        )}
                    >
                        <Download size={14} />
                        {t("ui.backups.export_json", "Als JSON exportieren (ohne Bilder)")}
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".bgb,.json,application/json"
                        className="hidden"
                        onChange={handleImportInputChange}
                        data-testid="backups-import-input"
                    />
                </div>
            </div>

            <SelectiveExportSection />

            <div style={sectionStyle}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>
                        {t("ui.backups.compare_backups", "Backups vergleichen")}
                    </h3>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowCompareDialog(true)}
                        disabled={!compare.isActive}
                        data-testid="backups-compare-btn"
                        style={{ gap: 6 }}
                        title={
                            compare.isActive
                                ? t(
                                      "ui.backups.compare_backups_tooltip",
                                      "Zwei .bgb-Dateien aus dem Dateisystem vergleichen",
                                  )
                                : t(
                                      compare.reason ?? "ui.feature.requires_desktop_app",
                                      "This feature requires the Bibliogon desktop app",
                                  )
                        }
                    >
                        <GitCompare size={14} />
                        {t("ui.backups.compare_backups", "Backups vergleichen")}
                    </button>
                </div>
                {compare.isActive ? (
                    <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.875rem" }}>
                        {t(
                            "ui.backups.compare_backups_tooltip",
                            "Zwei .bgb-Dateien aus dem Dateisystem vergleichen",
                        )}
                    </p>
                ) : (
                    <FeatureNotice reason={compare.reason} testId="backups-compare-disabled" />
                )}
            </div>

            {history.isActive ? (
                <>
                    <div style={sectionStyle} data-testid="backups-history-section">
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 12,
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: "1rem" }}>
                                {t("ui.backups.version_history", "Versionsgeschichte")}
                                {backupHistory.length > 0 && ` (${backupHistory.length})`}
                            </h3>
                            {backupHistory.length > 0 && (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleClearAll}
                                    data-testid="backups-history-clear-all"
                                    style={{ gap: 6 }}
                                >
                                    <Trash2 size={14} />
                                    {t("ui.backups.clear_all", "Alle löschen")}
                                </button>
                            )}
                        </div>
                        {backupHistory.length === 0 ? (
                            <p
                                data-testid="backups-history-empty"
                                style={{
                                    margin: 0,
                                    color: "var(--text-muted)",
                                    fontSize: "0.875rem",
                                }}
                            >
                                {t("ui.backups.no_history", "Noch keine Backups erstellt.")}
                            </p>
                        ) : (
                            <div
                                data-testid="backups-history-list"
                                style={{ display: "flex", flexDirection: "column", gap: 4 }}
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
                                                        : "var(--success-light, rgba(34,197,94,0.12))",
                                                color:
                                                    entry.action === "backup"
                                                        ? "var(--accent)"
                                                        : "var(--success, #16a34a)",
                                            }}
                                        >
                                            {entry.action}
                                        </span>
                                        <span style={{ color: "var(--text-secondary)" }}>
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
                                        <button
                                            type="button"
                                            className="btn btn-icon btn-sm"
                                            onClick={() => handleDeleteEntry(entry)}
                                            data-testid={`backups-history-entry-${i}-delete`}
                                            title={t("ui.backups.delete_entry", "Eintrag löschen")}
                                            aria-label={t(
                                                "ui.backups.delete_entry",
                                                "Eintrag löschen",
                                            )}
                                            style={{ marginLeft: "auto" }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div style={sectionStyle} data-testid="backups-history-section">
                    <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem" }}>
                        {t("ui.backups.version_history", "Versionsgeschichte")}
                    </h3>
                    <FeatureNotice reason={history.reason} testId="backups-history-disabled" />
                </div>
            )}

            <BackupCompareDialog
                open={showCompareDialog}
                onClose={() => setShowCompareDialog(false)}
            />
        </div>
    );
}
