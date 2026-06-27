/**
 * Interactive forms for the Git-Sync page (#207 god-file split).
 *
 * Extracted verbatim from pages/GitSyncPage.tsx: the HTTPS-credential
 * section (save/remove a repo token) and the commit form (message + push
 * toggle + commit / unified-commit buttons). data-testids are unchanged.
 */

import { useState } from "react";
import { Upload, GitBranch, AlertTriangle, Loader2 } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { Toggle } from "../settings/Toggle";
import { notify } from "../../utils/platform/notify";
import { TokenInput } from "../../lib/components/TokenInput";

export function CredentialsSection({
    bookId,
    hasCredential,
    onChanged,
}: {
    bookId: string;
    hasCredential: boolean;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const [pat, setPat] = useState("");
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    async function save(): Promise<void> {
        const value = pat.trim();
        if (!value) return;
        setBusy(true);
        try {
            await api.gitSync.putCredential(bookId, value);
            setPat("");
            setOpen(false);
            notify.success(t("ui.git_sync.credential_saved", "Repo-Token gespeichert"));
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.git_sync.credential_save_error", "Konnte Repo-Token nicht speichern."),
                    err,
                );
            }
        } finally {
            setBusy(false);
        }
    }

    async function remove(): Promise<void> {
        setBusy(true);
        try {
            await api.gitSync.deleteCredential(bookId);
            notify.success(t("ui.git_sync.credential_removed", "Repo-Token entfernt"));
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.git_sync.credential_delete_error", "Konnte Repo-Token nicht entfernen."),
                    err,
                );
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            data-testid="git-sync-credentials"
            style={{
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                marginTop: 12,
                fontSize: "0.875rem",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                }}
            >
                <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t("ui.git_sync.credential_heading", "Repo-Zugang (HTTPS)")}
                    {hasCredential ? (
                        <span
                            data-testid="git-sync-credential-status"
                            style={{ color: "var(--success)", fontWeight: "normal" }}
                        >
                            {t("ui.git_sync.credential_set", " konfiguriert")}
                        </span>
                    ) : (
                        <span
                            data-testid="git-sync-credential-status"
                            style={{ color: "var(--text-muted)", fontWeight: "normal" }}
                        >
                            {t("ui.git_sync.credential_unset", " nicht gesetzt")}
                        </span>
                    )}
                </strong>
                <div style={{ display: "flex", gap: 6 }}>
                    {hasCredential && (
                        <button
                            type="button"
                            data-testid="git-sync-credential-remove"
                            onClick={() => void remove()}
                            disabled={busy}
                            className="btn btn-ghost btn-sm"
                        >
                            {t("ui.git_sync.credential_remove", "Entfernen")}
                        </button>
                    )}
                    <button
                        type="button"
                        data-testid="git-sync-credential-toggle"
                        onClick={() => setOpen((v) => !v)}
                        disabled={busy}
                        className="btn btn-ghost btn-sm"
                    >
                        {open
                            ? t("ui.common.cancel", "Abbrechen")
                            : hasCredential
                              ? t("ui.git_sync.credential_replace", "Ändern")
                              : t("ui.git_sync.credential_add", "Hinzufügen")}
                    </button>
                </div>
            </div>
            {open && (
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <TokenInput
                        testId="git-sync-credential-input"
                        value={pat}
                        onChange={setPat}
                        placeholder={t(
                            "ui.git_sync.credential_input_placeholder",
                            "Personal Access Token",
                        )}
                        showLabel={t("ui.common.show", "Anzeigen")}
                        hideLabel={t("ui.common.hide", "Ausblenden")}
                    />
                    <button
                        type="button"
                        data-testid="git-sync-credential-save"
                        onClick={() => void save()}
                        disabled={busy || !pat.trim()}
                        className="btn btn-primary btn-sm"
                    >
                        {t("ui.common.save", "Speichern")}
                    </button>
                </div>
            )}
            <p
                style={{
                    margin: "8px 0 0",
                    color: "var(--text-muted)",
                    fontSize: "0.75rem",
                }}
            >
                {t(
                    "ui.git_sync.credential_hint",
                    "Wird verschlüsselt gespeichert und auch für das Kern-Git-Backup verwendet. Nur für HTTPS-Remotes; SSH nutzt den Bibliogon-SSH-Key.",
                )}
            </p>
        </div>
    );
}

export function CommitForm({
    dirty,
    message,
    onMessageChange,
    push,
    onPushChange,
    committing,
    onSubmit,
    unifiedAvailable = false,
    unifying = false,
    onUnifiedSubmit,
}: {
    dirty: boolean;
    message: string;
    onMessageChange: (next: string) => void;
    push: boolean;
    onPushChange: (next: boolean) => void;
    committing: boolean;
    onSubmit: () => void;
    unifiedAvailable?: boolean;
    unifying?: boolean;
    onUnifiedSubmit?: () => void;
}) {
    const { t } = useI18n();
    return (
        <div data-testid="git-sync-commit-form">
            {dirty && (
                <div
                    data-testid="git-sync-dirty-warning"
                    style={{
                        padding: 10,
                        marginTop: 8,
                        background: "var(--accent-light)",
                        border: "1px solid var(--accent)",
                        borderRadius: 4,
                        fontSize: "0.8125rem",
                        color: "var(--accent-hover)",
                    }}
                >
                    <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                    {t(
                        "ui.git_sync.dirty_warning",
                        "Im lokalen Klon liegen unversionierte Änderungen. Sie werden vom Sync überschrieben.",
                    )}
                </div>
            )}
            <div className="field" style={{ marginTop: 12 }}>
                <label className="label">
                    {t("ui.git_sync.message_label", "Commit-Nachricht (optional)")}
                </label>
                <input
                    className="input"
                    type="text"
                    value={message}
                    onChange={(e) => onMessageChange(e.target.value)}
                    placeholder={t(
                        "ui.git_sync.message_placeholder",
                        "Sync from Bibliogon at <utc-iso>",
                    )}
                    maxLength={2000}
                    data-testid="git-sync-message"
                />
            </div>
            <div style={{ marginTop: 8 }}>
                <Toggle
                    checked={push}
                    onChange={onPushChange}
                    testId="git-sync-push-toggle"
                    label={t("ui.git_sync.push_toggle", "Push ins Remote")}
                />
            </div>
            <div className="dialog-footer">
                <button
                    type="button"
                    className={`btn ${unifiedAvailable ? "btn-secondary" : "btn-primary"}`}
                    onClick={onSubmit}
                    disabled={committing || unifying}
                    data-testid="git-sync-commit-btn"
                >
                    {committing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                    {t("ui.git_sync.commit_button", "Commit erstellen")}
                </button>
                {unifiedAvailable && onUnifiedSubmit && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onUnifiedSubmit}
                        disabled={committing || unifying}
                        data-testid="git-sync-unified-commit-btn"
                        title={t(
                            "ui.git_sync.unified_commit_tooltip",
                            "Commit gleichzeitig in Bibliogon-Git und externem Repo",
                        )}
                    >
                        {unifying ? (
                            <Loader2 size={14} className="spin" />
                        ) : (
                            <GitBranch size={14} />
                        )}
                        {t("ui.git_sync.unified_commit_button", "Commit überall")}
                    </button>
                )}
            </div>
        </div>
    );
}
