import {useEffect, useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {
    X,
    GitCommit,
    GitBranch,
    RefreshCw,
    Upload,
    Download,
    Unplug,
    Check,
    AlertTriangle,
} from "lucide-react"
import {
    api,
    ApiError,
    GitCommitEntry,
    GitRemoteConfig,
    GitRepoStatus,
    GitSyncStatus,
    GitMergeResult,
} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"

interface Props {
    open: boolean
    bookId: string
    onClose: () => void
}

export default function GitBackupDialog({open, bookId, onClose}: Props) {
    const {t} = useI18n()
    const [status, setStatus] = useState<GitRepoStatus | null>(null)
    const [commits, setCommits] = useState<GitCommitEntry[]>([])
    const [remote, setRemote] = useState<GitRemoteConfig | null>(null)
    const [sync, setSync] = useState<GitSyncStatus | null>(null)
    const [message, setMessage] = useState("")
    const [remoteUrlDraft, setRemoteUrlDraft] = useState("")
    const [remotePatDraft, setRemotePatDraft] = useState("")
    const [editingRemote, setEditingRemote] = useState(false)
    const [busy, setBusy] = useState(false)
    const [conflictKind, setConflictKind] = useState<"push_rejected" | "diverged" | null>(null)
    const [conflictFiles, setConflictFiles] = useState<string[]>([])
    const [resolutions, setResolutions] = useState<Record<string, "mine" | "theirs">>({})

    useEffect(() => {
        if (!open) return
        void refresh()
    }, [open, bookId])

    async function refresh() {
        try {
            const st = await api.git.status(bookId)
            setStatus(st)
            if (st.initialized) {
                const [logEntries, rc, ss] = await Promise.all([
                    api.git.log(bookId, 50),
                    api.git.getRemote(bookId),
                    api.git.syncStatus(bookId),
                ])
                setCommits(logEntries)
                setRemote(rc)
                setSync(ss)
                setRemoteUrlDraft(rc.url ?? "")
                setRemotePatDraft("")
            } else {
                setCommits([])
                setRemote(null)
                setSync(null)
            }
        } catch (err) {
            notify.error(describeError(err))
        }
    }

    async function handleInit() {
        setBusy(true)
        try {
            await api.git.init(bookId)
            notify.success(t("ui.git.init_ok", "Repository initialisiert"))
            await refresh()
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleCommit() {
        setBusy(true)
        try {
            const entry = await api.git.commit(bookId, message)
            notify.success(t("ui.git.commit_ok", "Commit erstellt") + `: ${entry.short_hash}`)
            setMessage("")
            await refresh()
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "nothing_to_commit") {
                notify.warning(t("ui.git.nothing_to_commit", "Keine Änderungen zu committen"))
                return
            }
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleSaveRemote() {
        if (!remoteUrlDraft.trim()) {
            notify.warning(t("ui.git.remote_url_required", "Remote-URL erforderlich"))
            return
        }
        setBusy(true)
        try {
            await api.git.setRemote(bookId, remoteUrlDraft.trim(), remotePatDraft || null)
            notify.success(t("ui.git.remote_saved", "Remote gespeichert"))
            setEditingRemote(false)
            setRemotePatDraft("")
            await refresh()
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleDeleteRemote() {
        setBusy(true)
        try {
            await api.git.deleteRemote(bookId)
            notify.success(t("ui.git.remote_deleted", "Remote entfernt"))
            await refresh()
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handlePush(force: boolean = false) {
        setBusy(true)
        try {
            await api.git.push(bookId, force)
            notify.success(
                force
                    ? t("ui.git.force_push_ok", "Force Push erfolgreich — Remote überschrieben")
                    : t("ui.git.push_ok", "Push erfolgreich"),
            )
            setConflictKind(null)
            await refresh()
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "remote_rejected") {
                // Open conflict dialog with both resolution options.
                setConflictKind("push_rejected")
                return
            }
            if (err instanceof ApiError && err.detailBody?.code === "remote_auth") {
                notify.error(t("ui.git.auth_failed", "Authentifizierung fehlgeschlagen. PAT prüfen."))
                return
            }
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleMergeRemote() {
        setBusy(true)
        try {
            const res: GitMergeResult = await api.git.merge(bookId)
            if (res.status === "merged" || res.status === "already_up_to_date") {
                notify.success(t("ui.git.merge_ok", "Merge erfolgreich"))
                setConflictKind(null)
                setConflictFiles([])
                setResolutions({})
                await refresh()
                return
            }
            if (res.status === "conflicts") {
                setConflictKind("diverged")
                setConflictFiles(res.files ?? [])
                const initial: Record<string, "mine" | "theirs"> = {}
                for (const path of res.files ?? []) initial[path] = "mine"
                setResolutions(initial)
                notify.warning(t(
                    "ui.git.conflicts_found",
                    "Konflikte gefunden — wähle pro Datei",
                ))
            }
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleResolveMerge() {
        setBusy(true)
        try {
            await api.git.resolveConflict(bookId, resolutions)
            notify.success(t("ui.git.merge_resolved", "Konflikte aufgelöst"))
            setConflictKind(null)
            setConflictFiles([])
            setResolutions({})
            await refresh()
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleAbortMerge() {
        setBusy(true)
        try {
            await api.git.abortMerge(bookId)
            notify.success(t("ui.git.merge_aborted", "Merge abgebrochen"))
            setConflictKind(null)
            setConflictFiles([])
            setResolutions({})
            await refresh()
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handlePull() {
        setBusy(true)
        try {
            const res = await api.git.pull(bookId)
            if (res.updated) {
                notify.success(t("ui.git.pull_ok", "Pull erfolgreich"))
            } else {
                notify.success(t("ui.git.pull_no_changes", "Bereits aktuell"))
            }
            setConflictKind(null)
            await refresh()
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "diverged") {
                setConflictKind("diverged")
                return
            }
            if (err instanceof ApiError && err.detailBody?.code === "remote_auth") {
                notify.error(t("ui.git.auth_failed", "Authentifizierung fehlgeschlagen. PAT prüfen."))
                return
            }
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content
                    className="dialog-content"
                    style={{maxWidth: 760, maxHeight: "85vh", overflowY: "auto"}}
                    data-testid="git-backup-dialog"
                >
                    <div
                        className="dialog-header"
                        data-testid="git-backup-header"
                        style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 2,
                            background: "var(--bg-card)",
                            paddingBottom: 8,
                            borderBottom: "1px solid var(--border)",
                        }}
                    >
                        <Dialog.Title className="dialog-title">
                            <GitBranch size={18} style={{verticalAlign: -3, marginRight: 8}}/>
                            {t("ui.git.title", "Git-Sicherung")}
                        </Dialog.Title>
                        <Dialog.Close className="dialog-close" aria-label={t("ui.common.close", "Schließen")}>
                            <X size={18}/>
                        </Dialog.Close>
                    </div>

                    {status && !status.initialized && (
                        <div style={{padding: 16}}>
                            <p style={{color: "var(--text-muted)", marginBottom: 12}}>
                                {t("ui.git.not_initialized", "Für dieses Buch ist noch kein Repository vorhanden. Initialisiere es, um Commits zu erstellen.")}
                            </p>
                            <button
                                className="btn btn-primary"
                                onClick={handleInit}
                                disabled={busy}
                                data-testid="git-init-btn"
                            >
                                <GitBranch size={14}/> {t("ui.git.init", "Repository initialisieren")}
                            </button>
                        </div>
                    )}

                    {status && status.initialized && (
                        <div style={{padding: 16, display: "flex", flexDirection: "column", gap: 16}}>
                            {/* Header: HEAD + sync status + refresh */}
                            <div style={{display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", flexWrap: "wrap"}}>
                                <span style={{color: "var(--text-muted)"}}>HEAD:</span>
                                <code style={{fontFamily: "var(--font-mono)"}}>{status.head_short_hash}</code>
                                {status.dirty && (
                                    <span style={{color: "var(--accent)", fontWeight: 500}}>
                                        {t("ui.git.dirty", "ungespeicherte Änderungen")} ({status.uncommitted_files})
                                    </span>
                                )}
                                {sync && <SyncBadge sync={sync}/>}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={refresh}
                                    title={t("ui.common.refresh", "Aktualisieren")}
                                    style={{marginLeft: "auto"}}
                                    data-testid="git-refresh-btn"
                                >
                                    <RefreshCw size={14}/>
                                </button>
                            </div>

                            {/* Remote config block */}
                            <div style={{padding: 12, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)"}}>
                                <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 8}}>
                                    {t("ui.git.remote", "Remote")}
                                </h3>
                                {!editingRemote && remote && remote.url && (
                                    <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
                                        <code style={{fontFamily: "var(--font-mono)", fontSize: "0.8125rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis"}}>
                                            {remote.url}
                                        </code>
                                        {remote.has_credential && (
                                            <span style={{fontSize: "0.75rem", color: "var(--accent)"}}>
                                                <Check size={12} style={{verticalAlign: -1}}/> PAT
                                            </span>
                                        )}
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handlePush()}
                                            disabled={busy}
                                            data-testid="git-push-btn"
                                        >
                                            <Upload size={14}/> {t("ui.git.push", "Push")}
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={handlePull}
                                            disabled={busy}
                                            data-testid="git-pull-btn"
                                        >
                                            <Download size={14}/> {t("ui.git.pull", "Pull")}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setEditingRemote(true)}
                                        >
                                            {t("ui.common.edit", "Bearbeiten")}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={handleDeleteRemote}
                                            disabled={busy}
                                            title={t("ui.git.remote_delete", "Remote entfernen")}
                                        >
                                            <Unplug size={14}/>
                                        </button>
                                    </div>
                                )}
                                {!editingRemote && remote && !remote.url && (
                                    <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                        <span style={{color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                                            {t("ui.git.no_remote", "Kein Remote konfiguriert.")}
                                        </span>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setEditingRemote(true)}
                                            data-testid="git-remote-configure-btn"
                                        >
                                            {t("ui.git.remote_configure", "Remote konfigurieren")}
                                        </button>
                                    </div>
                                )}
                                {editingRemote && (
                                    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                                        <div className="field">
                                            <label className="label">{t("ui.git.remote_url", "Remote-URL")}</label>
                                            <input
                                                className="input"
                                                value={remoteUrlDraft}
                                                onChange={(e) => setRemoteUrlDraft(e.target.value)}
                                                placeholder="https://github.com/user/my-book.git"
                                                style={{fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}
                                                data-testid="git-remote-url-input"
                                            />
                                        </div>
                                        <div className="field">
                                            <label className="label">
                                                {t("ui.git.remote_pat", "Personal Access Token")}
                                                {remote?.has_credential && (
                                                    <small style={{marginLeft: 6, color: "var(--text-muted)"}}>
                                                        ({t("ui.git.remote_pat_stored", "gespeichert — leer lassen zum Beibehalten")})
                                                    </small>
                                                )}
                                            </label>
                                            <input
                                                className="input"
                                                type="password"
                                                value={remotePatDraft}
                                                onChange={(e) => setRemotePatDraft(e.target.value)}
                                                placeholder="ghp_..."
                                                style={{fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}
                                                data-testid="git-remote-pat-input"
                                            />
                                            <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                                {t("ui.git.pat_hint", "Der PAT wird verschlüsselt gespeichert und nie zurückgegeben. Verwende ein privates Repository.")}
                                            </small>
                                        </div>
                                        <div style={{display: "flex", gap: 8}}>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={handleSaveRemote}
                                                disabled={busy}
                                                data-testid="git-remote-save-btn"
                                            >
                                                {t("ui.common.save", "Speichern")}
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                    setEditingRemote(false)
                                                    setRemoteUrlDraft(remote?.url ?? "")
                                                    setRemotePatDraft("")
                                                }}
                                                disabled={busy}
                                            >
                                                {t("ui.common.cancel", "Abbrechen")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Commit block */}
                            <div className="field">
                                <label className="label">{t("ui.git.commit_message", "Commit-Nachricht")}</label>
                                <input
                                    className="input"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder={t("ui.git.commit_message_placeholder", "Was hat sich geändert?")}
                                    disabled={busy}
                                    data-testid="git-commit-message"
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={handleCommit}
                                    disabled={busy}
                                    style={{marginTop: 8}}
                                    data-testid="git-commit-btn"
                                >
                                    <GitCommit size={14}/> {t("ui.git.commit", "Commit")}
                                </button>
                            </div>

                            <div>
                                <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 8}}>
                                    {t("ui.git.history", "Verlauf")} ({commits.length})
                                </h3>
                                {commits.length === 0 ? (
                                    <p style={{color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                                        {t("ui.git.no_commits", "Noch keine Commits.")}
                                    </p>
                                ) : (
                                    <ul style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8}}>
                                        {commits.map((c) => (
                                            <li
                                                key={c.hash}
                                                style={{padding: 10, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem"}}
                                                data-testid="git-commit-entry"
                                            >
                                                <div style={{display: "flex", gap: 8, alignItems: "baseline"}}>
                                                    <code style={{fontFamily: "var(--font-mono)", color: "var(--accent)"}}>{c.short_hash}</code>
                                                    <span style={{fontWeight: 500}}>{c.message.split("\n")[0]}</span>
                                                </div>
                                                <div style={{marginTop: 2, color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                                    {c.author} — {new Date(c.date).toLocaleString()}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {conflictKind && (
                        <ConflictResolution
                            kind={conflictKind}
                            busy={busy}
                            files={conflictFiles}
                            resolutions={resolutions}
                            onResolutionChange={(path, side) =>
                                setResolutions((prev) => ({...prev, [path]: side}))
                            }
                            onMerge={handleMergeRemote}
                            onResolve={handleResolveMerge}
                            onAbort={handleAbortMerge}
                            onAcceptLocal={() => handlePush(true)}
                            onCancel={() => {
                                setConflictKind(null)
                                setConflictFiles([])
                                setResolutions({})
                            }}
                        />
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}


function ConflictResolution({
    kind,
    busy,
    files,
    resolutions,
    onResolutionChange,
    onMerge,
    onResolve,
    onAbort,
    onAcceptLocal,
    onCancel,
}: {
    kind: "push_rejected" | "diverged"
    busy: boolean
    files: string[]
    resolutions: Record<string, "mine" | "theirs">
    onResolutionChange: (path: string, side: "mine" | "theirs") => void
    onMerge: () => void
    onResolve: () => void
    onAbort: () => void
    onAcceptLocal: () => void
    onCancel: () => void
}) {
    const {t} = useI18n()
    const inResolution = files.length > 0

    const title = inResolution
        ? t("ui.git.conflict_resolve_title", "Konflikte pro Datei auflösen")
        : kind === "push_rejected"
        ? t("ui.git.conflict_push_rejected_title", "Push abgelehnt")
        : t("ui.git.conflict_diverged_title", "Divergierte Historie")

    const body = inResolution
        ? t(
              "ui.git.conflict_resolve_body",
              "Pro betroffener Datei: lokale oder Remote-Version behalten. Danach wird ein Merge-Commit erzeugt.",
          )
        : kind === "push_rejected"
        ? t(
              "ui.git.conflict_push_rejected_body",
              "Das Remote hat neuere Commits, die lokal nicht vorhanden sind. Entscheide, welche Seite gewinnt:",
          )
        : t(
              "ui.git.conflict_diverged_body",
              "Beide Seiten haben eigene Commits. Wähle: mergen (bei Konflikten pro Datei entscheiden), Remote ignorieren (Force Push), oder abbrechen.",
          )

    return (
        <div
            style={{
                margin: "0 16px 16px",
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)",
            }}
            data-testid="git-conflict-resolution"
        >
            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 6}}>
                <AlertTriangle size={16} style={{color: "var(--accent)"}}/>
                <strong style={{fontSize: "0.9375rem"}}>{title}</strong>
            </div>
            <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 10}}>
                {body}
            </p>

            {inResolution ? (
                <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                    <ul
                        style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6}}
                        data-testid="git-conflict-file-list"
                    >
                        {files.map((path) => (
                            <li
                                key={path}
                                style={{
                                    padding: 8,
                                    background: "var(--bg-secondary)",
                                    borderRadius: "var(--radius-sm)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    fontSize: "0.8125rem",
                                }}
                                data-testid="git-conflict-file"
                            >
                                <code style={{fontFamily: "var(--font-mono)", fontSize: "0.75rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis"}}>
                                    {path}
                                </code>
                                <label style={{display: "flex", alignItems: "center", gap: 4, cursor: "pointer"}}>
                                    <input
                                        type="radio"
                                        name={`resolution-${path}`}
                                        checked={resolutions[path] === "mine"}
                                        onChange={() => onResolutionChange(path, "mine")}
                                        disabled={busy}
                                        data-testid={`git-conflict-mine-${path}`}
                                    />
                                    {t("ui.git.keep_mine", "Lokal")}
                                </label>
                                <label style={{display: "flex", alignItems: "center", gap: 4, cursor: "pointer"}}>
                                    <input
                                        type="radio"
                                        name={`resolution-${path}`}
                                        checked={resolutions[path] === "theirs"}
                                        onChange={() => onResolutionChange(path, "theirs")}
                                        disabled={busy}
                                        data-testid={`git-conflict-theirs-${path}`}
                                    />
                                    {t("ui.git.keep_theirs", "Remote")}
                                </label>
                            </li>
                        ))}
                    </ul>
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={onResolve}
                            disabled={busy}
                            data-testid="git-conflict-resolve-btn"
                        >
                            <Check size={14}/> {t("ui.git.apply_resolution", "Auflösung anwenden")}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={onAbort}
                            disabled={busy}
                            data-testid="git-conflict-abort-btn"
                        >
                            {t("ui.git.abort_merge", "Merge abbrechen")}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={onMerge}
                        disabled={busy}
                        data-testid="git-conflict-merge"
                    >
                        <Download size={14}/> {t("ui.git.merge", "Mergen")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                            if (confirm(t(
                                "ui.git.confirm_accept_local",
                                "Lokale Version auf Remote erzwingen? Die Remote-Commits werden überschrieben und sind danach weg.",
                            ))) {
                                onAcceptLocal()
                            }
                        }}
                        disabled={busy}
                        data-testid="git-conflict-accept-local"
                    >
                        <Upload size={14}/> {t("ui.git.accept_local", "Lokal erzwingen (Force Push)")}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        {t("ui.common.cancel", "Abbrechen")}
                    </button>
                </div>
            )}
        </div>
    )
}


function SyncBadge({sync}: {sync: GitSyncStatus}) {
    const {t} = useI18n()
    if (!sync.remote_configured) return null
    if (sync.state === "in_sync") {
        return (
            <span style={{color: "var(--accent)", fontSize: "0.75rem", fontWeight: 500}} data-testid="git-sync-in-sync">
                <Check size={12} style={{verticalAlign: -1}}/> {t("ui.git.in_sync", "synchron")}
            </span>
        )
    }
    if (sync.state === "local_ahead") {
        return (
            <span style={{color: "var(--text-muted)", fontSize: "0.75rem"}} data-testid="git-sync-local-ahead">
                <Upload size={12} style={{verticalAlign: -1}}/> {sync.ahead} {t("ui.git.ahead", "vorne")}
            </span>
        )
    }
    if (sync.state === "remote_ahead") {
        return (
            <span style={{color: "var(--accent)", fontSize: "0.75rem", fontWeight: 500}} data-testid="git-sync-remote-ahead">
                <Download size={12} style={{verticalAlign: -1}}/> {sync.behind} {t("ui.git.behind", "hinten")}
            </span>
        )
    }
    if (sync.state === "diverged") {
        return (
            <span style={{color: "var(--accent)", fontSize: "0.75rem", fontWeight: 500}} data-testid="git-sync-diverged">
                <AlertTriangle size={12} style={{verticalAlign: -1}}/> {t("ui.git.diverged_short", "divergiert")}
            </span>
        )
    }
    return (
        <span style={{color: "var(--text-muted)", fontSize: "0.75rem"}} data-testid="git-sync-never-synced">
            {t("ui.git.never_synced", "noch nicht synchronisiert")}
        </span>
    )
}


function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail || err.message
    if (err instanceof Error) return err.message
    return String(err)
}
