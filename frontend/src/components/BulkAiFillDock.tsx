import {useEffect, useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {Sparkles, X, CheckCircle, AlertCircle, Clock, Loader2} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import {
    useBulkAiFillJob,
    type BulkFillItem,
} from "../contexts/BulkAiFillJobContext"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 7/10. Persistent
// dock for the active bulk AI-fill job, modeled on the
// audiobook dock pattern (lessons-learned: SSE listener in
// context, dock + modal as pure consumers).
//
// Layout:
// - Minimized: fixed bottom-right badge with progress bar +
//   "{done}/{total}", clickable to expand
// - Expanded: full-screen modal with per-item list

function formatCost(usd: number | null): string {
    if (usd == null) return "—"
    if (usd < 0.001) return "<$0.001"
    return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

function statusGlyph(status: BulkFillItem["status"]) {
    switch (status) {
        case "running":
            return <Loader2 size={14} className="spin" aria-hidden="true"/>
        case "done":
            return <CheckCircle size={14} style={{color: "var(--success, #16a34a)"}} aria-hidden="true"/>
        case "skipped":
            return <Clock size={14} style={{color: "var(--warning, #a16207)"}} aria-hidden="true"/>
        case "error":
            return <AlertCircle size={14} style={{color: "var(--danger, #b91c1c)"}} aria-hidden="true"/>
    }
}

export default function BulkAiFillDock() {
    const {t} = useI18n()
    const job = useBulkAiFillJob()
    const [autoExpandedOnce, setAutoExpandedOnce] = useState(false)

    // When a fresh job starts the modal is already open via the
    // context's ``start`` action. The dock cares about the
    // running -> completed transition: if the user minimized
    // mid-run, do NOT re-expand on completion (they're working
    // elsewhere); leave the dock as the only surface so the
    // success toast + status badge tell the story. The
    // auto-expand-once gate is a safety net for the very first
    // event so the dock never starts in a confusing "0/0 idle"
    // state when the user reloaded mid-job.
    useEffect(() => {
        if (job.active && job.total > 0 && !autoExpandedOnce) {
            setAutoExpandedOnce(true)
        }
    }, [job.active, job.total, autoExpandedOnce])

    if (!job.active) return null

    const percent = job.total > 0
        ? Math.round((job.completed / job.total) * 100)
        : 0

    const headline = (() => {
        if (job.phase === "completed") {
            return t(
                "ui.bulk_ai_fill.dock.completed",
                "AI-fill complete: {updated}/{total} updated",
            )
                .replace("{updated}", String(job.itemsUpdated))
                .replace("{total}", String(job.total))
        }
        if (job.phase === "failed") {
            return t("ui.bulk_ai_fill.dock.failed", "AI-fill failed")
        }
        if (job.phase === "cancelled") {
            return t("ui.bulk_ai_fill.dock.cancelled", "AI-fill cancelled")
        }
        return t(
            "ui.bulk_ai_fill.dock.running",
            "AI-fill: {done}/{total}",
        )
            .replace("{done}", String(job.completed))
            .replace("{total}", String(job.total))
    })()

    return (
        <>
            {/* Minimized dock - bottom-right badge */}
            {!job.modalOpen && (
                <button
                    type="button"
                    className="bulk-ai-fill-dock"
                    data-testid="bulk-ai-fill-dock"
                    onClick={job.expand}
                    style={{
                        position: "fixed",
                        bottom: 16,
                        left: 16,
                        zIndex: 1000,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border, #d1d5db)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        cursor: "pointer",
                        minWidth: 260,
                        textAlign: "left",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 6,
                        }}
                    >
                        <Sparkles size={14}/>
                        <span style={{fontWeight: 600, fontSize: "0.875rem"}}>
                            {headline}
                        </span>
                    </div>
                    <div
                        data-testid="bulk-ai-fill-dock-bar"
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        style={{
                            background: "var(--surface-2, #e5e7eb)",
                            borderRadius: 4,
                            height: 6,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                width: `${percent}%`,
                                height: "100%",
                                background:
                                    job.phase === "failed"
                                        ? "var(--danger, #b91c1c)"
                                        : "var(--accent, #2563eb)",
                                transition: "width 0.2s",
                            }}
                        />
                    </div>
                    {job.projectedTotalCostUsd != null && job.phase === "running" && (
                        <div
                            data-testid="bulk-ai-fill-dock-projection"
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted, #6b7280)",
                                marginTop: 4,
                            }}
                        >
                            {t(
                                "ui.bulk_ai_fill.dock.projected",
                                "~{cost} projected",
                            ).replace("{cost}", formatCost(job.projectedTotalCostUsd))}
                        </div>
                    )}
                    {job.currentTitle && job.phase === "running" && (
                        <div
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted, #6b7280)",
                                marginTop: 4,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {job.currentTitle}
                        </div>
                    )}
                </button>
            )}

            {/* Expanded modal */}
            <Dialog.Root
                open={job.modalOpen}
                onOpenChange={(open) => { if (!open) job.minimize() }}
            >
                <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay"/>
                    <Dialog.Content
                        className="dialog-content dialog-content-wide"
                        data-testid="bulk-ai-fill-modal"
                        onEscapeKeyDown={job.minimize}
                    >
                        <div className="dialog-header">
                            <Dialog.Title className="dialog-title">
                                {headline}
                            </Dialog.Title>
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={job.minimize}
                                    aria-label={t("ui.common.minimize", "Minimieren")}
                                >
                                    <X size={16}/>
                                </button>
                            </Dialog.Close>
                        </div>
                        <Dialog.Description className="dialog-message">
                            {t(
                                "ui.bulk_ai_fill.modal.description",
                                "Live progress per item. The job keeps running if you close this modal.",
                            )}
                        </Dialog.Description>

                        <div
                            style={{
                                marginTop: 12,
                                padding: "8px 12px",
                                background: "var(--surface-2, #f5f5f5)",
                                borderRadius: 6,
                                display: "flex",
                                gap: 16,
                                flexWrap: "wrap",
                                fontSize: "0.875rem",
                            }}
                            data-testid="bulk-ai-fill-modal-totals"
                        >
                            <div>
                                <strong>
                                    {t("ui.bulk_ai_fill.modal.total_label", "Items:")}
                                </strong>{" "}
                                {job.completed} / {job.total}
                            </div>
                            <div>
                                <strong>
                                    {t("ui.bulk_ai_fill.modal.updated_label", "Updated:")}
                                </strong>{" "}
                                {job.itemsUpdated}
                            </div>
                            <div>
                                <strong>
                                    {t("ui.bulk_ai_fill.modal.tokens_label", "Tokens:")}
                                </strong>{" "}
                                {job.totalTokens.toLocaleString()}
                            </div>
                            <div>
                                <strong>
                                    {t("ui.bulk_ai_fill.modal.cost_label", "Cost:")}
                                </strong>{" "}
                                {formatCost(job.totalCostUsd)}
                            </div>
                            {job.phase === "running" && job.costPerItemUsd != null && (
                                <div data-testid="bulk-ai-fill-modal-per-item">
                                    <strong>
                                        {t(
                                            "ui.bulk_ai_fill.modal.per_item_label",
                                            "Per item:",
                                        )}
                                    </strong>{" "}
                                    ~{formatCost(job.costPerItemUsd)}
                                </div>
                            )}
                            {job.phase === "running" && job.projectedTotalCostUsd != null && (
                                <div data-testid="bulk-ai-fill-modal-projected">
                                    <strong>
                                        {t(
                                            "ui.bulk_ai_fill.modal.projected_label",
                                            "Projected:",
                                        )}
                                    </strong>{" "}
                                    ~{formatCost(job.projectedTotalCostUsd)}
                                </div>
                            )}
                        </div>

                        {job.errorMessage && (
                            <div
                                style={{
                                    marginTop: 12,
                                    padding: "8px 12px",
                                    background: "var(--danger-bg, #fef2f2)",
                                    color: "var(--danger, #b91c1c)",
                                    borderRadius: 6,
                                    fontSize: "0.875rem",
                                }}
                                data-testid="bulk-ai-fill-modal-error"
                            >
                                {job.errorMessage}
                            </div>
                        )}

                        <div
                            style={{
                                marginTop: 12,
                                maxHeight: 380,
                                overflowY: "auto",
                                border: "1px solid var(--border, #e5e7eb)",
                                borderRadius: 6,
                            }}
                            data-testid="bulk-ai-fill-modal-items"
                        >
                            {job.items.length === 0 ? (
                                <div
                                    style={{
                                        padding: 16,
                                        textAlign: "center",
                                        color: "var(--text-muted, #6b7280)",
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    {t(
                                        "ui.bulk_ai_fill.modal.no_items_yet",
                                        "Waiting for the first item to start...",
                                    )}
                                </div>
                            ) : (
                                job.items.map((it) => (
                                    <div
                                        key={`${it.id}-${it.index}`}
                                        data-testid={`bulk-ai-fill-item-${it.id}`}
                                        data-status={it.status}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "6px 12px",
                                            borderBottom: "1px solid var(--border, #f3f4f6)",
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {statusGlyph(it.status)}
                                        <div
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                            title={it.title || it.id}
                                        >
                                            {it.title || it.id}
                                        </div>
                                        {it.status === "done" && it.updatedFields && (
                                            <span
                                                style={{
                                                    color: "var(--text-muted, #6b7280)",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {it.updatedFields.length} updated
                                                {it.tokens != null && `, ${it.tokens} tok`}
                                                {it.droppedSummaries && it.droppedSummaries > 0 ? (
                                                    `, ${it.droppedSummaries} dropped`
                                                ) : null}
                                            </span>
                                        )}
                                        {it.status === "skipped" && (
                                            <span style={{color: "var(--warning, #a16207)", fontSize: "0.75rem"}}>
                                                {it.skipReason}
                                            </span>
                                        )}
                                        {it.status === "error" && (
                                            <span
                                                style={{
                                                    color: "var(--danger, #b91c1c)",
                                                    fontSize: "0.75rem",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    maxWidth: 200,
                                                }}
                                                title={it.error}
                                            >
                                                {it.error}
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="dialog-footer" style={{marginTop: 16}}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={job.minimize}
                                data-testid="bulk-ai-fill-modal-minimize"
                            >
                                {t("ui.bulk_ai_fill.modal.minimize", "Minimize")}
                            </button>
                            {(job.phase === "completed" ||
                                job.phase === "failed" ||
                                job.phase === "cancelled") && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={job.clear}
                                    data-testid="bulk-ai-fill-modal-dismiss"
                                >
                                    {t("ui.bulk_ai_fill.modal.dismiss", "Dismiss")}
                                </button>
                            )}
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    )
}
