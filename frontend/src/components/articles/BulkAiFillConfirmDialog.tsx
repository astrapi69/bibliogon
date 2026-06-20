import {useEffect, useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {X, AlertCircle, Loader2, ChevronDown, ChevronRight} from "lucide-react"
import {useI18n} from "../../hooks/useI18n"
import {notify} from "../../utils/notify"
import {
    api,
    ApiError,
    type BulkAiFillEstimate,
    type BulkAiFillEstimateItem,
} from "../../api/client"
import {
    useBulkAiFillJob,
    type BulkFillKind,
} from "../../contexts/BulkAiFillJobContext"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 8/10. Confirm
// dialog that bridges FieldClassDialog and the actual job
// kickoff. Calls /estimate, renders per-item breakdown (per
// the F4 carry-forward decision), Confirm -> /start -> hand
// off to BulkAiFillJobContext.

/** F4 threshold (caller-confirmed): inline per-item table for
 *  selections below this, summary + disclosure above. Easy
 *  adjustment if UX feedback says 5 or 15 fits better. */
export const INLINE_BREAKDOWN_THRESHOLD = 10

interface Props {
    open: boolean
    onClose: () => void
    kind: BulkFillKind
    ids: string[]
    fieldClasses: string[]
    force: boolean
    inlineImageCount?: number | null
}

function formatCost(usd: number | null | undefined): string {
    if (usd == null) return "—"
    if (usd < 0.001) return "<$0.001"
    return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

function formatTokens(n: number): string {
    return n.toLocaleString()
}

function PerItemTable({items}: {items: BulkAiFillEstimateItem[]}) {
    return (
        <div
            data-testid="bulk-fill-estimate-per-item"
            style={{
                marginTop: 8,
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 6,
                maxHeight: 360,
                overflowY: "auto",
                fontSize: "0.8125rem",
            }}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 1fr) 80px 80px 90px",
                    background: "var(--surface-2, #f5f5f5)",
                    padding: "6px 10px",
                    fontWeight: 600,
                    borderBottom: "1px solid var(--border, #e5e7eb)",
                    position: "sticky",
                    top: 0,
                }}
            >
                <div>Item</div>
                <div style={{textAlign: "right"}}>Input tok</div>
                <div style={{textAlign: "right"}}>Output tok</div>
                <div style={{textAlign: "right"}}>Cost</div>
            </div>
            {items.map((it) => (
                <div
                    key={it.id}
                    data-testid={`bulk-fill-estimate-item-${it.id}`}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 1fr) 80px 80px 90px",
                        padding: "6px 10px",
                        borderBottom: "1px solid var(--border, #f3f4f6)",
                    }}
                >
                    <div
                        style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                        title={it.title}
                    >
                        {it.title}
                        {it.chapter_count != null && (
                            <span
                                style={{
                                    color: "var(--text-muted, #6b7280)",
                                    marginLeft: 6,
                                    fontSize: "0.75rem",
                                }}
                            >
                                ({it.chapter_count} ch)
                            </span>
                        )}
                    </div>
                    <div style={{textAlign: "right", fontFamily: "monospace"}}>
                        {formatTokens(it.estimated_input_tokens)}
                    </div>
                    <div style={{textAlign: "right", fontFamily: "monospace"}}>
                        {formatTokens(it.estimated_output_tokens)}
                    </div>
                    <div style={{textAlign: "right", fontFamily: "monospace"}}>
                        {formatCost(it.estimated_cost_usd)}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default function BulkAiFillConfirmDialog({
    open,
    onClose,
    kind,
    ids,
    fieldClasses,
    force,
    inlineImageCount,
}: Props) {
    const {t} = useI18n()
    const job = useBulkAiFillJob()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [estimate, setEstimate] = useState<BulkAiFillEstimate | null>(null)
    const [starting, setStarting] = useState(false)
    const [breakdownExpanded, setBreakdownExpanded] = useState(false)

    // Fetch the estimate every time the dialog opens. Closing +
    // reopening recomputes; backend treats each call as
    // independent so the estimate freshness reflects whatever
    // the user just changed in FieldClassDialog.
    useEffect(() => {
        if (!open) {
            setEstimate(null)
            setError(null)
            setBreakdownExpanded(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        const ns = kind === "article" ? api.articles : api.books
        ns.bulkAiFill
            .estimate({
                ids,
                field_classes: fieldClasses,
                inline_image_count: inlineImageCount ?? null,
            })
            .then((r) => {
                if (!cancelled) {
                    setEstimate(r)
                    setLoading(false)
                }
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setLoading(false)
                const detail =
                    err instanceof ApiError
                        ? err.detail
                        : t(
                              "ui.bulk_ai_fill.estimate.error",
                              "Could not fetch the cost estimate",
                          )
                setError(detail)
            })
        return () => {
            cancelled = true
        }
        // ``t`` intentionally omitted from deps: the i18n hook
        // returns a fresh ``t`` function on every render so
        // including it would cancel + refetch on every parent
        // re-render. The fallback message is what users see
        // in tests anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, kind, ids, fieldClasses, inlineImageCount])

    const handleConfirm = async () => {
        setStarting(true)
        try {
            const ns = kind === "article" ? api.articles : api.books
            const result = await ns.bulkAiFill.start({
                ids,
                field_classes: fieldClasses,
                force,
                inline_image_count: inlineImageCount ?? null,
            })
            job.start(result.job_id, kind)
            onClose()
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.bulk_ai_fill.start.error",
                          "Could not start the bulk AI-fill job",
                      )
            notify.error(detail, err)
        } finally {
            setStarting(false)
        }
    }

    const renderBreakdown = () => {
        if (!estimate) return null
        const compact = estimate.items.length < INLINE_BREAKDOWN_THRESHOLD
        if (compact) {
            return <PerItemTable items={estimate.items}/>
        }
        return (
            <div style={{marginTop: 8}}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBreakdownExpanded((v) => !v)}
                    data-testid="bulk-fill-estimate-breakdown-toggle"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "0.875rem",
                    }}
                >
                    {breakdownExpanded ? (
                        <ChevronDown size={14}/>
                    ) : (
                        <ChevronRight size={14}/>
                    )}
                    {t(
                        "ui.bulk_ai_fill.estimate.breakdown_toggle",
                        "Per-item breakdown",
                    )}
                </button>
                {breakdownExpanded && <PerItemTable items={estimate.items}/>}
            </div>
        )
    }

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(o) => {
                if (!o && !starting) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content
                    className="dialog-content dialog-content-wide"
                    data-testid="bulk-ai-fill-confirm-dialog"
                    onEscapeKeyDown={() => !starting && onClose()}
                >
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            {t(
                                "ui.bulk_ai_fill.confirm.title",
                                "Confirm AI-fill estimate",
                            )}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                className="btn-icon"
                                onClick={onClose}
                                aria-label={t("ui.common.close", "Schließen")}
                                disabled={starting}
                            >
                                <X size={16}/>
                            </button>
                        </Dialog.Close>
                    </div>
                    <Dialog.Description className="dialog-message">
                        {t(
                            "ui.bulk_ai_fill.confirm.description",
                            "The AI will be called once per item per selected class. Review the cost below before confirming.",
                        )}
                    </Dialog.Description>

                    {loading && (
                        <div
                            data-testid="bulk-fill-estimate-loading"
                            style={{
                                marginTop: 12,
                                padding: 16,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                color: "var(--text-muted, #6b7280)",
                            }}
                        >
                            <Loader2 size={16} className="spin"/>
                            <span>
                                {t(
                                    "ui.bulk_ai_fill.estimate.loading",
                                    "Estimating cost...",
                                )}
                            </span>
                        </div>
                    )}

                    {error && (
                        <div
                            data-testid="bulk-fill-estimate-error"
                            style={{
                                marginTop: 12,
                                padding: "8px 12px",
                                background: "var(--danger-bg, #fef2f2)",
                                color: "var(--danger, #b91c1c)",
                                borderRadius: 6,
                                fontSize: "0.875rem",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            <AlertCircle size={14}/>
                            <span>{error}</span>
                        </div>
                    )}

                    {estimate && (
                        <>
                            <div
                                data-testid="bulk-fill-estimate-totals"
                                style={{
                                    marginTop: 12,
                                    padding: "10px 14px",
                                    background: "var(--surface-2, #f5f5f5)",
                                    borderRadius: 6,
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                                    gap: 12,
                                    fontSize: "0.875rem",
                                }}
                            >
                                <div>
                                    <div style={{color: "var(--text-muted, #6b7280)", fontSize: "0.75rem"}}>
                                        {t("ui.bulk_ai_fill.estimate.items_label", "Items")}
                                    </div>
                                    <div style={{fontWeight: 600}}>
                                        {estimate.totals.total_items}
                                    </div>
                                </div>
                                <div>
                                    <div style={{color: "var(--text-muted, #6b7280)", fontSize: "0.75rem"}}>
                                        {t("ui.bulk_ai_fill.estimate.calls_label", "LLM calls")}
                                    </div>
                                    <div style={{fontWeight: 600}}>
                                        {estimate.totals.total_field_class_calls}
                                    </div>
                                </div>
                                <div>
                                    <div style={{color: "var(--text-muted, #6b7280)", fontSize: "0.75rem"}}>
                                        {t("ui.bulk_ai_fill.estimate.input_tokens_label", "Input tok")}
                                    </div>
                                    <div style={{fontWeight: 600, fontFamily: "monospace"}}>
                                        {formatTokens(estimate.totals.estimated_input_tokens)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{color: "var(--text-muted, #6b7280)", fontSize: "0.75rem"}}>
                                        {t("ui.bulk_ai_fill.estimate.output_tokens_label", "Output tok")}
                                    </div>
                                    <div style={{fontWeight: 600, fontFamily: "monospace"}}>
                                        {formatTokens(estimate.totals.estimated_output_tokens)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{color: "var(--text-muted, #6b7280)", fontSize: "0.75rem"}}>
                                        {t("ui.bulk_ai_fill.estimate.cost_label", "Estimated cost")}
                                    </div>
                                    <div
                                        style={{fontWeight: 600, fontFamily: "monospace"}}
                                        data-testid="bulk-fill-estimate-cost"
                                    >
                                        {formatCost(estimate.totals.estimated_cost_usd)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{color: "var(--text-muted, #6b7280)", fontSize: "0.75rem"}}>
                                        {t("ui.bulk_ai_fill.estimate.model_label", "Model")}
                                    </div>
                                    <div style={{fontWeight: 600, fontFamily: "monospace"}}>
                                        {estimate.model || "—"}
                                    </div>
                                </div>
                            </div>
                            {estimate.totals.estimated_cost_usd == null && (
                                <div
                                    style={{
                                        marginTop: 8,
                                        fontSize: "0.75rem",
                                        color: "var(--text-muted, #6b7280)",
                                    }}
                                >
                                    {t(
                                        "ui.bulk_ai_fill.estimate.cost_unknown",
                                        "Cost is unknown because the configured model is not in the pricing table.",
                                    )}
                                </div>
                            )}
                            {renderBreakdown()}
                        </>
                    )}

                    <div className="dialog-footer" style={{marginTop: 16}}>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onClose}
                            disabled={starting}
                            data-testid="bulk-fill-confirm-cancel"
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleConfirm}
                            disabled={!estimate || starting}
                            data-testid="bulk-fill-confirm-start"
                        >
                            {starting
                                ? t("ui.bulk_ai_fill.confirm.starting", "Starting...")
                                : t("ui.bulk_ai_fill.confirm.start", "Start AI-fill")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
