/**
 * KDP Publishing Wizard — Step 3: Export Package.
 *
 * Triggers the backend's ``POST /api/kdp/package/{book_id}``
 * endpoint, which builds the KDP-ready ZIP (per A4 layout) and
 * streams it back as a FileResponse. The component then triggers
 * a browser download.
 *
 * UX states:
 *   - Idle (initial)         — "Generate Package" button
 *   - Generating             — spinner + disabled button
 *   - Done                   — green confirmation + "Download
 *                              again" button (the first download
 *                              fires automatically)
 *   - Error                  — red banner + "Try again" button
 *
 * Phase 1 MVP: no real progress streaming (the backend builds
 * the ZIP synchronously). If Phase 2 introduces multi-minute
 * ARC + pricing pipelines, this is a natural seam to add SSE
 * + the AudiobookJobProvider-style ZSE-in-context pattern.
 */

import {useState} from "react"
import {Download, Loader2, CheckCircle, AlertCircle, Package} from "lucide-react"

import {BookDetail, ApiError, api} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import type {FormatState} from "./machines/types"

interface Props {
    book: BookDetail
    /** Wizard FormatStep selection. Threaded to the package endpoint
     *  so the bundled PDF is rendered at the chosen KDP trim size +
     *  margins (eBook → EPUB only, no PDF). */
    format: FormatState
    /** ExportPackage doesn't gate the wizard's Next button — it's
     *  the last step. The wizard shows Finish here regardless.
     *  Prop kept for shape-parity with Step 0 / Step 1. */
    onCanAdvanceChange: (canAdvance: boolean) => void
    /** C2 (per A11): parent-passed callback fired on the user's
     *  Generate-button click, BEFORE the API call. The wizard
     *  dispatches GENERATE on receipt; the machine transitions
     *  ``export → exporting``. Optional so per-step tests pass. */
    onGenerate?: () => void
    /** C2 machine-wiring: success report. Wizard dispatches
     *  EXPORT_SUCCESS. Optional. */
    onSuccess?: (filename: string, blobUrl: string) => void
    /** C2 machine-wiring: failure report. Wizard dispatches
     *  EXPORT_FAILED. Optional. */
    onFailed?: (error: {
        message: string
        context: "export"
        retryable: boolean
    }) => void
}

type State =
    | {kind: "idle"}
    | {kind: "generating"}
    | {kind: "done"; filename: string; lastBlobUrl: string}
    | {kind: "error"; message: string}

function triggerDownload(blob: Blob, filename: string): string {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    // Return URL so the caller can offer a "download again"
    // action without re-fetching. Revoked when state transitions
    // off the done branch.
    return url
}

export default function ExportPackage({
    book,
    format,
    onCanAdvanceChange,
    onGenerate,
    onSuccess,
    onFailed,
}: Props) {
    const {t} = useI18n()
    const [state, setState] = useState<State>({kind: "idle"})

    // Last step — Finish is always available. Report can-advance
    // = true once on mount so the wizard's nav contract is clean.
    // (Wizard renders "Finish" not "Next" on the last step, so
    // this prop is functionally a no-op here; preserved for
    // future parity with Phase 2 steps that may gate Finish.)
    if (state.kind === "idle") {
        onCanAdvanceChange(true)
    }

    const handleGenerate = async () => {
        // Revoke any prior blob URL before kicking off a new
        // generation; prevents memory leaks if the user clicks
        // "Generate" multiple times.
        if (state.kind === "done") {
            URL.revokeObjectURL(state.lastBlobUrl)
        }
        setState({kind: "generating"})
        // C2 machine-wire: tell parent we're starting BEFORE the
        // API call. Parent dispatches GENERATE → machine moves to
        // ``exporting`` state.
        onGenerate?.()
        try {
            const {blob, filename} = await api.kdp.buildPackage(book.id, {
                format_kind: format.kind,
                trim_size: format.trim_size,
                margin: format.margin,
            })
            const url = triggerDownload(blob, filename)
            setState({kind: "done", filename, lastBlobUrl: url})
            onSuccess?.(filename, url)
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : err instanceof Error
                    ? err.message
                    : t(
                          "ui.kdp_publishing_wizard.export_failed",
                          "Paket-Erstellung fehlgeschlagen.",
                      )
            setState({kind: "error", message})
            onFailed?.({message, context: "export", retryable: true})
        }
    }

    const handleDownloadAgain = () => {
        if (state.kind !== "done") return
        // The blob URL is still live; just trigger a new anchor
        // click. No second backend roundtrip.
        const link = document.createElement("a")
        link.href = state.lastBlobUrl
        link.download = state.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div
            style={styles.stepContent}
            data-testid="kdp-publishing-wizard-step-2-export"
        >
            <p style={styles.hint}>
                {t(
                    "ui.kdp_publishing_wizard.export_hint",
                    "Bibliogon erstellt ein ZIP mit Manuskript, Cover, Metadaten und einem KDP-Cover-Validierungsbericht. Bei KDP hochladen — Bibliogon lädt NICHT für dich hoch.",
                )}
            </p>

            <ul style={styles.contentList}>
                <li>
                    <Package size={14} /> manuscript-*.{"{epub,pdf}"}
                </li>
                <li>
                    <Package size={14} /> cover.{"{jpg,png,…}"}
                </li>
                <li>
                    <Package size={14} /> metadata.json
                </li>
                <li>
                    <Package size={14} /> cover-validation-report.json
                </li>
                <li>
                    <Package size={14} /> publishing-state-snapshot.json
                </li>
                <li>
                    <Package size={14} /> README.txt
                </li>
            </ul>

            {state.kind === "idle" && (
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    data-testid="kdp-publishing-wizard-step-2-generate"
                >
                    <Download size={14} />{" "}
                    {t(
                        "ui.kdp_publishing_wizard.export_generate",
                        "KDP-Paket erstellen",
                    )}
                </button>
            )}

            {state.kind === "generating" && (
                <div
                    style={styles.busyRow}
                    data-testid="kdp-publishing-wizard-step-2-generating"
                >
                    <Loader2
                        size={16}
                        style={{animation: "spin 1s linear infinite"}}
                    />
                    <span>
                        {t(
                            "ui.kdp_publishing_wizard.export_generating",
                            "Paket wird erstellt — das kann etwas dauern …",
                        )}
                    </span>
                </div>
            )}

            {state.kind === "done" && (
                <div
                    style={styles.summaryOk}
                    data-testid="kdp-publishing-wizard-step-2-done"
                >
                    <CheckCircle size={16} />{" "}
                    <span style={{flex: 1}}>
                        {t(
                            "ui.kdp_publishing_wizard.export_done",
                            "Paket erstellt + heruntergeladen.",
                        )}{" "}
                        <code
                            style={styles.codeChip}
                            data-testid="kdp-publishing-wizard-step-2-filename"
                        >
                            {state.filename}
                        </code>
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleDownloadAgain}
                        data-testid="kdp-publishing-wizard-step-2-download-again"
                    >
                        <Download size={14} />{" "}
                        {t(
                            "ui.kdp_publishing_wizard.export_download_again",
                            "Erneut herunterladen",
                        )}
                    </button>
                </div>
            )}

            {state.kind === "error" && (
                <div
                    style={styles.errorBanner}
                    data-testid="kdp-publishing-wizard-step-2-error"
                >
                    <AlertCircle size={16} />
                    <span style={{flex: 1}}>{state.message}</span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleGenerate}
                        data-testid="kdp-publishing-wizard-step-2-retry"
                    >
                        {t(
                            "ui.kdp_publishing_wizard.export_retry",
                            "Erneut versuchen",
                        )}
                    </button>
                </div>
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
    contentList: {
        listStyle: "none",
        padding: 0,
        margin: "0 0 20px",
        display: "grid",
        gap: 4,
        fontSize: "0.8125rem",
        color: "var(--text-primary)",
    },
    busyRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--text-muted)",
        padding: "12px 0",
    },
    summaryOk: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm, 4px)",
        background: "var(--success-light)",
        color: "var(--success, #15803d)",
        fontSize: "0.875rem",
    },
    codeChip: {
        background: "var(--surface-2, var(--bg-secondary))",
        padding: "2px 6px",
        borderRadius: "var(--radius-sm, 4px)",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "0.75rem",
    },
    errorBanner: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 12,
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.875rem",
    },
}
