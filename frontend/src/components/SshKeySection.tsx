import {useEffect, useState} from "react"
import {Key, Copy, Trash2, RefreshCw} from "lucide-react"
import {api, ApiError, SshKeyInfo} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"

export default function SshKeySection() {
    const {t} = useI18n()
    const [info, setInfo] = useState<SshKeyInfo | null>(null)
    const [comment, setComment] = useState("")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        void refresh()
    }, [])

    async function refresh() {
        try {
            setInfo(await api.ssh.info())
        } catch (err) {
            notify.error(describeError(err))
        }
    }

    async function handleGenerate(overwrite: boolean = false) {
        setBusy(true)
        try {
            const next = await api.ssh.generate(comment || null, overwrite)
            setInfo(next)
            notify.success(t("ui.ssh.generated", "SSH-Schlüssel erzeugt"))
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "ssh_key_exists") {
                if (
                    confirm(t(
                        "ui.ssh.confirm_overwrite",
                        "Vorhandenen Schlüssel überschreiben? Der alte Schlüssel wird ungültig.",
                    ))
                ) {
                    await handleGenerate(true)
                }
                return
            }
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleDelete() {
        if (!confirm(t(
            "ui.ssh.confirm_delete",
            "Schlüssel löschen? Remote-Pushs über SSH funktionieren erst wieder nach neuer Erzeugung.",
        ))) {
            return
        }
        setBusy(true)
        try {
            await api.ssh.remove()
            setInfo({exists: false})
            notify.success(t("ui.ssh.deleted", "Schlüssel gelöscht"))
        } catch (err) {
            notify.error(describeError(err))
        } finally {
            setBusy(false)
        }
    }

    async function handleCopy() {
        if (!info?.public_key) return
        try {
            await navigator.clipboard.writeText(info.public_key)
            notify.success(t("ui.ssh.copied", "Schlüssel kopiert"))
        } catch {
            notify.error(t("ui.ssh.copy_failed", "Kopieren fehlgeschlagen"))
        }
    }

    if (!info) return null

    return (
        <div style={{marginTop: 16}} data-testid="ssh-key-section">
            <h2 style={{fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600, marginBottom: 8}}>
                <Key size={16} style={{verticalAlign: -2, marginRight: 6}}/>
                {t("ui.ssh.title", "SSH-Schlüssel für Git")}
            </h2>
            <div style={{background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16}}>
                <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12}}>
                    {t(
                        "ui.ssh.intro",
                        "Einmalig erzeugter Ed25519-Schlüssel. Der öffentliche Teil wird bei GitHub/GitLab/Gitea hinterlegt; der private Teil bleibt lokal (Dateirechte 0600).",
                    )}
                </p>

                {!info.exists && (
                    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                        <div className="field">
                            <label className="label">{t("ui.ssh.comment", "Kommentar (optional)")}</label>
                            <input
                                className="input"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="bibliogon"
                                disabled={busy}
                                data-testid="ssh-comment-input"
                            />
                            <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                {t("ui.ssh.comment_hint", "Wird im Host-UI als Schlüssel-Label angezeigt.")}
                            </small>
                        </div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleGenerate(false)}
                            disabled={busy}
                            data-testid="ssh-generate-btn"
                            style={{alignSelf: "flex-start"}}
                        >
                            <Key size={14}/> {t("ui.ssh.generate", "Schlüssel erzeugen")}
                        </button>
                    </div>
                )}

                {info.exists && (
                    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                        <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
                            <span style={{fontSize: "0.8125rem", color: "var(--text-muted)"}}>{info.type}</span>
                            {info.comment && (
                                <span style={{fontSize: "0.8125rem"}}>
                                    · {info.comment}
                                </span>
                            )}
                            {info.created_at && (
                                <span style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>
                                    · {new Date(info.created_at).toLocaleString()}
                                </span>
                            )}
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={refresh}
                                title={t("ui.common.refresh", "Aktualisieren")}
                                disabled={busy}
                                style={{marginLeft: "auto"}}
                            >
                                <RefreshCw size={14}/>
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={info.public_key ?? ""}
                            rows={3}
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                width: "100%",
                                padding: 8,
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-sm)",
                                resize: "vertical",
                            }}
                            data-testid="ssh-public-key"
                            onClick={(e) => e.currentTarget.select()}
                        />
                        <div style={{display: "flex", gap: 8}}>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleCopy}
                                disabled={busy}
                                data-testid="ssh-copy-btn"
                            >
                                <Copy size={14}/> {t("ui.ssh.copy", "Öffentlichen Schlüssel kopieren")}
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={handleDelete}
                                disabled={busy}
                                data-testid="ssh-delete-btn"
                            >
                                <Trash2 size={14}/> {t("ui.ssh.delete", "Löschen")}
                            </button>
                        </div>
                        <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                            {t(
                                "ui.ssh.host_hint",
                                "Füge diesen Schlüssel bei deinem Host ein (GitHub → Settings → SSH keys, GitLab → Preferences → SSH Keys).",
                            )}
                        </small>
                    </div>
                )}
            </div>
        </div>
    )
}


function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail || err.message
    if (err instanceof Error) return err.message
    return String(err)
}
