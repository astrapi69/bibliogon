/**
 * Settings > Daten — the data-management hub (#338).
 *
 * Bundles every data-management affordance in one place:
 *
 * - **Speicher-Uebersicht:** the IndexedDB usage bar
 *   (`navigator.storage.estimate()`) plus a per-category entry-count
 *   breakdown and a collapsible "show all tables" debug view. All
 *   counts come from cheap index-backed `count()` reads — no blob body
 *   is ever loaded (see {@link getStorageStats}).
 * - **Export:** full JSON backup (same `exportFullBackup` the Backups
 *   tab + Danger Zone use), the shared selective-export card, and an
 *   authors-only JSON export.
 * - **Import:** full backup import, authors import, and a pointer to
 *   the dedicated Medium-ZIP import page.
 * - **Wartung:** clear the diagnostic event log (privacy) and clear
 *   cached image bytes (space) — neither touches user text content.
 *
 * Purely client-side (feature `DATA_MANAGEMENT` is ALWAYS_ACTIVE): all
 * reads/writes go through the storage seam + Dexie, so it works
 * identically online and offline. The full-backup export/import here
 * deliberately uses its OWN `data-*` testids rather than reusing the
 * Backups tab's `backups-*` ones — the Backups tab keeps those for the
 * BACKUP-AKZEPTANZTEST release gate; this tab is a second entry point.
 *
 * Testid namespace: `data-*`.
 */

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Download,
    Upload,
    Database,
    Trash2,
    Image as ImageIcon,
    ListTree,
    FileText,
} from "lucide-react";
import { getStorage } from "../../storage";
import { useI18n } from "../../hooks/useI18n";
import { useDialog } from "../AppDialog";
import { notify } from "../../utils/notify";
import { downloadBlob, downloadText } from "../../export/download";
import { backupFilename, exportFullBackup } from "../../export/backupExport";
import { bgbBackupFilename, exportBgbBackup, type BgbProgress } from "../../export/bgbExport";
import { BackupImportError } from "../../export/backupImport";
import { BgbImportError } from "../../import/bgbImport";
import { restoreBackupFile } from "../../export/restoreBackup";
import {
    AuthorsImportError,
    authorsExportFilename,
    buildAuthorsExport,
    parseAuthorsImport,
    planAuthorsImport,
} from "./authorsImportExport";
import {
    clearEventLog,
    clearImageCache,
    formatBytes,
    getStorageStats,
    type StorageStats,
} from "../../storage/storageStats";
import { SectionHeader } from "./SectionHeader";
import { SelectiveExportSection } from "./SelectiveExportSection";
import { BgbExportProgress } from "./BgbExportProgress";

const cardClass =
    "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4";
const cardTitleClass = "mb-1 text-base font-semibold text-[var(--text)]";
const cardDescClass = "mb-3 text-sm text-[var(--text-muted)]";

/** Default labels for the storage categories. The i18n key is
 *  `ui.data.category_<key>`; the fallback is used when the catalog
 *  lacks the key (and in the fallback-passthrough test harness). */
const CATEGORY_FALLBACK: Record<string, string> = {
    books: "Bücher",
    articles: "Artikel",
    assets: "Bilder & Assets",
    writing_sessions: "Schreibverlauf",
    event_log: "Event-Log",
};

export function DataManagementSettings() {
    const { t } = useI18n();
    const dialog = useDialog();
    const navigate = useNavigate();

    const [stats, setStats] = useState<StorageStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [showTables, setShowTables] = useState(false);
    const [busy, setBusy] = useState(false);
    const [exportProgress, setExportProgress] = useState<BgbProgress | null>(null);

    const backupInputRef = useRef<HTMLInputElement | null>(null);
    const authorsInputRef = useRef<HTMLInputElement | null>(null);

    const refreshStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            setStats(await getStorageStats());
        } catch (err) {
            console.error("Failed to read storage stats:", err);
            setStats(null);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        void refreshStats();
    }, [refreshStats]);

    // --- Export ----------------------------------------------------------

    const handleFullExport = useCallback(async () => {
        setBusy(true);
        try {
            const now = new Date().toISOString();
            const blob = await exportBgbBackup(now, setExportProgress);
            downloadBlob(blob, bgbBackupFilename(now));
        } catch (err) {
            notify.error(t("ui.backups.export_full_error", "Backup-Export fehlgeschlagen"), err);
        } finally {
            setBusy(false);
            setExportProgress(null);
        }
    }, [t]);

    const handleLegacyJsonExport = useCallback(async () => {
        setBusy(true);
        try {
            const now = new Date().toISOString();
            const blob = await exportFullBackup(now);
            downloadBlob(blob, backupFilename(now));
        } catch (err) {
            notify.error(t("ui.backups.export_full_error", "Backup-Export fehlgeschlagen"), err);
        } finally {
            setBusy(false);
        }
    }, [t]);

    const handleAuthorsExport = useCallback(async () => {
        setBusy(true);
        try {
            const rows = await getStorage().authors.list({ limit: 1000 });
            const envelope = buildAuthorsExport(rows, new Date().toISOString());
            downloadText(
                JSON.stringify(envelope, null, 2),
                authorsExportFilename(envelope.exported_at),
                "application/json",
            );
        } catch (err) {
            notify.error(t("ui.authors_database.export_error", "Export fehlgeschlagen"), err);
        } finally {
            setBusy(false);
        }
    }, [t]);

    // --- Import ----------------------------------------------------------

    const handleFullImportFile = useCallback(
        async (file: File) => {
            setBusy(true);
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
                await refreshStats();
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
                setBusy(false);
            }
        },
        [refreshStats, t],
    );

    const handleAuthorsImportFile = useCallback(
        async (file: File) => {
            setBusy(true);
            try {
                const envelope = parseAuthorsImport(await file.text());
                const existing = await getStorage().authors.list({ limit: 1000 });
                const plan = planAuthorsImport(envelope.authors, existing);
                let imported = 0;
                let skipped = plan.skipped;
                for (const name of plan.toCreate) {
                    try {
                        await getStorage().authors.create({ name });
                        imported++;
                    } catch {
                        skipped++;
                    }
                }
                notify.success(
                    t(
                        "ui.authors_database.import_result",
                        "{imported} Autoren importiert, {skipped} übersprungen",
                    )
                        .replace("{imported}", String(imported))
                        .replace("{skipped}", String(skipped)),
                );
            } catch (err) {
                if (err instanceof AuthorsImportError) {
                    notify.error(
                        t("ui.authors_database.invalid_file", "Ungültiges Dateiformat"),
                        err,
                    );
                } else {
                    notify.error(
                        t("ui.authors_database.import_error", "Import fehlgeschlagen"),
                        err,
                    );
                }
            } finally {
                setBusy(false);
            }
        },
        [t],
    );

    const onBackupInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) await handleFullImportFile(file);
    };

    const onAuthorsInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) await handleAuthorsImportFile(file);
    };

    // --- Maintenance -----------------------------------------------------

    const handleClearEventLog = useCallback(async () => {
        const ok = await dialog.confirm(
            t("ui.data.clear_event_log_confirm_title", "Event-Log leeren?"),
            t(
                "ui.data.clear_event_log_confirm_body",
                "Der lokale Diagnose-Verlauf (letzte Schritte) wird gelöscht. Deine Inhalte bleiben unverändert.",
            ),
        );
        if (!ok) return;
        try {
            await clearEventLog();
            notify.success(t("ui.data.clear_event_log_done", "Event-Log geleert"));
            await refreshStats();
        } catch (err) {
            notify.error(
                t("ui.data.clear_event_log_error", "Event-Log konnte nicht geleert werden"),
                err,
            );
        }
    }, [dialog, refreshStats, t]);

    const handleClearImageCache = useCallback(async () => {
        const ok = await dialog.confirm(
            t("ui.data.clear_image_cache_confirm_title", "Bild-Cache leeren?"),
            t(
                "ui.data.clear_image_cache_confirm_body",
                "Zwischengespeicherte Bilder (Cover, Artikel-Vorschaubilder) werden entfernt. Sie können bei Bedarf neu geladen werden.",
            ),
            "danger",
        );
        if (!ok) return;
        try {
            const cleared = await clearImageCache();
            notify.success(
                t("ui.data.clear_image_cache_done", "{n} Bilder aus dem Cache entfernt").replace(
                    "{n}",
                    String(cleared),
                ),
            );
            await refreshStats();
        } catch (err) {
            notify.error(
                t("ui.data.clear_image_cache_error", "Bild-Cache konnte nicht geleert werden"),
                err,
            );
        }
    }, [dialog, refreshStats, t]);

    const usagePercent =
        stats && stats.usageBytes !== null && stats.quotaBytes
            ? Math.min(100, Math.round((stats.usageBytes / stats.quotaBytes) * 100))
            : null;

    return (
        <div data-testid="data-management-section" className="flex flex-col gap-4">
            <SectionHeader
                title={t("ui.settings.tab_daten", "Daten")}
                description={t(
                    "ui.data.description",
                    "Speicherverbrauch einsehen, Daten exportieren oder importieren und lokale Caches aufräumen.",
                )}
            />

            {/* --- Storage overview --- */}
            <div className={cardClass} data-testid="data-storage-overview">
                <h3 className={`${cardTitleClass} flex items-center gap-2`}>
                    <Database size={16} aria-hidden="true" />
                    {t("ui.data.storage_title", "Speicher-Übersicht")}
                </h3>

                {statsLoading || !stats ? (
                    <p
                        className="text-sm text-[var(--text-muted)]"
                        data-testid="data-storage-loading"
                    >
                        {t("ui.common.loading", "Lädt…")}
                    </p>
                ) : (
                    <>
                        <div className="mb-3" data-testid="data-usage">
                            <div className="mb-1 flex items-baseline justify-between text-sm">
                                <span className="font-medium text-[var(--text)]">
                                    {t("ui.data.usage_total", "Belegt")}
                                </span>
                                <span className="text-[var(--text-muted)]">
                                    {formatBytes(stats.usageBytes)}
                                    {stats.quotaBytes ? ` / ${formatBytes(stats.quotaBytes)}` : ""}
                                    {usagePercent !== null ? ` (${usagePercent}%)` : ""}
                                </span>
                            </div>
                            <div
                                className="h-2 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]"
                                role="progressbar"
                                aria-valuenow={usagePercent ?? 0}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                data-testid="data-usage-bar"
                            >
                                <div
                                    className="h-full bg-[var(--accent)]"
                                    style={{ width: `${usagePercent ?? 0}%` }}
                                    data-testid="data-usage-bar-fill"
                                />
                            </div>
                        </div>

                        <ul className="flex flex-col gap-1" data-testid="data-category-list">
                            {stats.categories.map((cat) => (
                                <li
                                    key={cat.key}
                                    className="flex items-center justify-between border-b border-[var(--border)] py-1 text-sm last:border-b-0"
                                    data-testid={`data-category-${cat.key}`}
                                >
                                    <span className="text-[var(--text)]">
                                        {t(
                                            `ui.data.category_${cat.key}`,
                                            CATEGORY_FALLBACK[cat.key] ?? cat.key,
                                        )}
                                    </span>
                                    <span className="text-[var(--text-muted)]">
                                        {cat.count} {t("ui.data.entries", "Einträge")}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <button
                            type="button"
                            className="btn btn-ghost btn-sm mt-3"
                            style={{ gap: 6 }}
                            onClick={() => setShowTables((prev) => !prev)}
                            data-testid="data-show-all-toggle"
                            aria-expanded={showTables}
                        >
                            <ListTree size={14} />
                            {showTables
                                ? t("ui.data.hide_all_tables", "Tabellen ausblenden")
                                : t("ui.data.show_all_tables", "Alle Daten anzeigen")}
                        </button>

                        {showTables && (
                            <ul
                                className="mt-2 flex flex-col gap-0.5 font-mono text-xs"
                                data-testid="data-tables-list"
                            >
                                {stats.tables.map((table) => (
                                    <li
                                        key={table.name}
                                        className="flex items-center justify-between text-[var(--text-muted)]"
                                        data-testid={`data-table-row-${table.name}`}
                                    >
                                        <span>{table.name}</span>
                                        <span>{table.count}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>

            {/* --- Export --- */}
            <div className={cardClass} data-testid="data-export-section">
                <h3 className={cardTitleClass}>{t("ui.data.export_title", "Export")}</h3>
                <p className={cardDescClass}>
                    {t(
                        "ui.data.export_description",
                        "Sichere deine Daten als .bgb-Datei (inkl. aller Bilder). Das vollständige Backup funktioniert online wie offline.",
                    )}
                </p>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="btn btn-primary btn-sm"
                        style={{ gap: 6 }}
                        onClick={handleFullExport}
                        disabled={busy}
                        data-testid="data-export-full"
                    >
                        <Download size={14} />
                        {t("ui.data.export_full", "Vollständiges Backup exportieren")}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ gap: 6 }}
                        onClick={handleLegacyJsonExport}
                        disabled={busy}
                        data-testid="data-export-json"
                        title={t(
                            "ui.backups.export_json_hint",
                            "Reines JSON ohne Bilder - nur für Daten ohne Bilder oder zum Inspizieren.",
                        )}
                    >
                        <Download size={14} />
                        {t("ui.backups.export_json", "Als JSON exportieren (ohne Bilder)")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                        onClick={handleAuthorsExport}
                        disabled={busy}
                        data-testid="data-export-authors"
                    >
                        <Download size={14} />
                        {t("ui.data.export_authors", "Autoren exportieren")}
                    </button>
                </div>
                <BgbExportProgress progress={exportProgress} testId="data-export-progress" />
            </div>

            <SelectiveExportSection />

            {/* --- Import --- */}
            <div className={cardClass} data-testid="data-import-section">
                <h3 className={cardTitleClass}>{t("ui.data.import_title", "Import")}</h3>
                <p className={cardDescClass}>
                    {t(
                        "ui.data.import_description",
                        "Spiele ein Backup oder eine Autorenliste wieder ein. Vorhandene Einträge werden nicht überschrieben.",
                    )}
                </p>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                        onClick={() => backupInputRef.current?.click()}
                        disabled={busy}
                        data-testid="data-import-full"
                    >
                        <Upload size={14} />
                        {t("ui.data.import_full", "Backup importieren")}
                    </button>
                    <input
                        ref={backupInputRef}
                        type="file"
                        accept=".json,.bgb,application/json"
                        className="hidden"
                        onChange={onBackupInputChange}
                        data-testid="data-import-input"
                    />
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                        onClick={() => authorsInputRef.current?.click()}
                        disabled={busy}
                        data-testid="data-import-authors"
                    >
                        <Upload size={14} />
                        {t("ui.data.import_authors", "Autoren importieren")}
                    </button>
                    <input
                        ref={authorsInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={onAuthorsInputChange}
                        data-testid="data-import-authors-input"
                    />
                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ gap: 6 }}
                        onClick={() => navigate("/articles/import/medium")}
                        data-testid="data-medium-import-link"
                    >
                        <FileText size={14} />
                        {t("ui.data.import_medium", "Medium-Archiv importieren")}
                    </button>
                </div>
            </div>

            {/* --- Maintenance --- */}
            <div className={cardClass} data-testid="data-maintenance-section">
                <h3 className={cardTitleClass}>{t("ui.data.maintenance_title", "Wartung")}</h3>
                <p className={cardDescClass}>
                    {t(
                        "ui.data.maintenance_description",
                        "Lokale Hilfsdaten aufräumen. Bücher, Artikel und Kapitel bleiben unberührt.",
                    )}
                </p>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                        onClick={handleClearEventLog}
                        disabled={busy}
                        data-testid="data-clear-event-log"
                    >
                        <Trash2 size={14} />
                        {t("ui.data.clear_event_log", "Event-Log leeren")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                        onClick={handleClearImageCache}
                        disabled={busy}
                        data-testid="data-clear-image-cache"
                    >
                        <ImageIcon size={14} />
                        {t("ui.data.clear_image_cache", "Bild-Cache leeren")}
                    </button>
                </div>
            </div>
        </div>
    );
}
