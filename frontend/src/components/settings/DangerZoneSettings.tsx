/**
 * Settings > Danger Zone tab — full-system reset entry point.
 *
 * Two-phase HMAC-token-gated wipe of every user-created artifact.
 * The backend half (``POST /api/system/reset/prepare`` +
 * ``POST /api/system/reset``) shipped in commit 3c1381a; this
 * component drives the UI half.
 *
 * Flow:
 *
 *   idle              → on the page; a page-level "Backup erstellen"
 *                       button downloads a full JSON backup at any time
 *                       (no dialog, user stays on the page), and
 *                       "Alles zurücksetzen" opens the dialog
 *   typing            → dialog open at the RESET confirmation; the text
 *                       input gates the destructive button (disabled
 *                       until input === "RESET"); the prepare-token is
 *                       requested in the background so the prepare-call
 *                       latency does not stall the RESET keystrokes
 *   submitting        → reset in flight, all buttons disabled,
 *                       spinner on the destructive button
 *   done              → toast success → localStorage / sessionStorage
 *                       wiped → Dexie BibliogonDB dropped → navigate
 *                       to Dashboard which re-fires onboarding state
 *
 * The backup choice is offered on the page (before the user opens the
 * reset dialog), not inside it: "create a backup first?" is a decision
 * the user makes before committing to the destructive flow.
 *
 * Storage-mode split: in API mode the wipe is the backend
 * ``POST /api/system/reset`` (HMAC-token-gated). In Dexie (offline)
 * mode there is no backend, so the wipe is ``resetOfflineDatabase()``
 * which drops and re-seeds the IndexedDB store — no token, no
 * ``/api`` request. The destructive action is therefore NOT gated
 * offline. The page-level full-JSON backup works in both modes (it is
 * gathered through the storage seam).
 *
 * Failure modes (any 400 / 422 / 5xx from the backend, or an
 * IndexedDB error offline) surface as an error toast and return the
 * dialog to the ``typing`` state so the user can retry without
 * re-opening it.
 *
 * Testid namespace: ``danger-zone-*`` (section root, page backup
 * button, reset button, dialog root, warning text, RESET input,
 * cancel + final delete buttons). See ``.claude/rules/lessons-learned.md``
 * "Testid namespace pinning prevents silent E2E skips".
 */

import { useCallback, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { useStorageMode } from "../../storage/useStorageMode";
import { resetOfflineDatabase } from "../../storage/dexie-storage";
import { notify } from "../../utils/platform/notify";
import { downloadBlob } from "../../export/download";
import { bgbBackupFilename, exportBgbBackup, type BgbProgress } from "../../export/bgbExport";
import { BgbExportProgress } from "./BgbExportProgress";
import { db } from "../../db/drafts";
import styles from "../../pages/Settings.module.css";

type DialogState = "idle" | "typing" | "submitting";

const sectionStyle: React.CSSProperties = {
    padding: 16,
    border: "2px solid var(--danger, #dc2626)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2, #fafafa)",
};

const headerRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    color: "var(--danger, #dc2626)",
};

const descriptionStyle: React.CSSProperties = {
    color: "var(--text-muted, #555)",
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 16,
};

const dialogWarningListStyle: React.CSSProperties = {
    margin: "8px 0",
    paddingLeft: 20,
    fontSize: 14,
    lineHeight: 1.6,
};

const resetInputStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: 16,
    width: "100%",
    marginTop: 8,
};

export function DangerZoneSettings() {
    const { t } = useI18n();
    const { mode } = useStorageMode();
    const offlineGate = mode === "dexie";
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [state, setState] = useState<DialogState>("idle");
    const [token, setToken] = useState<string | null>(null);
    const [resetText, setResetText] = useState("");
    const [backupBusy, setBackupBusy] = useState(false);
    const [backupProgress, setBackupProgress] = useState<BgbProgress | null>(null);

    const proceedToConfirm = useCallback(async () => {
        setState("typing");
        if (offlineGate) {
            setToken(null);
            return;
        }
        try {
            const prepared = await api.system.resetPrepare();
            setToken(prepared.token);
        } catch (err) {
            notify.error(
                t("ui.settings.danger_zone.prepare_error", "Reset konnte nicht vorbereitet werden"),
                err,
            );
            setToken(null);
        }
    }, [offlineGate, t]);

    /**
     * Open the reset dialog straight at the RESET-confirmation step. The
     * backup choice now lives on the page (see {@link handleCreateBackup}),
     * so there is no intermediate "backup first?" prompt; the prepare-token
     * is requested in the background while the user types RESET.
     */
    const openReset = useCallback(() => {
        setDialogOpen(true);
        setResetText("");
        setToken(null);
        void proceedToConfirm();
    }, [proceedToConfirm]);

    /**
     * Download a full ``.bgb`` backup of every entity (incl. all image
     * bytes). Page-level action: no dialog and no reset hand-off - the user
     * stays on the page and may trigger the reset afterwards, or not. Works in
     * both API and Dexie mode (the bundle is gathered through the storage seam).
     */
    const handleCreateBackup = useCallback(async () => {
        setBackupBusy(true);
        try {
            const now = new Date().toISOString();
            const blob = await exportBgbBackup(now, setBackupProgress);
            downloadBlob(blob, bgbBackupFilename(now));
        } catch (err) {
            notify.error(
                t("ui.settings.danger_zone.backup_export_error", "Backup-Export fehlgeschlagen"),
                err,
            );
        } finally {
            setBackupBusy(false);
            setBackupProgress(null);
        }
    }, [t]);

    const closeDialog = useCallback(() => {
        // Block close while a destructive call is in flight - the
        // backend has already started; closing the dialog here just
        // hides the spinner and confuses the user about whether the
        // reset succeeded.
        if (state === "submitting") return;
        setDialogOpen(false);
        setState("idle");
        setToken(null);
        setResetText("");
    }, [state]);

    const executeReset = useCallback(async () => {
        if (state !== "typing" || resetText !== "RESET") return;
        if (!offlineGate && token === null) return;
        setState("submitting");
        try {
            if (offlineGate) {
                await resetOfflineDatabase();
            } else {
                await api.system.reset(token as string, "RESET");
            }
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (storageErr) {
                console.warn("Failed to clear web storage after reset:", storageErr);
            }
            try {
                await db.delete();
            } catch (idbErr) {
                console.warn("Failed to drop Dexie BibliogonDB after reset:", idbErr);
            }
            notify.success(
                t("ui.settings.danger_zone.reset_complete", "Alle Daten wurden gelöscht."),
            );
            navigate("/");
        } catch (err) {
            notify.error(
                t(
                    "ui.settings.danger_zone.reset_error",
                    "Zurücksetzen fehlgeschlagen. Bitte erneut versuchen.",
                ),
                err,
            );
            setState("typing");
            if (!offlineGate) {
                try {
                    const prepared = await api.system.resetPrepare();
                    setToken(prepared.token);
                } catch {
                    setToken(null);
                }
            }
        }
    }, [navigate, offlineGate, resetText, state, t, token]);

    const destructiveEnabled =
        state === "typing" && resetText === "RESET" && (offlineGate || token !== null);

    return (
        <div style={sectionStyle} data-testid="danger-zone-section">
            <div style={headerRowStyle}>
                <AlertTriangle size={20} aria-hidden="true" />
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    {t("ui.settings.danger_zone.title", "Gefahrenzone")}
                </h2>
            </div>
            <p style={descriptionStyle}>
                {t(
                    "ui.settings.danger_zone.description",
                    "Setzt die gesamte App auf den Erstinstallationszustand zurück. " +
                        "Alle Bücher, Artikel, Kapitel, Kommentare, Uploads, Einstellungen und der KI-API-Schlüssel werden unwiderruflich gelöscht.",
                )}
            </p>

            <div className="mb-4">
                <p className="mb-2 text-sm font-medium">
                    {t(
                        "ui.settings.danger_zone.backup_first_title",
                        "Zuerst ein Backup erstellen?",
                    )}
                </p>
                <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="danger-zone-create-backup"
                    onClick={handleCreateBackup}
                    disabled={backupBusy}
                >
                    {t("ui.settings.danger_zone.create_backup", "Backup erstellen")}
                </button>
                <BgbExportProgress progress={backupProgress} testId="danger-zone-backup-progress" />
                <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--text-muted)" }}
                    data-testid="danger-zone-backup-import-hint"
                >
                    {t(
                        "ui.settings.danger_zone.backup_import_hint",
                        "Dieses .bgb-Backup (inkl. aller Bilder) kannst du später unter Einstellungen → Backups → Backup importieren wiederherstellen (online wie offline).",
                    )}
                </p>
            </div>

            <button
                type="button"
                className="btn btn-danger"
                data-testid="danger-zone-reset-button"
                onClick={openReset}
            >
                <AlertTriangle size={16} aria-hidden="true" />
                <span style={{ marginLeft: 6 }}>
                    {t("ui.settings.danger_zone.reset_button", "Alles zurücksetzen")}
                </span>
            </button>

            <Dialog.Root
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (!open) closeDialog();
                }}
            >
                <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay" />
                    <Dialog.Content
                        className="dialog-content"
                        data-testid="danger-zone-dialog"
                        onEscapeKeyDown={(e) => {
                            if (state === "submitting") e.preventDefault();
                        }}
                    >
                        <div className="dialog-header">
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <AlertTriangle
                                    size={22}
                                    style={{ color: "var(--danger)" }}
                                    aria-hidden="true"
                                />
                                <Dialog.Title className="dialog-title">
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_title",
                                        "Alles unwiderruflich löschen?",
                                    )}
                                </Dialog.Title>
                            </div>
                            <Dialog.Close asChild>
                                <button
                                    className="btn-icon"
                                    onClick={closeDialog}
                                    aria-label={t("ui.common.cancel", "Abbrechen")}
                                    disabled={state === "submitting"}
                                >
                                    <X size={16} />
                                </button>
                            </Dialog.Close>
                        </div>

                        <Dialog.Description
                            className="dialog-message"
                            data-testid="danger-zone-warning"
                        >
                            <p style={{ marginTop: 0 }}>
                                {t(
                                    "ui.settings.danger_zone.reset_dialog_warning_intro",
                                    "Diese Aktion kann NICHT rückgängig gemacht werden. Gelöscht werden:",
                                )}
                            </p>
                            <ul style={dialogWarningListStyle}>
                                <li>
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_warning_books",
                                        "Alle Bücher und Kapitel",
                                    )}
                                </li>
                                <li>
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_warning_articles",
                                        "Alle Artikel und Kommentare",
                                    )}
                                </li>
                                <li>
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_warning_uploads",
                                        "Alle hochgeladenen Bilder und Assets",
                                    )}
                                </li>
                                <li>
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_warning_settings",
                                        "Alle Einstellungen und Voreinstellungen",
                                    )}
                                </li>
                                <li>
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_warning_ai_key",
                                        "Der KI-API-Schlüssel",
                                    )}
                                </li>
                                <li>
                                    {t(
                                        "ui.settings.danger_zone.reset_dialog_warning_drafts",
                                        "Alle ungespeicherten Entwürfe im Browser",
                                    )}
                                </li>
                            </ul>
                            <p>
                                {t(
                                    "ui.settings.danger_zone.reset_dialog_warning_keeps",
                                    "Erhalten bleiben: Die App selbst und der Launcher-Installationsstatus.",
                                )}
                            </p>
                        </Dialog.Description>

                        <div style={{ marginTop: 16 }}>
                            <label
                                htmlFor="danger-zone-reset-input"
                                style={{ display: "block", fontSize: 14, fontWeight: 500 }}
                            >
                                {t(
                                    "ui.settings.danger_zone.reset_confirm_prompt",
                                    "Tippe RESET um zu bestätigen",
                                )}
                            </label>
                            <input
                                id="danger-zone-reset-input"
                                type="text"
                                className="input"
                                style={resetInputStyle}
                                data-testid="danger-zone-reset-input"
                                value={resetText}
                                onChange={(e) => setResetText(e.target.value)}
                                disabled={state === "submitting"}
                                autoComplete="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                            />
                        </div>

                        <div className="dialog-footer">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                data-testid="danger-zone-cancel-button"
                                onClick={closeDialog}
                                disabled={state === "submitting"}
                            >
                                {t("ui.common.cancel", "Abbrechen")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                data-testid="danger-zone-final-delete-button"
                                onClick={executeReset}
                                disabled={!destructiveEnabled}
                            >
                                {state === "submitting"
                                    ? t(
                                          "ui.settings.danger_zone.reset_submitting",
                                          "Wird gelöscht...",
                                      )
                                    : t(
                                          "ui.settings.danger_zone.reset_final_button",
                                          "Endgültig löschen",
                                      )}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
}
