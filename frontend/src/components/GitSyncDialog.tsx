import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
    X,
    Upload,
    GitBranch,
    AlertTriangle,
    Check,
    Loader2,
    GitMerge,
} from "lucide-react";
import GitSyncDiffDialog from "./GitSyncDiffDialog";
import {
    api,
    ApiError,
    GitSyncCommitResult,
    GitSyncMappingStatus,
    GitSyncUnifiedCommitResult,
} from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";

/**
 * PGS-02 commit-to-repo dialog.
 *
 * Surfaced from the BookEditor sidebar when the book has a
 * GitSyncMapping (i.e. it was imported via the plugin-git-sync
 * git-URL wizard). Shows the mapping snapshot + working-tree
 * dirty state, lets the user provide an optional commit message
 * and toggle "push to remote" (currently a 501 - the toggle is
 * present so the form survives the eventual push wiring without
 * a UI rework).
 */
interface Props {
    open: boolean;
    bookId: string;
    onClose: () => void;
}

export default function GitSyncDialog({ open, bookId, onClose }: Props) {
    const { t } = useI18n();
    const [status, setStatus] = useState<GitSyncMappingStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [message, setMessage] = useState("");
    const [push, setPush] = useState(false);
    const [lastResult, setLastResult] = useState<GitSyncCommitResult | null>(
        null,
    );
    const [unifiedResult, setUnifiedResult] =
        useState<GitSyncUnifiedCommitResult | null>(null);
    const [unifying, setUnifying] = useState(false);
    const [showDiff, setShowDiff] = useState(false);

    useEffect(() => {
        if (!open) return;
        void refresh();
        // Reset transient form state when the dialog re-opens for a different
        // book; preserves last commit result during the same session.
        setMessage("");
        setPush(false);
    }, [open, bookId]);

    async function refresh(): Promise<void> {
        setLoading(true);
        try {
            const next = await api.gitSync.status(bookId);
            setStatus(next);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.git_sync.status_error", "Konnte Git-Status nicht laden."), err);
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleCommit(): Promise<void> {
        if (!status?.mapped) return;
        setCommitting(true);
        setLastResult(null);
        try {
            const result = await api.gitSync.commit(bookId, {
                message: message.trim() || null,
                push,
            });
            setLastResult(result);
            notify.success(
                t("ui.git_sync.commit_success", "Commit erstellt"),
            );
            await refresh();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 409) {
                    notify.warning(
                        t("ui.git_sync.no_changes", "Keine Änderungen zu committen."),
                    );
                } else if (err.status === 410) {
                    notify.warning(
                        t(
                            "ui.git_sync.clone_missing",
                            "Lokaler Klon fehlt. Bitte das Buch erneut aus dem Repo importieren.",
                        ),
                    );
                } else if (err.status === 401) {
                    notify.error(
                        t(
                            "ui.git_sync.push_auth_failed",
                            "Push fehlgeschlagen: keine Berechtigung. Bitte SSH-Key oder Credentials prüfen.",
                        ),
                        err,
                    );
                } else if (err.status === 502) {
                    notify.error(
                        t(
                            "ui.git_sync.push_network_failed",
                            "Push fehlgeschlagen: Remote nicht erreichbar.",
                        ),
                        err,
                    );
                } else {
                    notify.error(
                        t("ui.git_sync.commit_error", "Commit fehlgeschlagen."),
                        err,
                    );
                }
            }
        } finally {
            setCommitting(false);
        }
    }

    async function handleUnifiedCommit(): Promise<void> {
        if (!status?.mapped) return;
        setUnifying(true);
        setLastResult(null);
        setUnifiedResult(null);
        try {
            const result = await api.gitSync.unifiedCommit(bookId, {
                message: message.trim() || null,
                push_plugin: push,
            });
            setUnifiedResult(result);
            // Per-subsystem status defines the toast tier - if either side
            // failed, surface a single warning toast with both lines so
            // the user does not have to read the inline summary block.
            const anyFailed =
                result.core_git.status === "failed" ||
                result.plugin_git_sync.status === "failed";
            if (anyFailed) {
                notify.warning(
                    t(
                        "ui.git_sync.unified_partial",
                        "Commit teils erfolgreich. Details unten.",
                    ),
                );
            } else {
                notify.success(
                    t(
                        "ui.git_sync.unified_success",
                        "Commit auf beiden Seiten erstellt.",
                    ),
                );
            }
            await refresh();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 503) {
                    notify.warning(
                        t(
                            "ui.git_sync.unified_lock_busy",
                            "Anderer Commit läuft gerade. Bitte kurz warten.",
                        ),
                    );
                } else {
                    notify.error(
                        t(
                            "ui.git_sync.unified_error",
                            "Unified-Commit fehlgeschlagen.",
                        ),
                        err,
                    );
                }
            }
        } finally {
            setUnifying(false);
        }
    }

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="dialog-content dialog-content-wide"
                    data-testid="git-sync-dialog"
                >
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            <GitBranch
                                size={18}
                                style={{ verticalAlign: -3, marginRight: 8 }}
                            />
                            {t("ui.git_sync.title", "Sync zu Git-Repository")}
                        </Dialog.Title>
                        <Dialog.Close
                            className="dialog-close"
                            aria-label={t("ui.common.close", "Schließen")}
                        >
                            <X size={18} />
                        </Dialog.Close>
                    </div>

                    {loading && !status ? (
                        <div
                            data-testid="git-sync-loading"
                            style={{ padding: 16, color: "var(--text-muted)" }}
                        >
                            {t("ui.common.loading", "Laedt...")}
                        </div>
                    ) : !status?.mapped ? (
                        <UnmappedNotice />
                    ) : (
                        <>
                            <MappingSummary status={status} />
                            <CredentialsSection
                                bookId={bookId}
                                hasCredential={status.has_credential}
                                onChanged={() => void refresh()}
                            />
                            {status.core_git_initialized && (
                                <UnifiedCommitBanner />
                            )}
                            {status.dirty === null ? (
                                <CloneMissingNotice />
                            ) : (
                                <>
                                    <CommitForm
                                        dirty={status.dirty}
                                        message={message}
                                        onMessageChange={setMessage}
                                        push={push}
                                        onPushChange={setPush}
                                        committing={committing}
                                        onSubmit={handleCommit}
                                        unifiedAvailable={
                                            status.core_git_initialized
                                        }
                                        unifying={unifying}
                                        onUnifiedSubmit={handleUnifiedCommit}
                                    />
                                    <CheckUpstreamButton
                                        onClick={() => setShowDiff(true)}
                                    />
                                </>
                            )}
                            {lastResult && (
                                <LastResult result={lastResult} />
                            )}
                            {unifiedResult && (
                                <UnifiedResult result={unifiedResult} />
                            )}
                        </>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
            <GitSyncDiffDialog
                open={showDiff}
                bookId={bookId}
                onClose={() => setShowDiff(false)}
                onResolved={() => void refresh()}
            />
        </Dialog.Root>
    );
}

function UnmappedNotice() {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-unmapped"
            style={{
                padding: 16,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                marginTop: 8,
            }}
        >
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
                {t(
                    "ui.git_sync.unmapped_body",
                    "Dieses Buch wurde nicht über die Git-URL-Importfunktion erstellt. Es gibt kein verbundenes Repository für den Sync.",
                )}
            </p>
        </div>
    );
}

function CloneMissingNotice() {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-clone-missing"
            style={{
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                marginTop: 12,
                fontSize: "0.875rem",
            }}
        >
            <strong
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--accent-hover)",
                }}
            >
                <AlertTriangle size={14} />
                {t(
                    "ui.git_sync.clone_missing_heading",
                    "Lokaler Klon nicht gefunden",
                )}
            </strong>
            <p
                style={{
                    margin: "6px 0 0 0",
                    color: "var(--text-muted)",
                }}
            >
                {t(
                    "ui.git_sync.clone_missing_body",
                    "Der zuvor geklonte Repository-Pfad existiert nicht mehr. Bitte das Buch über die Git-URL-Importfunktion erneut importieren, um die Verbindung herzustellen.",
                )}
            </p>
        </div>
    );
}

function MappingSummary({ status }: { status: GitSyncMappingStatus }) {
    const { t } = useI18n();
    return (
        <dl
            data-testid="git-sync-summary"
            style={{
                margin: "8px 0 12px 0",
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                columnGap: 12,
                rowGap: 4,
                fontSize: "0.8125rem",
            }}
        >
            <dt style={dt}>{t("ui.git_sync.repo_url_label", "Repository")}</dt>
            <dd data-testid="git-sync-repo-url" style={dd}>
                {status.repo_url}
            </dd>
            <dt style={dt}>{t("ui.git_sync.branch_label", "Branch")}</dt>
            <dd data-testid="git-sync-branch" style={dd}>
                {status.branch}
            </dd>
            <dt style={dt}>
                {t(
                    "ui.git_sync.last_imported_label",
                    "Zuletzt importiert (SHA)",
                )}
            </dt>
            <dd data-testid="git-sync-last-imported" style={ddMono}>
                {status.last_imported_commit_sha?.slice(0, 12)}
            </dd>
            {status.last_committed_at && (
                <>
                    <dt style={dt}>
                        {t(
                            "ui.git_sync.last_committed_label",
                            "Letzter Sync-Commit",
                        )}
                    </dt>
                    <dd data-testid="git-sync-last-committed" style={dd}>
                        {new Date(status.last_committed_at).toLocaleString()}
                    </dd>
                </>
            )}
        </dl>
    );
}

function CredentialsSection({
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
            notify.success(
                t("ui.git_sync.credential_saved", "Repo-Token gespeichert"),
            );
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.git_sync.credential_save_error",
                        "Konnte Repo-Token nicht speichern.",
                    ),
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
            notify.success(
                t("ui.git_sync.credential_removed", "Repo-Token entfernt"),
            );
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.git_sync.credential_delete_error",
                        "Konnte Repo-Token nicht entfernen.",
                    ),
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
                    <input
                        data-testid="git-sync-credential-input"
                        type="password"
                        value={pat}
                        onChange={(e) => setPat(e.target.value)}
                        placeholder={t(
                            "ui.git_sync.credential_input_placeholder",
                            "Personal Access Token",
                        )}
                        autoComplete="off"
                        spellCheck={false}
                        style={{ flex: 1 }}
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

function CommitForm({
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
                    <AlertTriangle
                        size={12}
                        style={{ verticalAlign: -1, marginRight: 4 }}
                    />
                    {t(
                        "ui.git_sync.dirty_warning",
                        "Im lokalen Klon liegen unversionierte Änderungen. Sie werden vom Sync überschrieben.",
                    )}
                </div>
            )}
            <div className="field" style={{ marginTop: 12 }}>
                <label className="label">
                    {t(
                        "ui.git_sync.message_label",
                        "Commit-Nachricht (optional)",
                    )}
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
            <label
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 8,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                }}
            >
                <input
                    type="checkbox"
                    checked={push}
                    onChange={(e) => onPushChange(e.target.checked)}
                    data-testid="git-sync-push-toggle"
                />
                {t("ui.git_sync.push_toggle", "Push ins Remote")}
            </label>
            <div className="dialog-footer">
                <button
                    type="button"
                    className={`btn ${unifiedAvailable ? "btn-secondary" : "btn-primary"}`}
                    onClick={onSubmit}
                    disabled={committing || unifying}
                    data-testid="git-sync-commit-btn"
                >
                    {committing ? (
                        <Loader2 size={14} className="spin" />
                    ) : (
                        <Upload size={14} />
                    )}
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
                        {t(
                            "ui.git_sync.unified_commit_button",
                            "Commit überall",
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}


function UnifiedCommitBanner() {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-unified-banner"
            style={{
                marginTop: 6,
                padding: 10,
                background: "var(--accent-light, var(--bg-card))",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                fontSize: "0.8125rem",
                color: "var(--accent-hover)",
            }}
        >
            <GitBranch
                size={12}
                style={{ verticalAlign: -1, marginRight: 4 }}
            />
            {t(
                "ui.git_sync.unified_banner",
                "Dieses Buch hat zusaetzlich Bibliogon-Git aktiv. 'Commit überall' macht beide Commits in einem Schritt.",
            )}
        </div>
    );
}


function UnifiedResult({ result }: { result: GitSyncUnifiedCommitResult }) {
    const { t } = useI18n();
    const renderRow = (
        label: string,
        sub: GitSyncUnifiedCommitResult["core_git"],
        testid: string,
    ) => (
        <li
            data-testid={testid}
            data-status={sub.status}
            style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "4px 0",
            }}
        >
            <strong style={{ minWidth: 110 }}>{label}:</strong>
            <span
                style={{
                    fontSize: "0.75rem",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background:
                        sub.status === "ok"
                            ? "var(--success-light, var(--bg-card))"
                            : sub.status === "failed"
                              ? "var(--accent-light)"
                              : "var(--bg-card)",
                    color:
                        sub.status === "ok"
                            ? "var(--success, #16a34a)"
                            : sub.status === "failed"
                              ? "var(--accent-hover)"
                              : "var(--text-muted)",
                    border: "1px solid var(--border)",
                }}
            >
                {sub.status}
            </span>
            {sub.commit_sha && (
                <code
                    style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                    }}
                >
                    {sub.commit_sha.slice(0, 12)}
                </code>
            )}
            {sub.detail && (
                <span
                    style={{
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {sub.detail}
                </span>
            )}
        </li>
    );

    return (
        <ul
            data-testid="git-sync-unified-result"
            style={{
                listStyle: "none",
                padding: 10,
                margin: "12px 0 0 0",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: "0.8125rem",
            }}
        >
            {renderRow(
                t("ui.git_sync.subsystem_core", "Bibliogon-Git"),
                result.core_git,
                "git-sync-unified-row-core",
            )}
            {renderRow(
                t("ui.git_sync.subsystem_plugin", "Externes Repo"),
                result.plugin_git_sync,
                "git-sync-unified-row-plugin",
            )}
        </ul>
    );
}

function CheckUpstreamButton({ onClick }: { onClick: () => void }) {
    const { t } = useI18n();
    return (
        <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClick}
            data-testid="git-sync-check-upstream"
            style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
            }}
        >
            <GitMerge size={14} />
            {t(
                "ui.git_sync.check_upstream",
                "Auf Änderungen vom Repo prüfen",
            )}
        </button>
    );
}

function LastResult({ result }: { result: GitSyncCommitResult }) {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-last-result"
            style={{
                marginTop: 12,
                padding: 10,
                background: "var(--success-light, var(--bg-card))",
                border: "1px solid var(--success, #16a34a)",
                borderRadius: 4,
                fontSize: "0.8125rem",
                color: "var(--success, #16a34a)",
            }}
        >
            <Check size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
            {t("ui.git_sync.commit_success_detail", "Commit {sha} auf {branch}")
                .replace("{sha}", result.commit_sha.slice(0, 12))
                .replace("{branch}", result.branch)}
            {result.pushed && (
                <span style={{ marginLeft: 8 }}>
                    {t("ui.git_sync.commit_pushed", "(gepusht)")}
                </span>
            )}
        </div>
    );
}

const dt: React.CSSProperties = {
    fontWeight: 500,
    color: "var(--text-secondary)",
};

const dd: React.CSSProperties = {
    margin: 0,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    wordBreak: "break-all",
};

const ddMono: React.CSSProperties = {
    ...dd,
    fontFamily: "var(--font-mono, monospace)",
};
