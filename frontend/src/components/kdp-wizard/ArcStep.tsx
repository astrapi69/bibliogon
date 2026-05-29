/**
 * KDP Publishing Wizard — Step 4: ARC Reviewers (C9).
 *
 * Wizard-only surface (per A23 — no BookMetadataEditor tab).
 * Authors track Advance Reader Copy reviewers through a linear
 * status machine: invited → sent → received → reviewed |
 * declined.
 *
 * Server-driven: this component owns its loading state but the
 * source of truth is the C6 ARC reviewer endpoints
 * (``/api/kdp/publishing-state/{book_id}/reviewers``). Each
 * action (add / status-change / delete) round-trips through the
 * server + refreshes the local list.
 *
 * Email integration is OUT-OF-SCOPE for v1 (per A16). The
 * mailto: button is the only email surface; the user composes
 * outbound mail in their own client. Filed for future polish:
 * ``ARC-MAILTO-LINK-01`` P5.
 *
 * No machine context for reviewers: ``arc`` state is just a
 * navigation marker. ADVANCE from arc is unguarded — reviewers
 * are optional.
 */

import {useEffect, useState} from "react"
import {AlertCircle, Loader2, Mail, Trash2, UserPlus} from "lucide-react"

import {
    ApiError,
    ArcReviewerApi,
    BookDetail,
    ReviewStatus,
    api,
} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"

interface Props {
    book: BookDetail
    /** Optional callback for parity with the other per-step
     *  components. The arc machine state has no guard; reviewers
     *  are optional. Kept for shape consistency. */
    onCanAdvanceChange?: (canAdvance: boolean) => void
    /** Optional callback fired with the latest reviewer count.
     *  Future C12 may use this for a wizard-header badge. */
    onReviewerCountChange?: (count: number) => void
}

const STATUS_ORDER: ReviewStatus[] = [
    "invited",
    "sent",
    "received",
    "reviewed",
    "declined",
]

export default function ArcStep({book, onReviewerCountChange}: Props) {
    const {t} = useI18n()
    const [reviewers, setReviewers] = useState<ArcReviewerApi[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [addName, setAddName] = useState("")
    const [addEmail, setAddEmail] = useState("")
    const [adding, setAdding] = useState(false)

    const refresh = async () => {
        try {
            const rows = await api.kdp.listReviewers(book.id)
            setReviewers(rows)
            onReviewerCountChange?.(rows.length)
            setError(null)
        } catch (e) {
            const message =
                e instanceof ApiError
                    ? e.detail
                    : e instanceof Error
                    ? e.message
                    : t(
                          "ui.kdp_publishing_wizard.arc_load_failed",
                          "Reviewer-Liste konnte nicht geladen werden.",
                      )
            setError(message)
        }
    }

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        refresh()
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // book.id triggers refetch on book switch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id])

    const handleAdd = async () => {
        const name = addName.trim()
        if (!name) return
        setAdding(true)
        try {
            await api.kdp.addReviewer(book.id, {
                reviewer_name: name,
                reviewer_email: addEmail.trim() || null,
            })
            setAddName("")
            setAddEmail("")
            await refresh()
        } catch (e) {
            const message =
                e instanceof ApiError ? e.detail : "Add reviewer failed"
            setError(message)
        } finally {
            setAdding(false)
        }
    }

    const handleStatusChange = async (
        reviewerId: string,
        status: ReviewStatus,
    ) => {
        try {
            await api.kdp.updateReviewer(book.id, reviewerId, {
                review_status: status,
            })
            await refresh()
        } catch (e) {
            const message =
                e instanceof ApiError ? e.detail : "Status update failed"
            setError(message)
        }
    }

    const handleDelete = async (reviewerId: string) => {
        try {
            await api.kdp.deleteReviewer(book.id, reviewerId)
            await refresh()
        } catch (e) {
            const message =
                e instanceof ApiError ? e.detail : "Delete failed"
            setError(message)
        }
    }

    if (loading) {
        return (
            <div
                style={styles.stepContent}
                data-testid="kdp-publishing-wizard-step-3-arc"
            >
                <div style={styles.loadingRow}>
                    <Loader2
                        size={16}
                        style={{animation: "spin 1s linear infinite"}}
                    />
                    <span>
                        {t(
                            "ui.kdp_publishing_wizard.arc_loading",
                            "Reviewer-Liste wird geladen …",
                        )}
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div
            style={styles.stepContent}
            data-testid="kdp-publishing-wizard-step-3-arc"
        >
            <p style={styles.hint}>
                {t(
                    "ui.kdp_publishing_wizard.arc_hint",
                    "Optionale Verfolgung deiner Vorab-Rezensent:innen. Statuswerte werden manuell gepflegt; E-Mail-Versand passiert in deinem Mailprogramm.",
                )}
            </p>

            {error && (
                <div
                    style={styles.errorBanner}
                    data-testid="kdp-publishing-wizard-step-3-error"
                >
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            {/* Add-reviewer form */}
            <div style={styles.addForm}>
                <input
                    type="text"
                    placeholder={t(
                        "ui.kdp_publishing_wizard.arc_name_placeholder",
                        "Name",
                    )}
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    style={styles.input}
                    data-testid="kdp-publishing-wizard-step-3-add-name"
                />
                <input
                    type="email"
                    placeholder={t(
                        "ui.kdp_publishing_wizard.arc_email_placeholder",
                        "E-Mail (optional)",
                    )}
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    style={styles.input}
                    data-testid="kdp-publishing-wizard-step-3-add-email"
                />
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAdd}
                    disabled={!addName.trim() || adding}
                    data-testid="kdp-publishing-wizard-step-3-add-submit"
                >
                    <UserPlus size={14} />{" "}
                    {t("ui.kdp_publishing_wizard.arc_add", "Hinzufügen")}
                </button>
            </div>

            {/* Reviewer list */}
            {reviewers.length === 0 ? (
                <div
                    style={styles.emptyState}
                    data-testid="kdp-publishing-wizard-step-3-empty"
                >
                    {t(
                        "ui.kdp_publishing_wizard.arc_empty",
                        "Noch keine Reviewer hinterlegt. Du kannst diesen Schritt überspringen.",
                    )}
                </div>
            ) : (
                <ul
                    style={styles.list}
                    data-testid="kdp-publishing-wizard-step-3-list"
                >
                    {reviewers.map((r) => (
                        <li
                            key={r.id}
                            style={styles.row}
                            data-testid={`kdp-publishing-wizard-step-3-row-${r.id}`}
                        >
                            <div style={styles.rowMain}>
                                <span style={styles.rowName}>
                                    {r.reviewer_name}
                                </span>
                                {r.reviewer_email && (
                                    <span style={styles.rowEmail}>
                                        {r.reviewer_email}
                                    </span>
                                )}
                            </div>
                            <div style={styles.rowActions}>
                                <select
                                    value={r.review_status}
                                    onChange={(e) =>
                                        handleStatusChange(
                                            r.id,
                                            e.target.value as ReviewStatus,
                                        )
                                    }
                                    style={styles.statusSelect}
                                    data-testid={`kdp-publishing-wizard-step-3-status-${r.id}`}
                                >
                                    {STATUS_ORDER.map((s) => (
                                        <option key={s} value={s}>
                                            {t(
                                                `ui.kdp_publishing_wizard.arc_status_${s}`,
                                                s,
                                            )}
                                        </option>
                                    ))}
                                </select>
                                {r.reviewer_email && (
                                    <a
                                        href={`mailto:${r.reviewer_email}?subject=${encodeURIComponent(
                                            t(
                                                "ui.kdp_publishing_wizard.arc_mailto_subject",
                                                `ARC-Anfrage: ${book.title}`,
                                            ),
                                        )}`}
                                        style={styles.iconButton}
                                        aria-label={t(
                                            "ui.kdp_publishing_wizard.arc_send_mail",
                                            "E-Mail verfassen",
                                        )}
                                        data-testid={`kdp-publishing-wizard-step-3-mailto-${r.id}`}
                                    >
                                        <Mail size={14} />
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleDelete(r.id)}
                                    style={styles.iconButton}
                                    aria-label={t(
                                        "ui.common.delete",
                                        "Löschen",
                                    )}
                                    data-testid={`kdp-publishing-wizard-step-3-delete-${r.id}`}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    stepContent: {
        minHeight: 280,
    },
    hint: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
    },
    loadingRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--text-muted)",
        padding: "16px 0",
    },
    errorBanner: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 10,
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius-sm, 4px)",
        marginBottom: 12,
        fontSize: "0.8125rem",
    },
    addForm: {
        display: "flex",
        gap: 8,
        alignItems: "stretch",
        marginBottom: 16,
        flexWrap: "wrap",
    },
    input: {
        flex: 1,
        minWidth: "8em",
        padding: "6px 8px",
        fontSize: "0.875rem",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
    },
    emptyState: {
        padding: "16px 12px",
        background: "var(--surface-2, var(--bg-secondary))",
        color: "var(--text-muted)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.875rem",
        textAlign: "center",
    },
    list: {
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gap: 8,
    },
    row: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        background: "var(--surface-2, var(--bg-secondary))",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.875rem",
    },
    rowMain: {
        display: "flex",
        flexDirection: "column",
        gap: 2,
        flex: 1,
        minWidth: 0,
    },
    rowName: {
        fontWeight: 600,
        color: "var(--text-primary)",
    },
    rowEmail: {
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono, monospace)",
    },
    rowActions: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    statusSelect: {
        padding: "2px 6px",
        fontSize: "0.75rem",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
    },
    iconButton: {
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: 4,
        color: "var(--text-muted)",
        cursor: "pointer",
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    },
}
