import { Upload, Download, Unplug, Check } from "lucide-react";
import { GitRemoteConfig as GitRemoteConfigType } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { TokenInput } from "../../lib/components/TokenInput";

export function GitRemoteConfig({
    remote,
    busy,
    editingRemote,
    remoteUrlDraft,
    remotePatDraft,
    onEdit,
    onCancelEdit,
    onUrlChange,
    onPatChange,
    onSave,
    onDeleteRemote,
    onPush,
    onPull,
}: {
    remote: GitRemoteConfigType | null;
    busy: boolean;
    editingRemote: boolean;
    remoteUrlDraft: string;
    remotePatDraft: string;
    onEdit: () => void;
    onCancelEdit: () => void;
    onUrlChange: (value: string) => void;
    onPatChange: (value: string) => void;
    onSave: () => void;
    onDeleteRemote: () => void;
    onPush: () => void;
    onPull: () => void;
}) {
    const { t } = useI18n();
    return (
        <div
            style={{
                padding: 12,
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
            }}
        >
            <h3
                style={{
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    marginBottom: 8,
                }}
            >
                {t("ui.git.remote", "Remote")}
            </h3>
            {!editingRemote && remote && remote.url && (
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <code
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.8125rem",
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {remote.url}
                    </code>
                    {remote.has_credential && (
                        <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>
                            <Check size={12} style={{ verticalAlign: -1 }} /> PAT
                        </span>
                    )}
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onPush()}
                        disabled={busy}
                        data-testid="git-push-btn"
                    >
                        <Upload size={14} /> {t("ui.git.push", "Push")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onPull}
                        disabled={busy}
                        data-testid="git-pull-btn"
                    >
                        <Download size={14} /> {t("ui.git.pull", "Pull")}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={onEdit}>
                        {t("ui.common.edit", "Bearbeiten")}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={onDeleteRemote}
                        disabled={busy}
                        title={t("ui.git.remote_delete", "Remote entfernen")}
                    >
                        <Unplug size={14} />
                    </button>
                </div>
            )}
            {!editingRemote && remote && !remote.url && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="muted-sm">
                        {t("ui.git.no_remote", "Kein Remote konfiguriert.")}
                    </span>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onEdit}
                        data-testid="git-remote-configure-btn"
                    >
                        {t("ui.git.remote_configure", "Remote konfigurieren")}
                    </button>
                </div>
            )}
            {editingRemote && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="field">
                        <label className="label">{t("ui.git.remote_url", "Remote-URL")}</label>
                        <input
                            className="input"
                            value={remoteUrlDraft}
                            onChange={(e) => onUrlChange(e.target.value)}
                            placeholder="https://github.com/user/my-book.git"
                            style={{ fontFamily: "var(--font-mono)" }}
                            data-testid="git-remote-url-input"
                        />
                    </div>
                    <div className="field">
                        <label className="label">
                            {t("ui.git.remote_pat", "Personal Access Token")}
                            {remote?.has_credential && (
                                <small
                                    style={{
                                        marginLeft: 6,
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    (
                                    {t(
                                        "ui.git.remote_pat_stored",
                                        "gespeichert — leer lassen zum Beibehalten",
                                    )}
                                    )
                                </small>
                            )}
                        </label>
                        <TokenInput
                            value={remotePatDraft}
                            onChange={onPatChange}
                            placeholder="ghp_..."
                            testId="git-remote-pat-input"
                            showLabel={t("ui.common.show", "Anzeigen")}
                            hideLabel={t("ui.common.hide", "Ausblenden")}
                        />
                        <small
                            style={{
                                color: "var(--text-muted)",
                                fontSize: "0.75rem",
                            }}
                        >
                            {t(
                                "ui.git.pat_hint",
                                "Der PAT wird verschlüsselt gespeichert und nie zurückgegeben. Verwende ein privates Repository.",
                            )}
                        </small>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={onSave}
                            disabled={busy}
                            data-testid="git-remote-save-btn"
                        >
                            {t("ui.common.save", "Speichern")}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={onCancelEdit}
                            disabled={busy}
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
