import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import type {ReactNode} from "react"
import {api, type BulkAiFillEvent} from "../api/client"

/**
 * UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 7/10.
 *
 * Global state for the active bulk AI-fill job. Mirrors the
 * AudiobookJobContext pattern (commit 6 of session 2 hooks into
 * the same lessons-learned about putting the SSE listener in the
 * context, not the modal):
 *
 *   - SSE listener lives HERE so the dock + the expanded modal
 *     are both pure consumers
 *   - jobId + kind persisted to localStorage; an F5 reload
 *     reconnects to the same /stream path
 *   - one active job at a time; ``start`` replaces any previous
 *
 * The kind ("article" or "book") drives the URL the EventSource
 * subscribes to and the API namespace cancel + status calls go
 * through. Without it the F5 recovery would not know which
 * endpoint to reconnect to.
 */

export type BulkFillKind = "article" | "book"

export type BulkFillPhase =
    | "idle"
    | "connecting"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"

interface BulkAiFillJobContextValue {
    active: boolean
    jobId: string | null
    kind: BulkFillKind | null
    phase: BulkFillPhase
    /** Total items reported by the start event. */
    total: number
    /** Highest item index seen across item_done / item_skipped /
     *  item_error events. Drives the progress bar. */
    completed: number
    /** Items the worker actually updated (subset of completed). */
    itemsUpdated: number
    totalTokens: number
    /** Sum of per-item ``cost_usd`` when reported; null until at
     *  least one priced response lands so the dock can render
     *  "estimating" vs. a real number. */
    totalCostUsd: number | null
    /** Last item_start title shown next to the spinner. */
    currentTitle: string
    /** Per-item rows accumulated for the expanded modal view. */
    items: BulkFillItem[]
    /** Raw event log; primarily useful for tests + the audit
     *  view. The dock + modal usually consume ``items``. */
    events: BulkAiFillEvent[]
    errorMessage: string | null
    /** True when the user has the modal open; false when the
     *  dock is the only visible surface. */
    modalOpen: boolean
    start: (jobId: string, kind: BulkFillKind) => void
    clear: () => void
    minimize: () => void
    expand: () => void
}

export interface BulkFillItem {
    id: string
    index: number
    title?: string
    /** Terminal status for the item. ``running`` while item_start
     *  fired but neither item_done nor item_error has yet. */
    status: "running" | "done" | "skipped" | "error"
    updatedFields?: string[]
    skippedFields?: string[]
    tokens?: number
    costUsd?: number | null
    error?: string
    skipReason?: string
    /** Number of dropped chapter_summaries (book only). */
    droppedSummaries?: number
}

const BulkAiFillJobContext = createContext<BulkAiFillJobContextValue | null>(null)

const STORAGE_KEY = "bibliogon.bulk_ai_fill_job"

interface PersistedJob {
    jobId: string
    kind: BulkFillKind
}

function loadPersisted(): PersistedJob | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as PersistedJob
        if (!parsed.jobId || (parsed.kind !== "article" && parsed.kind !== "book")) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

function savePersisted(job: PersistedJob | null) {
    try {
        if (job === null) {
            localStorage.removeItem(STORAGE_KEY)
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(job))
        }
    } catch {
        /* quota exceeded etc; in-memory state still works */
    }
}

function streamUrlFor(kind: BulkFillKind, jobId: string): string {
    return kind === "article"
        ? api.articles.bulkAiFill.streamUrl(jobId)
        : api.books.bulkAiFill.streamUrl(jobId)
}

export function BulkAiFillJobProvider({children}: {children: ReactNode}) {
    const [jobId, setJobId] = useState<string | null>(null)
    const [kind, setKind] = useState<BulkFillKind | null>(null)
    const [modalOpen, setModalOpen] = useState<boolean>(false)

    const [phase, setPhase] = useState<BulkFillPhase>("idle")
    const [total, setTotal] = useState<number>(0)
    const [completed, setCompleted] = useState<number>(0)
    const [itemsUpdated, setItemsUpdated] = useState<number>(0)
    const [totalTokens, setTotalTokens] = useState<number>(0)
    const [totalCostUsd, setTotalCostUsd] = useState<number | null>(null)
    const [currentTitle, setCurrentTitle] = useState<string>("")
    const [items, setItems] = useState<BulkFillItem[]>([])
    const [events, setEvents] = useState<BulkAiFillEvent[]>([])
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const eventSourceRef = useRef<EventSource | null>(null)

    const resetState = useCallback(() => {
        setPhase("idle")
        setTotal(0)
        setCompleted(0)
        setItemsUpdated(0)
        setTotalTokens(0)
        setTotalCostUsd(null)
        setCurrentTitle("")
        setItems([])
        setEvents([])
        setErrorMessage(null)
    }, [])

    const closeStream = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }
    }, [])

    const upsertItem = useCallback(
        (id: string, patch: Partial<BulkFillItem>) => {
            setItems((prev) => {
                const idx = prev.findIndex((i) => i.id === id)
                if (idx === -1) {
                    return [...prev, {id, index: -1, status: "running", ...patch}]
                }
                const next = prev.slice()
                next[idx] = {...next[idx], ...patch}
                return next
            })
        },
        [],
    )

    const openStream = useCallback(
        (id: string, k: BulkFillKind) => {
            closeStream()
            setPhase("connecting")
            const es = new EventSource(streamUrlFor(k, id))
            eventSourceRef.current = es

            es.onopen = () => {
                setPhase((p) => (p === "connecting" ? "running" : p))
            }

            es.onmessage = (e) => {
                let ev: BulkAiFillEvent
                try {
                    ev = JSON.parse(e.data) as BulkAiFillEvent
                } catch {
                    return
                }
                setEvents((prev) => [...prev, ev])

                switch (ev.type) {
                    case "start": {
                        setTotal(ev.data.total)
                        setPhase("running")
                        break
                    }
                    case "item_start": {
                        const d = ev.data
                        setCurrentTitle(d.title || "")
                        upsertItem(d.id, {
                            id: d.id,
                            index: d.index,
                            title: d.title,
                            status: "running",
                        })
                        break
                    }
                    case "item_done": {
                        const d = ev.data
                        setCompleted((c) => Math.max(c, d.index + 1))
                        if (d.updated_fields.length > 0) {
                            setItemsUpdated((u) => u + 1)
                        }
                        setTotalTokens((t) => t + d.tokens)
                        if (d.cost_usd != null) {
                            setTotalCostUsd((c) =>
                                c == null ? d.cost_usd : (c as number) + (d.cost_usd as number),
                            )
                        }
                        upsertItem(d.id, {
                            index: d.index,
                            status: "done",
                            updatedFields: d.updated_fields,
                            skippedFields: d.skipped_fields,
                            tokens: d.tokens,
                            costUsd: d.cost_usd,
                            droppedSummaries: d.dropped_chapter_summaries?.length,
                        })
                        break
                    }
                    case "item_skipped": {
                        const d = ev.data
                        setCompleted((c) => Math.max(c, d.index + 1))
                        upsertItem(d.id, {
                            id: d.id,
                            index: d.index,
                            status: "skipped",
                            skipReason: d.reason,
                        })
                        break
                    }
                    case "item_error": {
                        const d = ev.data
                        setCompleted((c) => Math.max(c, d.index + 1))
                        upsertItem(d.id, {
                            id: d.id,
                            index: d.index,
                            status: "error",
                            error: d.error,
                        })
                        break
                    }
                    case "done": {
                        // Totals from the synthetic done event are authoritative; the
                        // backend may have post-processing that differs slightly from
                        // the per-item sum (e.g. retried calls). Overwrite.
                        setTotalTokens(ev.data.total_tokens)
                        if (ev.data.total_cost_usd != null) {
                            setTotalCostUsd(ev.data.total_cost_usd)
                        }
                        setItemsUpdated(ev.data.items_updated)
                        break
                    }
                    case "stream_end": {
                        const status = ev.data.status
                        if (status === "failed") {
                            setPhase("failed")
                            if (typeof ev.data.error === "string")
                                setErrorMessage(ev.data.error)
                        } else if (status === "cancelled") {
                            setPhase("cancelled")
                        } else {
                            setPhase("completed")
                        }
                        closeStream()
                        savePersisted(null)
                        break
                    }
                }
            }

            es.onerror = () => {
                setPhase((p) => (p === "connecting" ? "failed" : p))
            }
        },
        [closeStream, upsertItem],
    )

    const start = useCallback(
        (id: string, k: BulkFillKind) => {
            closeStream()
            resetState()
            setJobId(id)
            setKind(k)
            setModalOpen(true)
            savePersisted({jobId: id, kind: k})
            openStream(id, k)
        },
        [closeStream, openStream, resetState],
    )

    const clear = useCallback(() => {
        closeStream()
        resetState()
        setJobId(null)
        setKind(null)
        setModalOpen(false)
        savePersisted(null)
    }, [closeStream, resetState])

    const minimize = useCallback(() => setModalOpen(false), [])
    const expand = useCallback(() => setModalOpen(true), [])

    // F5 recovery: on mount, look at localStorage. If a previous
    // session left a job behind, reconnect with the dock visible
    // (modal stays minimized so we don't pop a dialog in the
    // user's face after they refreshed).
    useEffect(() => {
        const persisted = loadPersisted()
        if (persisted && !jobId) {
            setJobId(persisted.jobId)
            setKind(persisted.kind)
            setModalOpen(false)
            openStream(persisted.jobId, persisted.kind)
        }
        return () => {
            closeStream()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const value = useMemo<BulkAiFillJobContextValue>(
        () => ({
            active: jobId !== null,
            jobId,
            kind,
            phase,
            total,
            completed,
            itemsUpdated,
            totalTokens,
            totalCostUsd,
            currentTitle,
            items,
            events,
            errorMessage,
            modalOpen,
            start,
            clear,
            minimize,
            expand,
        }),
        [
            jobId,
            kind,
            phase,
            total,
            completed,
            itemsUpdated,
            totalTokens,
            totalCostUsd,
            currentTitle,
            items,
            events,
            errorMessage,
            modalOpen,
            start,
            clear,
            minimize,
            expand,
        ],
    )

    return (
        <BulkAiFillJobContext.Provider value={value}>
            {children}
        </BulkAiFillJobContext.Provider>
    )
}

export function useBulkAiFillJob(): BulkAiFillJobContextValue {
    const ctx = useContext(BulkAiFillJobContext)
    if (!ctx) {
        throw new Error(
            "useBulkAiFillJob must be used inside BulkAiFillJobProvider",
        )
    }
    return ctx
}

// Re-export the storage key so tests can drive the F5-recovery
// path without depending on the literal.
export const BULK_AI_FILL_STORAGE_KEY = STORAGE_KEY
