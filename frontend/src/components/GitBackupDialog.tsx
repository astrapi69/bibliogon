import {useEffect, useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {X, GitCommit, GitBranch, RefreshCw} from "lucide-react"
import {api, ApiError, GitCommitEntry, GitRepoStatus} from "../api/client"
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
    const [message, setMessage] = useState("")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        void refresh()
    }, [open, bookId])

    async function refresh() {
        try {
            const st = await api.git.status(bookId)
            setStatus(st)
            if (st.initialized) {
                setCommits(await api.git.log(bookId, 50))
            } else {
                setCommits([])
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

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content
                    className="dialog-content"
                    style={{maxWidth: 720, maxHeight: "85vh", overflowY: "auto"}}
                    data-testid="git-backup-dialog"
                >
                    <div className="dialog-header">
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
                            <div style={{display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem"}}>
                                <span style={{color: "var(--text-muted)"}}>HEAD:</span>
                                <code style={{fontFamily: "var(--font-mono)"}}>{status.head_short_hash}</code>
                                {status.dirty && (
                                    <span style={{color: "var(--accent)", fontWeight: 500}}>
                                        {t("ui.git.dirty", "ungespeicherte Änderungen")} ({status.uncommitted_files})
                                    </span>
                                )}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={refresh}
                                    title={t("ui.common.refresh", "Aktualisieren")}
                                    style={{marginLeft: "auto"}}
                                >
                                    <RefreshCw size={14}/>
                                </button>
                            </div>

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
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail || err.message
    if (err instanceof Error) return err.message
    return String(err)
}
