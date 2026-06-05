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
 *   idle              → user clicks "Reset Everything"
 *   confirming        → dialog open, full warning visible, backup
 *                       link prominently shown but not required;
 *                       token already requested in the background
 *                       so the prepare-call latency does not stall
 *                       the user-typed RESET keystrokes
 *   typing            → text input gates the destructive button;
 *                       button stays disabled until input === "RESET"
 *   submitting        → API call in flight, all buttons disabled,
 *                       spinner on the destructive button
 *   done              → toast success → localStorage / sessionStorage
 *                       wiped → Dexie BibliogonDB dropped → navigate
 *                       to Dashboard which re-fires onboarding state
 *
 * Failure modes (any 400 / 422 / 5xx from the backend) surface as
 * an error toast and return the dialog to the ``typing`` state so
 * the user can retry without re-opening it.
 *
 * Testid namespace: ``danger-zone-*`` (section root, reset button,
 * dialog root, warning text, backup link, RESET input, final
 * delete button). See ``.claude/rules/lessons-learned.md``
 * "Testid namespace pinning prevents silent E2E skips".
 */

import {useCallback, useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {AlertTriangle, X} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {api} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";
import {useOfflineFeatureGate} from "../../storage/useOfflineFeatureGate";
import {notify} from "../../utils/notify";
import {db} from "../../db/drafts";
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

const backupCalloutStyle: React.CSSProperties = {
    padding: 12,
    margin: "12px 0",
    border: "1px solid var(--border)",
    borderRadius: 6,
    backgroundColor: "var(--bg-card)",
    fontSize: 14,
};

const resetInputStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: 16,
    width: "100%",
    marginTop: 8,
};

export function DangerZoneSettings() {
    const {t} = useI18n();
    const {offline: offlineGate, message: offlineMsg} = useOfflineFeatureGate();
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [state, setState] = useState<DialogState>("idle");
    const [token, setToken] = useState<string | null>(null);
    const [resetText, setResetText] = useState("");

    const openDialog = useCallback(async () => {
        setDialogOpen(true);
        setState("typing");
        setResetText("");
        // Pre-fetch the token in the background so the user's RESET-
        // typing keystrokes don't race the prepare-call. If the
        // prepare fails the destructive button stays disabled with
        // an error toast - we DON'T close the dialog because the
        // user has already committed to the flow.
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
        if (state !== "typing" || token === null || resetText !== "RESET") return;
        setState("submitting");
        try {
            await api.system.reset(token, "RESET");
            // Post-reset cleanup: every browser-side artifact must
            // be cleared too. ``localStorage.clear()`` resets all 14
            // bibliogon-* preference keys + SSE F5-recovery handles;
            // ``sessionStorage.clear()`` covers any future use;
            // ``db.delete()`` drops the entire Dexie ``BibliogonDB``
            // (chapter drafts). Errors here are non-fatal - the
            // backend has already succeeded; we log and continue
            // to the redirect.
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
            notify.success(t("ui.settings.danger_zone.reset_complete", "Alle Daten wurden gelöscht."));
            // Navigate to the Dashboard root - the fresh-app
            // onboarding state re-fires because we just cleared the
            // bibliogon-onboarding flag from localStorage.
            navigate("/");
        } catch (err) {
            notify.error(
                t("ui.settings.danger_zone.reset_error", "Zurücksetzen fehlgeschlagen. Bitte erneut versuchen."),
                err,
            );
            // Re-arm the dialog so the user can retry without
            // closing + reopening. Fresh token to avoid the original
            // having expired by the time they finish reading the
            // error.
            setState("typing");
            try {
                const prepared = await api.system.resetPrepare();
                setToken(prepared.token);
            } catch {
                setToken(null);
            }
        }
    }, [navigate, resetText, state, t, token]);

    const handleBackupClick = useCallback(() => {
        if (offlineGate) return;
        // Triggers a download via the existing backup-export URL.
        // Opening in a new tab + immediately closing is the
        // standard browser idiom for "save this file" without
        // disrupting the parent page (which still has the dialog
        // open). The browser handles the .bgb download natively;
        // no JS coordination needed.
        window.open(api.backup.exportUrl(false), "_blank", "noopener");
    }, [offlineGate]);

    const destructiveEnabled = state === "typing" && token !== null && resetText === "RESET";

    return (
        <div style={sectionStyle} data-testid="danger-zone-section">
            <div style={headerRowStyle}>
                <AlertTriangle size={20} aria-hidden="true" />
                <h2 className={styles.sectionTitle} style={{margin: 0}}>
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
            <button
                type="button"
                className="btn btn-danger"
                data-testid="danger-zone-reset-button"
                onClick={openDialog}
            >
                <AlertTriangle size={16} aria-hidden="true" />
                <span style={{marginLeft: 6}}>
                    {t("ui.settings.danger_zone.reset_button", "Alles zurücksetzen")}
                </span>
            </button>

            <Dialog.Root open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
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
                            <div style={{display: "flex", alignItems: "center", gap: 10}}>
                                <AlertTriangle size={22} style={{color: "var(--danger)"}} aria-hidden="true" />
                                <Dialog.Title className="dialog-title">
                                    {t("ui.settings.danger_zone.reset_dialog_title", "Alles unwiderruflich löschen?")}
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

                        <Dialog.Description className="dialog-message" data-testid="danger-zone-warning">
                            <p style={{marginTop: 0}}>
                                {t(
                                    "ui.settings.danger_zone.reset_dialog_warning_intro",
                                    "Diese Aktion kann NICHT rückgängig gemacht werden. Gelöscht werden:",
                                )}
                            </p>
                            <ul style={dialogWarningListStyle}>
                                <li>{t("ui.settings.danger_zone.reset_dialog_warning_books", "Alle Bücher und Kapitel")}</li>
                                <li>{t("ui.settings.danger_zone.reset_dialog_warning_articles", "Alle Artikel und Kommentare")}</li>
                                <li>{t("ui.settings.danger_zone.reset_dialog_warning_uploads", "Alle hochgeladenen Bilder und Assets")}</li>
                                <li>{t("ui.settings.danger_zone.reset_dialog_warning_settings", "Alle Einstellungen und Voreinstellungen")}</li>
                                <li>{t("ui.settings.danger_zone.reset_dialog_warning_ai_key", "Der KI-API-Schlüssel")}</li>
                                <li>{t("ui.settings.danger_zone.reset_dialog_warning_drafts", "Alle ungespeicherten Entwürfe im Browser")}</li>
                            </ul>
                            <p>
                                {t(
                                    "ui.settings.danger_zone.reset_dialog_warning_keeps",
                                    "Erhalten bleiben: Die App selbst und der Launcher-Installationsstatus.",
                                )}
                            </p>
                        </Dialog.Description>

                        <div style={backupCalloutStyle} data-testid="danger-zone-backup-offer">
                            <p style={{margin: "0 0 8px 0"}}>
                                {t(
                                    "ui.settings.danger_zone.reset_dialog_backup_offer",
                                    "Möchtest du vorher ein Backup erstellen?",
                                )}
                            </p>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                data-testid="danger-zone-backup-button"
                                onClick={handleBackupClick}
                                disabled={state === "submitting" || offlineGate}
                                title={offlineGate ? offlineMsg : undefined}
                            >
                                {t("ui.settings.danger_zone.reset_dialog_backup_button", "Backup erstellen")}
                            </button>
                        </div>

                        <div style={{marginTop: 16}}>
                            <label htmlFor="danger-zone-reset-input" style={{display: "block", fontSize: 14, fontWeight: 500}}>
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
                                    ? t("ui.settings.danger_zone.reset_submitting", "Wird gelöscht...")
                                    : t("ui.settings.danger_zone.reset_final_button", "Endgültig löschen")}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
}
